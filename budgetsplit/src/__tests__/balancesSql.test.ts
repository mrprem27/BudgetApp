import { DatabaseSync } from 'node:sqlite';
import {
  BALANCE_TXN_FILTER, CROSS_GROUP_FILTER,
  GLOBAL_PAYMENTS_SQL, GLOBAL_SHARES_SQL, GROUP_PAYMENTS_SQL, GROUP_SHARES_SQL,
} from '../db/queries/balances';
import { simplify } from '../lib/settle';

// Runs the REAL balance SQL against in-process SQLite, the way `cashSql.test.ts` does for
// the cash path. Both bugs these cover were invisible to the whole suite because nothing
// executed this SQL — the aggregates were only ever reached through `expo-sqlite`, which
// jest stubs.

const ME = 'me';

type Split = { person: string; amount: number };
type Fixture = {
  id: string;
  group: string;
  kind?: string;
  is_deleted?: 0 | 1;
  recur_freq?: string | null;
  payments?: Split[];
  shares?: Split[];
};

/** `personal` is the one group with `is_personal = 1`. */
function makeDb(fixtures: Fixture[]): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE budget_group (id TEXT PRIMARY KEY, is_personal INTEGER);
    CREATE TABLE txn (
      id TEXT PRIMARY KEY, group_id TEXT, kind TEXT, is_deleted INTEGER, recur_freq TEXT
    );
    CREATE TABLE txn_payment (txn_id TEXT, person_id TEXT, amount INTEGER);
    CREATE TABLE txn_share (txn_id TEXT, person_id TEXT, amount INTEGER);
    INSERT INTO budget_group VALUES ('personal', 1), ('flat', 0), ('trip', 0);
  `);
  for (const f of fixtures) {
    db.prepare('INSERT INTO txn VALUES (?,?,?,?,?)').run(
      f.id, f.group, f.kind ?? 'expense', f.is_deleted ?? 0, f.recur_freq ?? null,
    );
    for (const p of f.payments ?? []) {
      db.prepare('INSERT INTO txn_payment VALUES (?,?,?)').run(f.id, p.person, p.amount);
    }
    for (const s of f.shares ?? []) {
      db.prepare('INSERT INTO txn_share VALUES (?,?,?)').run(f.id, s.person, s.amount);
    }
  }
  return db;
}

type Row = { person_id: string; total: number };

function netFrom(db: DatabaseSync, paySql: string, shareSql: string, args: string[] = []) {
  const net: Record<string, number> = {};
  for (const r of db.prepare(paySql).all(...args) as unknown as Row[]) {
    net[r.person_id] = (net[r.person_id] ?? 0) + r.total;
  }
  for (const r of db.prepare(shareSql).all(...args) as unknown as Row[]) {
    net[r.person_id] = (net[r.person_id] ?? 0) - r.total;
  }
  return net;
}

const globalNet = (db: DatabaseSync) => netFrom(db, GLOBAL_PAYMENTS_SQL, GLOBAL_SHARES_SQL);
const groupNet = (db: DatabaseSync, g: string) =>
  netFrom(db, GROUP_PAYMENTS_SQL, GROUP_SHARES_SQL, [g]);

describe('balance SQL', () => {
  it('ignores a one-sided personal settlement entirely', () => {
    // The bug: `reviewCommit` books a personal settlement one-sided on purpose (a share with
    // no payment for inbound), because `computeCash` does `− settledOut + settledIn` and
    // booking both sides would net to zero and hide the movement. With no `is_personal`
    // filter that unmatched row entered the global net as `me: -10000`, and `simplify` then
    // paired me as a debtor against whichever friend held a positive balance — announcing a
    // debt to someone I had never transacted with. Reachable from a bank import.
    const db = makeDb([
      // Flat: I paid 600, split 300 each. Priya owes me 300.
      { id: 't1', group: 'flat', payments: [{ person: ME, amount: 600 }], shares: [{ person: ME, amount: 300 }, { person: 'priya', amount: 300 }] },
      // "Money received from Rahul ₹10,000", committed to Personal. One side only.
      { id: 't2', group: 'personal', kind: 'settlement', shares: [{ person: ME, amount: 10000 }] },
    ]);

    expect(globalNet(db)).toEqual({ [ME]: 300, priya: -300 });

    // And the thing the user actually saw: nobody is owed 10,000.
    const settlements = simplify(globalNet(db));
    expect(settlements).toEqual([{ from: 'priya', to: ME, amount: 300 }]);
  });

  it('counts a recurring rule once, not once per occurrence plus the template', () => {
    // A rule is an ordinary txn row carrying its own payment/share rows, so without
    // `recur_freq IS NULL` the template was counted alongside every occurrence it spawned —
    // permanently, since the template never goes away.
    const shared = {
      group: 'flat',
      payments: [{ person: ME, amount: 1000 }],
      shares: [{ person: ME, amount: 500 }, { person: 'priya', amount: 500 }],
    };
    const db = makeDb([
      { id: 'rule', recur_freq: 'monthly', ...shared },
      { id: 'occ1', ...shared },
      { id: 'occ2', ...shared },
    ]);

    // Two real occurrences → Priya owes 1000. Not 1500.
    expect(globalNet(db)).toEqual({ [ME]: 1000, priya: -1000 });
    expect(groupNet(db, 'flat')).toEqual({ [ME]: 1000, priya: -1000 });
  });

  it('still excludes deleted rows and income', () => {
    const db = makeDb([
      { id: 'a', group: 'flat', is_deleted: 1, payments: [{ person: ME, amount: 900 }] },
      { id: 'b', group: 'flat', kind: 'income', payments: [{ person: ME, amount: 900 }] },
    ]);
    expect(globalNet(db)).toEqual({});
  });

  it('keeps per-group balances scoped, and personal out of the cross-group view only', () => {
    const db = makeDb([
      { id: 't1', group: 'flat', payments: [{ person: ME, amount: 400 }], shares: [{ person: 'priya', amount: 400 }] },
      { id: 't2', group: 'trip', payments: [{ person: 'priya', amount: 200 }], shares: [{ person: ME, amount: 200 }] },
    ]);
    expect(groupNet(db, 'flat')).toEqual({ [ME]: 400, priya: -400 });
    expect(groupNet(db, 'trip')).toEqual({ priya: 200, [ME]: -200 });
    // Netted across both.
    expect(globalNet(db)).toEqual({ [ME]: 200, priya: -200 });
  });

  it('always nets to zero across everyone', () => {
    // The invariant that would have caught both bugs on day one: every paise someone paid is
    // a paise someone owes, so a cross-group net must sum to exactly 0. The pre-fix SQL
    // returned `{me: -8700, priya: -1300}` — BOTH negative, summing to −10000. Money owed by
    // everyone to nobody is not a rounding problem, it is a missing filter.
    const db = makeDb([
      { id: 't1', group: 'flat', payments: [{ person: ME, amount: 600 }], shares: [{ person: ME, amount: 300 }, { person: 'priya', amount: 300 }] },
      { id: 't2', group: 'personal', kind: 'settlement', shares: [{ person: ME, amount: 10000 }] },
      { id: 'rule', group: 'flat', recur_freq: 'monthly', payments: [{ person: ME, amount: 1000 }], shares: [{ person: ME, amount: 500 }, { person: 'priya', amount: 500 }] },
      { id: 'occ1', group: 'flat', payments: [{ person: ME, amount: 1000 }], shares: [{ person: ME, amount: 500 }, { person: 'priya', amount: 500 }] },
      { id: 't3', group: 'trip', payments: [{ person: 'priya', amount: 250 }], shares: [{ person: 'raj', amount: 250 }] },
    ]);
    const total = Object.values(globalNet(db)).reduce((a, b) => a + b, 0);
    expect(total).toBe(0);
  });

  it('shares one filter across all four aggregates', () => {
    // The drift came from four hand-written copies; this is what stops a fifth.
    for (const sql of [GROUP_PAYMENTS_SQL, GROUP_SHARES_SQL, GLOBAL_PAYMENTS_SQL, GLOBAL_SHARES_SQL]) {
      expect(sql).toContain(BALANCE_TXN_FILTER);
    }
    // Cross-group only: a per-group net is scoped to a group the caller named.
    expect(GLOBAL_PAYMENTS_SQL).toContain(CROSS_GROUP_FILTER);
    expect(GLOBAL_SHARES_SQL).toContain(CROSS_GROUP_FILTER);
    expect(GROUP_PAYMENTS_SQL).not.toContain(CROSS_GROUP_FILTER);
    expect(GROUP_SHARES_SQL).not.toContain(CROSS_GROUP_FILTER);
  });
});
