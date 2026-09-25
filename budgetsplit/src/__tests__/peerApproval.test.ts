import {
  approveTxn, rejectTxn, reopenApproval, getPendingApprovalCount, getPendingApprovals, getApproval, disputesFor,
} from '../db/queries/approval';
import { setServerVersion } from '../db/queries/syncQueue';
import { getMyExposure } from '../db/queries/balances';
import { getCashPosition, proposeOverspendRaid } from '../db/queries/savings';
import {
  getTransactionsForGroup, getLedgerStats, updateTxn, getActiveRecurringRules, insertTxn,
  softDeleteTxn, PeerEntryError,
} from '../db/queries/transactions';
import { materializeDueOccurrences } from '../db/queries/recurring';
import { PayMethod } from '../constants/enums';
import { getMyGlobalBudgetSummary } from '../lib/budget';
import {
  createTestDb, addPerson, addGroup, addMember, addCategory, addPeerTxn, setCategoryBudget, asDb, type TestDb,
} from './helpers/testDb';

/**
 * The test that IS the feature.
 *
 * An entry someone else wrote and I have not accepted must be visible in the
 * group ledger — the group agrees on what happened — while moving **none** of my
 * numbers. Not one. A figure that moves while the others do not is worse than all
 * of them moving, because then the app contradicts itself and there is no way for
 * a user to tell which number to believe.
 *
 * So this asserts every figure a peer entry could plausibly reach, before and
 * after, rather than spot-checking two of them.
 *
 * Whether an entry waits at all — trust, the transfer rule, a rule's occurrences
 * inheriting its decision, an edit re-opening an approval — is the server's call
 * over server sync, and `approvals.test.ts` drives it end to end. What is left on the
 * phone, and tested here, is what a waiting entry does to my figures and what my
 * decision does to it. The entries are fixtures in exactly the shape the pull
 * writes: the row with its author, and my `txn_approval` row.
 */

const BILL = 4_000_00;   // ₹4,000, paid by them
const MY_SHARE = 2_000_00;

/** Me + Aarav in a shared flat. Aarav has an account; I have not trusted him. */
async function setup(opts: { trusted?: boolean } = {}) {
  const db = createTestDb();
  const me = addPerson(db, 'Me', true);
  const aarav = addPerson(db, 'Aarav', false);
  db.raw.prepare('UPDATE person SET remote_uid = ?, trust_state = ? WHERE id = ?')
    .run('acct-aarav', opts.trusted ? 'trusted' : 'review', aarav);

  const personal = addGroup(db, 'Personal', true);
  addMember(db, personal, me);
  const flat = addGroup(db, 'Flat');
  addMember(db, flat, me);
  addMember(db, flat, aarav);

  await db.runAsync(`INSERT INTO settings (key, value) VALUES ('money.opening_cash', ?)`, ['5000000']);
  return { db, me, aarav, flat, personal };
}

/** Aarav's ₹4,000 dinner, which he paid for and split with me. */
function dinner(
  db: TestDb,
  s: { flat: string; me: string; aarav: string },
  approval: 'pending' | 'approved' | 'rejected' | undefined = 'pending',
  patch: Partial<Parameters<typeof addPeerTxn>[1]> = {},
) {
  return addPeerTxn(db, {
    author: s.aarav, groupId: s.flat, kind: 'expense', date: Date.now(), category: 'Food',
    payments: [{ personId: s.aarav, amount: BILL }],
    shares: [{ personId: s.me, amount: MY_SHARE }, { personId: s.aarav, amount: MY_SHARE }],
    approval,
    ...patch,
  });
}

/** Aarav says he paid me ₹4,000 back. */
function arrival(db: TestDb, s: { flat: string; me: string; aarav: string }, patch: Partial<Parameters<typeof addPeerTxn>[1]> = {}) {
  return addPeerTxn(db, {
    author: s.aarav, groupId: s.flat, kind: 'settlement', date: Date.now(), category: 'Settlement',
    payments: [{ personId: s.aarav, amount: BILL }],
    shares: [{ personId: s.me, amount: BILL }],
    approval: 'pending',
    ...patch,
  });
}

