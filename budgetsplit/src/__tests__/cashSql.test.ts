import { DatabaseSync } from 'node:sqlite';
import { CASH_TOTALS_SQL } from '../db/queries/cashQuery';
import { computeCash, cashPositionFromTotals, type CashTxn, type CashTotals } from '../lib/cash';

// Proves the SQL-aggregated cash path (getCashPosition → CASH_TOTALS_SQL) produces
// exactly the same CashPosition as the JS reducer computeCash() over the same data.
// Runs against a real in-process SQLite (node:sqlite), so it exercises the actual SQL.

const ME = 'me';
const CUTOFF = 1_000_000; // arbitrary "now"

type Split = { person: string; amount: number };
type Fixture = {
  id: string;
  kind: string;
  is_deleted: 0 | 1;
  recur_freq: string | null;
  date: number;
  payments: Split[];
  shares: Split[];
};

function makeDb(fixtures: Fixture[]): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE txn (
      id TEXT PRIMARY KEY, group_id TEXT, kind TEXT, is_deleted INTEGER,
      recur_freq TEXT, date INTEGER
    );
    CREATE TABLE txn_payment (txn_id TEXT, person_id TEXT, amount INTEGER, PRIMARY KEY (txn_id, person_id));
    CREATE TABLE txn_share   (txn_id TEXT, person_id TEXT, amount INTEGER, PRIMARY KEY (txn_id, person_id));
  `);
  const insTxn = db.prepare('INSERT INTO txn (id, group_id, kind, is_deleted, recur_freq, date) VALUES (?,?,?,?,?,?)');
  const insPay = db.prepare('INSERT INTO txn_payment (txn_id, person_id, amount) VALUES (?,?,?)');
  const insShare = db.prepare('INSERT INTO txn_share (txn_id, person_id, amount) VALUES (?,?,?)');
  for (const f of fixtures) {
    insTxn.run(f.id, 'g1', f.kind, f.is_deleted, f.recur_freq, f.date);
    for (const p of f.payments) insPay.run(f.id, p.person, p.amount);
    for (const s of f.shares) insShare.run(f.id, s.person, s.amount);
  }
  return db;
}

function sqlTotals(db: DatabaseSync, meId: string, cutoff: number): CashTotals {
  const row = db.prepare(CASH_TOTALS_SQL).get(meId, meId, cutoff) as Record<string, number>;
  return {
    income: Number(row.income),
    paidExpenses: Number(row.paidExpenses),
    settledOut: Number(row.settledOut),
    settledIn: Number(row.settledIn),
  };
}

// The JS side receives only the rows getTransactionsInRange would return
// (non-deleted, non-recurring, in range) — exactly what CASH_TOTALS_SQL filters on.
function toCashTxns(fixtures: Fixture[], cutoff: number): CashTxn[] {
  return fixtures
    .filter(f => !f.is_deleted && f.recur_freq == null && f.date <= cutoff)
    .map(f => ({
      kind: f.kind,
      is_deleted: 0,
      payments: f.payments.map(p => ({ personId: p.person, amount: p.amount })),
      shares: f.shares.map(s => ({ personId: s.person, amount: s.amount })),
    }));
}

function assertParity(fixtures: Fixture[], savings: number, opening: number) {
  const db = makeDb(fixtures);
  try {
    const viaSql = cashPositionFromTotals(sqlTotals(db, ME, CUTOFF), savings, opening);
    const viaJs = computeCash(toCashTxns(fixtures, CUTOFF), ME, savings, opening);
    expect(viaSql).toEqual(viaJs);
  } finally {
    db.close();
  }
}

describe('CASH_TOTALS_SQL parity with computeCash', () => {
  it('matches across income, expenses, settlements (both directions) and other people', () => {
    const fixtures: Fixture[] = [
      { id: 't1', kind: 'income',     is_deleted: 0, recur_freq: null, date: 100, payments: [{ person: ME, amount: 50000 }], shares: [] },
      { id: 't2', kind: 'expense',    is_deleted: 0, recur_freq: null, date: 200, payments: [{ person: ME, amount: 3000 }], shares: [{ person: ME, amount: 1000 }, { person: 'a', amount: 2000 }] },
      { id: 't3', kind: 'settlement', is_deleted: 0, recur_freq: null, date: 300, payments: [{ person: 'a', amount: 2000 }], shares: [{ person: ME, amount: 2000 }] }, // settled IN to me
      { id: 't4', kind: 'settlement', is_deleted: 0, recur_freq: null, date: 400, payments: [{ person: ME, amount: 800 }], shares: [{ person: 'b', amount: 800 }] },   // settled OUT by me
      { id: 't5', kind: 'expense',    is_deleted: 0, recur_freq: null, date: 500, payments: [{ person: 'a', amount: 900 }], shares: [{ person: 'a', amount: 900 }] },   // not mine at all
    ];
    assertParity(fixtures, 12000, 25000);
  });

  it('excludes deleted, recurring templates, and out-of-range txns', () => {
    const fixtures: Fixture[] = [
      { id: 'd1', kind: 'expense',    is_deleted: 1, recur_freq: null,      date: 100, payments: [{ person: ME, amount: 5000 }], shares: [{ person: ME, amount: 5000 }] },
      { id: 'r1', kind: 'expense',    is_deleted: 0, recur_freq: 'monthly', date: 100, payments: [{ person: ME, amount: 7000 }], shares: [{ person: ME, amount: 7000 }] },
      { id: 'f1', kind: 'income',     is_deleted: 0, recur_freq: null,      date: CUTOFF + 1, payments: [{ person: ME, amount: 9000 }], shares: [] },
      { id: 'ok', kind: 'expense',    is_deleted: 0, recur_freq: null,      date: CUTOFF, payments: [{ person: ME, amount: 1500 }], shares: [{ person: ME, amount: 1500 }] },
    ];
    assertParity(fixtures, 0, 0);
  });

  it('handles empty data', () => {
    assertParity([], 3000, 4000);
  });

  it('matches on randomized fixtures (fuzz)', () => {
    const kinds = ['income', 'expense', 'settlement'];
    const people = [ME, 'a', 'b', 'c'];
    // Deterministic LCG so the test is reproducible.
    let seed = 987654321;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

    for (let run = 0; run < 40; run++) {
      const fixtures: Fixture[] = [];
      const count = Math.floor(rand() * 12);
      for (let i = 0; i < count; i++) {
        // At most one payment/share row per person (composite PK in reality).
        const payers = people.filter(() => rand() < 0.5).slice(0, 2);
        const sharers = people.filter(() => rand() < 0.5).slice(0, 2);
        fixtures.push({
          id: `r${run}_${i}`,
          kind: pick(kinds),
          is_deleted: rand() < 0.15 ? 1 : 0,
          recur_freq: rand() < 0.15 ? 'weekly' : null,
          date: Math.floor(rand() * (CUTOFF * 1.2)),
          payments: payers.map(p => ({ person: p, amount: Math.floor(rand() * 10000) })),
          shares: sharers.map(p => ({ person: p, amount: Math.floor(rand() * 10000) })),
        });
      }
      assertParity(fixtures, Math.floor(rand() * 5000), Math.floor(rand() * 5000));
    }
  });
});