/** My answer as it waits to go up — the snapshot IS the mutation. */
async function queuedAnswer(db: TestDb, txnId: string) {
  const row = await db.getFirstAsync<{ snapshot: string }>(
    "SELECT snapshot FROM sync_queue WHERE local_table = 'txn_approval' AND local_id = ?", [txnId],
  );
  return row ? JSON.parse(row.snapshot) as Record<string, unknown> : null;
}

/** Every number a peer entry could plausibly reach. */
async function snapshot(db: TestDb, me: string) {
  const d = asDb(db);
  const [exposure, cash, budget, stats] = await Promise.all([
    getMyExposure(d, me),
    getCashPosition(d),
    getMyGlobalBudgetSummary(d, me, { target: 'monthly' }),
    getLedgerStats(d),
  ]);
  const raid = await proposeOverspendRaid(d);
  return {
    owe: exposure.owe,
    owed: exposure.owed,
    owedExpected: exposure.owedExpected,
    cashAvailable: cash.available,
    budgetSpent: budget.spent,
    budgetSharedSpent: budget.spentShared,
    txnCount: stats.txnCount,
    firstTxnMs: stats.firstTxnMs,
    raidTotal: raid.total,
  };
}

describe('a peer entry waiting on me', () => {
  it('moves not one of my numbers, and still shows in the group ledger', async () => {
    const s = await setup();
    addCategory(s.db, 'Food');
    // The global cap lives on the Personal group — that is what
    // `getMyGlobalBudgetSummary` reads. The spend it measures is my share across
    // every group, which is exactly why a peer entry could reach it.
    setCategoryBudget(s.db, { groupId: s.personal, category: 'Food', amount: 1000000 });

    const before = await snapshot(s.db, s.me);
    dinner(s.db, s);

    // The whole claim, in one assertion.
    expect(await snapshot(s.db, s.me)).toEqual(before);

    // ...and yet it is not hidden. The group has to agree on what happened.
    const ledger = await getTransactionsForGroup(asDb(s.db), s.flat);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].pendingApproval).toBe(true);
    expect(await getPendingApprovalCount(asDb(s.db))).toBe(1);
  });

  it('moves every one of them the moment I approve', async () => {
    const s = await setup();
    addCategory(s.db, 'Food');
    setCategoryBudget(s.db, { groupId: s.personal, category: 'Food', amount: 1000000 });

    const before = await snapshot(s.db, s.me);
    const id = dinner(s.db, s);
    await approveTxn(asDb(s.db), id);

    const after = await snapshot(s.db, s.me);
    // I consumed ₹2,000 and paid nothing, so I owe ₹2,000 and my cash is untouched.
    expect(after.owe).toBe(before.owe + MY_SHARE);
    expect(after.cashAvailable).toBe(before.cashAvailable);
    expect(after.budgetSpent).toBe(before.budgetSpent + MY_SHARE);
    expect(after.budgetSharedSpent).toBe(before.budgetSharedSpent + MY_SHARE);
    expect(after.txnCount).toBe(before.txnCount + 1);
    expect(await getPendingApprovalCount(asDb(s.db))).toBe(0);
    expect((await getTransactionsForGroup(asDb(s.db), s.flat))[0].pendingApproval).toBe(false);
    // And the author has to hear it, or their screen keeps asking me forever.
    expect(await queuedAnswer(s.db, id)).toEqual({ status: 'approved' });
  });

  it('never counts once I reject it, and my refusal is on its way to them', async () => {
    const s = await setup();
    const before = await snapshot(s.db, s.me);
    const id = dinner(s.db, s);

    await rejectTxn(asDb(s.db), id);
    expect(await snapshot(s.db, s.me)).toEqual(before);
    // Gone from the ledger too — I have said this did not happen.
    expect(await getTransactionsForGroup(asDb(s.db), s.flat)).toHaveLength(0);
    expect(await getPendingApprovalCount(asDb(s.db))).toBe(0);

    // The decision is kept, so a later pull does not re-ask a decided question,
    // and it is queued as an ANSWER — the server turns it into their dispute.
    expect((await getApproval(asDb(s.db), id))?.state).toBe('rejected');
    expect(await queuedAnswer(s.db, id)).toEqual({ status: 'rejected' });
  });

  /**
   * I can refuse an entry somebody else wrote. I cannot rewrite it.
   *
   * Nothing gated this, so a peer's ₹4,000 dinner could be quietly edited down to
   * ₹400 here — my copy disagreeing with theirs permanently, with no version bump
   * on their side to reconcile it and nothing to tell either of us. The honest
   * answers are approve and reject, and both exist.
   *
   * (The reason `txn_approval` is its own table is the same edit: `updateTxn`
   * DELETEs and re-INSERTs every share and payment row, so an approval stored on
   * those would vanish and the entry would silently start counting.)
   */
  it('cannot be edited at all — only accepted or refused', async () => {
    const s = await setup();
    const before = await snapshot(s.db, s.me);
    const id = dinner(s.db, s);

    await expect(updateTxn(asDb(s.db), {
      id, groupId: s.flat, kind: 'expense', date: Date.now(), category: 'Food',
      payments: [{ personId: s.aarav, amount: BILL }],
      shares: [{ personId: s.me, amount: MY_SHARE }, { personId: s.aarav, amount: MY_SHARE }],
    })).rejects.toThrow(PeerEntryError);

    // Refused means untouched: still waiting, and still moving none of my numbers.
    expect(await getPendingApprovalCount(asDb(s.db))).toBe(1);
    expect(await snapshot(s.db, s.me)).toEqual(before);
  });

  it('cannot be swiped away either — that is what refusing is for', async () => {
    const s = await setup();
    const id = dinner(s.db, s);

    await expect(softDeleteTxn(asDb(s.db), id)).rejects.toThrow(PeerEntryError);
    expect(await s.db.getFirstAsync('SELECT is_deleted FROM txn WHERE id = ?', [id]))
      .toEqual({ is_deleted: 0 });

    // ...and the labelled path still works, and still tells them.
    await rejectTxn(asDb(s.db), id);
    expect(await s.db.getFirstAsync('SELECT is_deleted FROM txn WHERE id = ?', [id]))
      .toEqual({ is_deleted: 1 });
    expect(await queuedAnswer(s.db, id)).toEqual({ status: 'rejected' });
  });
});

describe('a peer entry cannot reach the savings raid', () => {
  it('proposes no withdrawal while it is only a claim', async () => {
    const s = await setup();
    // A goal holding everything, so any real shortfall would liquidate it.
    await s.db.runAsync(
      `INSERT INTO savings_goal (id, name, target, priority, allocation, frequency, locked, is_archived, sort_order, created_at)
       VALUES ('g1', 'Phone', 9000000, 'want', 0, 'none', 0, 0, 0, 0)`,
    );
    await s.db.runAsync(
      `INSERT INTO savings_txn (id, goal_id, amount, kind, source, date, created_at)
       VALUES ('s1', 'g1', 5000000, 'allocate', 'manual', 0, 0)`,
    );

    // A peer entry naming ME as the payer — the "someone says I paid" attack, and
    // the only shape that could drive my cash negative on someone else's say-so.
    dinner(s.db, s, 'pending', { payments: [{ personId: s.me, amount: BILL }] });

    expect((await proposeOverspendRaid(asDb(s.db))).total).toBe(0);
    expect((await getCashPosition(asDb(s.db))).available).toBe(0);
  });
});

describe('a transfer I have to confirm', () => {
  /**
   * The sender says how they sent it, but only the recipient knows where it
   * landed — sent by UPI, arrived in a bank account. That is my side of their
   * claim, and it has to reach both my ledger and the server.
   */
  it('records where it actually landed, not where they said they sent it', async () => {
    const s = await setup({ trusted: true });
    const id = arrival(s.db, s, { payMethod: 'upi' });   // how they sent it

    await approveTxn(asDb(s.db), id, PayMethod.Bank);      // where it arrived

    const approval = await getApproval(asDb(s.db), id);
    expect(approval?.landed_pay_method).toBe('bank');
    // Applied to the entry too, so the ledger acts on my side's truth.
    const row = await s.db.getFirstAsync<{ pay_method: string }>(
      'SELECT pay_method FROM txn WHERE id = ?', [id],
    );
    expect(row?.pay_method).toBe('bank');
    // And it travels with the answer, since the local row cannot carry it up.
    expect(await queuedAnswer(s.db, id)).toEqual({ status: 'approved', landed_pay_method: 'bank' });
  });

  it('is not swept up by trusting the author', async () => {
    // Trusting someone clears their expenses. It must not clear their claim that
    // they have paid you — that is the one thing trust cannot answer.
    const s = await setup();
    dinner(s.db, s);     // an expense
    arrival(s.db, s);    // and an arrival
    expect(await getPendingApprovalCount(asDb(s.db))).toBe(2);

    // What `trustAuthor` does: flip the state, then approve everything except
    // money arriving.
    await s.db.runAsync("UPDATE person SET trust_state = 'trusted' WHERE id = ?", [s.aarav]);
    const pending = await getPendingApprovals(asDb(s.db));
    for (const a of pending) {
      const t = await s.db.getFirstAsync<{ kind: string }>('SELECT kind FROM txn WHERE id = ?', [a.txn_id]);
      if (t?.kind !== 'settlement') await approveTxn(asDb(s.db), a.txn_id);
    }
    expect(await getPendingApprovalCount(asDb(s.db))).toBe(1);
  });
});

describe('a peer recurring rule', () => {
  const rule = (db: TestDb, s: { flat: string; me: string; aarav: string }, approval: 'pending' | 'approved') =>
    dinner(db, s, approval, { recurFreq: 'monthly', date: Date.now() - 90 * 86400000 });   // started three months ago

  /**
   * The loudest possible version of the thing this model exists to stop: a rule
   * nobody accepted, quietly posting an occurrence every month.
   */
  it('spawns nothing at all while it waits', async () => {
    const s = await setup();
    const before = await snapshot(s.db, s.me);
    rule(s.db, s, 'pending');

    const made = await materializeDueOccurrences(asDb(s.db));
    expect(made).toBe(0);
    expect(await snapshot(s.db, s.me)).toEqual(before);
  });

  /**
   * Only the rule's AUTHOR posts its occurrences.
   *
   * Approving a peer's rule used to make this device start materializing it —
   * and so did theirs, because a rule travels to everyone. Both phones woke on
   * the 1st, each minted its own uuid for the same month, each queued it, and
   * each received the other's. A ₹30,000 shared rent rule posted ₹60,000 every
   * month, forever, and nothing on either screen explained it.
   */
  it('never posts a peer rule from this device, approved or not', async () => {
    const s = await setup();
    const id = rule(s.db, s, 'pending');
    await approveTxn(asDb(s.db), id);

    expect(await materializeDueOccurrences(asDb(s.db))).toBe(0);
  });

  it('is not announced as a committed bill while it waits', async () => {
    // "Coming up", reminders and the forecast all read getActiveRecurringRules.
    // A rule I have not accepted is a proposal, not a bill.
    const s = await setup();
    rule(s.db, s, 'pending');
    expect(await getActiveRecurringRules(asDb(s.db))).toHaveLength(0);
  });
});

/**
 * A rule can post itself, or wait to be logged. The difference matters most for
 * money that has to ARRIVE: a salary silently recorded on the 1st, that never
 * actually landed, moves every figure in the app without telling anyone.
 */
describe('recur_mode', () => {
  async function ruleFor(kind: 'expense' | 'income', mode: 'auto' | 'remind') {
    const { db, me, flat } = await setup();
    const id = `rule-${kind}-${mode}`;
    await db.runAsync(
      `INSERT INTO txn (id, group_id, kind, entry_mode, date, category, recur_freq,
         recur_interval, recur_state, recur_mode, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, 'quick', ?, 'Rent', 'monthly', 1, 'active', ?, 0, ?, ?)`,
      [id, flat, kind, Date.now() - 90 * 86400000, mode, Date.now(), Date.now()],
    );
    await db.runAsync('INSERT INTO txn_payment (txn_id, person_id, amount) VALUES (?, ?, ?)', [id, me, 100000]);
    await db.runAsync('INSERT INTO txn_share (txn_id, person_id, amount) VALUES (?, ?, ?)', [id, me, 100000]);
    return { db, me, id };
  }

  it('an auto rule still posts by itself', async () => {
    const { db } = await ruleFor('expense', 'auto');
    expect(await materializeDueOccurrences(asDb(db))).toBeGreaterThan(0);
  });

  it('a remind rule posts nothing at all', async () => {
    const { db } = await ruleFor('income', 'remind');
    expect(await materializeDueOccurrences(asDb(db))).toBe(0);
  });

  it('every rule that existed before this column keeps posting', async () => {
    // The migration defaults to 'auto', so nothing anyone already set up changes
    // behaviour. That is the whole reason for the default.
    const { db, me, flat } = await setup();
    await db.runAsync(
      `INSERT INTO txn (id, group_id, kind, entry_mode, date, category, recur_freq,
         recur_interval, recur_state, is_deleted, created_at, updated_at)
       VALUES ('legacy', ?, 'expense', 'quick', ?, 'Rent', 'monthly', 1, 'active', 0, ?, ?)`,
      [flat, Date.now() - 90 * 86400000, Date.now(), Date.now()],
    );
    await db.runAsync("INSERT INTO txn_payment (txn_id, person_id, amount) VALUES ('legacy', ?, 100000)", [me]);
    await db.runAsync("INSERT INTO txn_share (txn_id, person_id, amount) VALUES ('legacy', ?, 100000)", [me]);
    expect(await materializeDueOccurrences(asDb(db))).toBeGreaterThan(0);
  });
});

/**
 * SYNC-F14 — the author retracts something I already accepted.
 *
 * Editing already re-opened my approval; deleting used to skip it entirely,
 * because `is_deleted` was written whatever the gate said and every reader
 * filters it with no reference to approval state. Careful about the edit,
 * unchecked about the erase — and the erase is the one with no undo.
 *
 * Under server sync the pull leaves exactly this behind (`DQ-31`): the entry live, my
 * approval still 'approved', and `pending_delete = 1` asking me. These pin what
 * the phone then does with it.
 */
describe('a retraction of something I accepted', () => {
  const retracted = (db: TestDb, s: { flat: string; me: string; aarav: string }) =>
    dinner(db, s, 'approved', { pendingDelete: true });

  it('holds, and my numbers do not move', async () => {
    const s = await setup({ trusted: true });
    retracted(s.db, s);

    // Still counting, still visible — I accepted it and have not changed my mind.
    expect((await snapshot(s.db, s.me)).owe).toBe(MY_SHARE);
    expect(await getTransactionsForGroup(asDb(s.db), s.flat)).toHaveLength(1);
    // ...but it is in front of me now.
    expect(await getPendingApprovalCount(asDb(s.db))).toBe(1);
  });

  it('is carried out once I agree to it', async () => {
    const s = await setup({ trusted: true });
    const id = retracted(s.db, s);

    await approveTxn(asDb(s.db), id);

    expect((await snapshot(s.db, s.me)).owe).toBe(0);
    expect(await getTransactionsForGroup(asDb(s.db), s.flat)).toHaveLength(0);
    expect(await getPendingApprovalCount(asDb(s.db))).toBe(0);
    expect(await queuedAnswer(s.db, id)).toEqual({ status: 'approved' });
  });

  it('keeps the entry when I refuse it — "no, this did happen"', async () => {
    const s = await setup({ trusted: true });
    const id = retracted(s.db, s);

    await rejectTxn(asDb(s.db), id);

    // Refusing a retraction must NOT fall through to the ordinary reject path,
    // which soft-deletes — that would carry out the very removal I just refused.
    expect((await snapshot(s.db, s.me)).owe).toBe(MY_SHARE);
    expect(await getTransactionsForGroup(asDb(s.db), s.flat)).toHaveLength(1);
    expect(await getPendingApprovalCount(asDb(s.db))).toBe(0);
    // The row now reads "approved"; the server must hear "rejected" to keep it.
    expect(await queuedAnswer(s.db, id)).toEqual({ status: 'rejected' });
  });
});

/**
 * F10 — a rejection has to reach the person who wrote the entry.
 *
 * Rejecting soft-deletes it here and does nothing to their copy, so their balance
 * and mine silently disagree and neither of us is told. Two confident numbers,
 * one of them wrong, and nothing in either app admits it. My answer is queued on
 * this device; the server turns it into a dispute on theirs, and the pull brings
 * their disputes about my entries back into `txn_dispute`.
 */
describe('objecting to a peer entry', () => {
  it('queues my refusal, and takes it back when I reopen', async () => {
    const s = await setup();
    const id = dinner(s.db, s);

    await rejectTxn(asDb(s.db), id);
    expect(await queuedAnswer(s.db, id)).toEqual({ status: 'rejected' });

    // Undoing the rejection must travel too — otherwise an objection I have
    // withdrawn sits on their screen forever with no way for them to know.
    await reopenApproval(asDb(s.db), id);
    expect(await queuedAnswer(s.db, id)).toEqual({ status: 'pending' });
    expect(await getPendingApprovalCount(asDb(s.db))).toBe(1);
  });

  /** One of MY entries, at server version 1, that Aarav has objected to. */
  async function objectedTo(s: Awaited<ReturnType<typeof setup>>) {
    const mine = await insertTxn(asDb(s.db), {
      groupId: s.flat, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
      payments: [{ personId: s.me, amount: BILL }],
      shares: [{ personId: s.me, amount: MY_SHARE }, { personId: s.aarav, amount: MY_SHARE }],
    });
    await setServerVersion(asDb(s.db), 'transactions', mine, 1);
    await s.db.runAsync(
      'INSERT OR REPLACE INTO txn_dispute (txn_id, by_uid, version, created_at, cleared) VALUES (?, ?, 1, ?, 0)',
      [mine, 'acct-aarav', Date.now()],
    );
    return mine;
  }

  it('shows the author an objection, and hides it once they edit in response', async () => {
    const s = await setup();
    const mine = await objectedTo(s);

    const live = await disputesFor(asDb(s.db), mine);
    expect(live).toHaveLength(1);
    // Resolved to a local name where this device knows the account.
    expect(live[0].name).toBe('Aarav');

    // I edit in response and the server confirms v2. The objection was about v1,
    // which no longer exists — leaving it up would be an unanswerable complaint
    // about a figure that has already changed.
    await setServerVersion(asDb(s.db), 'transactions', mine, 2);
    expect(await disputesFor(asDb(s.db), mine)).toHaveLength(0);
  });

  it('a withdrawn objection stops being shown', async () => {
    const s = await setup();
    const mine = await objectedTo(s);
    expect(await disputesFor(asDb(s.db), mine)).toHaveLength(1);

    // What the pull writes when Aarav takes it back: the same row, cleared.
    await s.db.runAsync("UPDATE txn_dispute SET cleared = 1 WHERE txn_id = ? AND by_uid = 'acct-aarav'", [mine]);
    expect(await disputesFor(asDb(s.db), mine)).toHaveLength(0);
  });
});
