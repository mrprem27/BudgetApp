import { ingestPeerTxn } from '../db/queries/peerIngest';
import { approveTxn, rejectTxn, getPendingApprovalCount, getPendingApprovals, getApproval } from '../db/queries/approval';
import { getMyExposure } from '../db/queries/balances';
import { getCashPosition, proposeOverspendRaid } from '../db/queries/savings';
import { getTransactionsForGroup, getLedgerStats, updateTxn, getActiveRecurringRules } from '../db/queries/transactions';
import { materializeDueOccurrences } from '../db/queries/recurring';
import { PayMethod } from '../constants/enums';
import { getMyGlobalBudgetSummary } from '../lib/budget';
import { createTestDb, addPerson, addGroup, addMember, addCategory, setCategoryBudget, asDb, type TestDb } from './helpers/testDb';

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
 */

const BILL = 4_000_00;   // ₹4,000, paid by them
const MY_SHARE = 2_000_00;

/** Me + Aarav in a shared flat. Aarav has an account; I have not trusted him. */
async function setup(opts: { trusted?: boolean } = {}) {
  const db = createTestDb();
  const me = addPerson(db, 'Me', true);
  const aarav = addPerson(db, 'Aarav', false);
  // The bridge that makes trust evaluable at all. Without it `appliesImmediately`
  // returns false whatever `trust_state` says — which is why this is a no-op today.
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

/** Aarav's device asserts a ₹4,000 dinner he paid for, split with me. */
function envelope(flat: string, me: string, aarav: string) {
  return {
    authorUid: 'acct-aarav',
    groupId: flat,
    kind: 'expense' as const,
    date: Date.now(),
    category: 'Food',
    payments: [{ personId: aarav, amount: BILL }],
    shares: [{ personId: me, amount: MY_SHARE }, { personId: aarav, amount: MY_SHARE }],
  };
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
    const { db, me, aarav, flat, personal } = await setup();
    addCategory(db, 'Food');
    // The global cap lives on the Personal group — that is what
    // `getMyGlobalBudgetSummary` reads. The spend it measures is my share across
    // every group, which is exactly why a peer entry could reach it.
    setCategoryBudget(db, { groupId: personal, category: 'Food', amount: 1000000 });

    const before = await snapshot(db, me);
    const res = await ingestPeerTxn(asDb(db), envelope(flat, me, aarav));
    expect(res).toMatchObject({ ok: true, applied: false });

    // The whole claim, in one assertion.
    expect(await snapshot(db, me)).toEqual(before);

    // ...and yet it is not hidden. The group has to agree on what happened.
    const ledger = await getTransactionsForGroup(asDb(db), flat);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].pendingApproval).toBe(true);
    expect(await getPendingApprovalCount(asDb(db))).toBe(1);
  });

  it('moves every one of them the moment I approve', async () => {
    const { db, me, aarav, flat, personal } = await setup();
    addCategory(db, 'Food');
    // The global cap lives on the Personal group — that is what
    // `getMyGlobalBudgetSummary` reads. The spend it measures is my share across
    // every group, which is exactly why a peer entry could reach it.
    setCategoryBudget(db, { groupId: personal, category: 'Food', amount: 1000000 });

    const before = await snapshot(db, me);
    const res = await ingestPeerTxn(asDb(db), envelope(flat, me, aarav));
    if (!res.ok) throw new Error(res.reason);
    await approveTxn(asDb(db), res.txnId);

    const after = await snapshot(db, me);
    // I consumed ₹2,000 and paid nothing, so I owe ₹2,000 and my cash is untouched.
    expect(after.owe).toBe(before.owe + MY_SHARE);
    expect(after.cashAvailable).toBe(before.cashAvailable);
    expect(after.budgetSpent).toBe(before.budgetSpent + MY_SHARE);
    expect(after.budgetSharedSpent).toBe(before.budgetSharedSpent + MY_SHARE);
    expect(after.txnCount).toBe(before.txnCount + 1);
    expect(await getPendingApprovalCount(asDb(db))).toBe(0);
    expect((await getTransactionsForGroup(asDb(db), flat))[0].pendingApproval).toBe(false);
  });

  it('never counts once I reject it, and cannot be re-delivered', async () => {
    const { db, me, aarav, flat } = await setup();
    const before = await snapshot(db, me);
    const res = await ingestPeerTxn(asDb(db), { ...envelope(flat, me, aarav), entryId: 'entry-1' });
    if (!res.ok) throw new Error(res.reason);

    await rejectTxn(asDb(db), res.txnId);
    expect(await snapshot(db, me)).toEqual(before);
    // Gone from the ledger too — I have said this did not happen.
    expect(await getTransactionsForGroup(asDb(db), flat)).toHaveLength(0);
    expect(await getPendingApprovalCount(asDb(db))).toBe(0);

    // The same envelope arriving again must not re-ask a decided question.
    const again = await ingestPeerTxn(asDb(db), { ...envelope(flat, me, aarav), entryId: 'entry-1' });
    expect(again).toEqual({ ok: false, reason: 'duplicate' });
    expect(await snapshot(db, me)).toEqual(before);
  });

  it('skips the queue entirely when I have trusted the author', async () => {
    const { db, me, aarav, flat } = await setup({ trusted: true });
    const before = await snapshot(db, me);
    const res = await ingestPeerTxn(asDb(db), envelope(flat, me, aarav));
    expect(res).toMatchObject({ ok: true, applied: true });

    expect(await getPendingApprovalCount(asDb(db))).toBe(0);
    expect((await snapshot(db, me)).owe).toBe(before.owe + MY_SHARE);
  });

  /**
   * The reason `txn_approval` is its own table. `updateTxn` DELETEs and re-INSERTs
   * every share and payment row, so an approval stored on those would vanish here
   * — and the entry would silently start counting without my ever accepting it.
   */
  it('survives an edit that rewrites the entry\'s shares', async () => {
    const { db, me, aarav, flat } = await setup();
    const before = await snapshot(db, me);
    const res = await ingestPeerTxn(asDb(db), envelope(flat, me, aarav));
    if (!res.ok) throw new Error(res.reason);

    await updateTxn(asDb(db), {
      id: res.txnId, groupId: flat, kind: 'expense', date: Date.now(), category: 'Food',
      payments: [{ personId: aarav, amount: BILL }],
      shares: [{ personId: me, amount: MY_SHARE }, { personId: aarav, amount: MY_SHARE }],
    });

    expect(await getPendingApprovalCount(asDb(db))).toBe(1);
    expect(await snapshot(db, me)).toEqual(before);
  });
});

describe('a peer entry cannot reach the savings raid', () => {
  it('proposes no withdrawal while it is only a claim', async () => {
    const { db, me, aarav, flat } = await setup();
    // A goal holding everything, so any real shortfall would liquidate it.
    await db.runAsync(
      `INSERT INTO savings_goal (id, name, target, priority, allocation, frequency, locked, is_archived, sort_order, created_at)
       VALUES ('g1', 'Phone', 9000000, 'want', 0, 'none', 0, 0, 0, 0)`,
    );
    await db.runAsync(
      `INSERT INTO savings_txn (id, goal_id, amount, kind, source, date, created_at)
       VALUES ('s1', 'g1', 5000000, 'allocate', 'manual', 0, 0)`,
    );

    // A peer entry naming ME as the payer — the "someone says I paid" attack, and
    // the only shape that could drive my cash negative on someone else's say-so.
    const res = await ingestPeerTxn(asDb(db), {
      ...envelope(flat, me, aarav),
      payments: [{ personId: me, amount: BILL }],
    });
    expect(res).toMatchObject({ ok: true, applied: false });

    expect((await proposeOverspendRaid(asDb(db))).total).toBe(0);
    expect((await getCashPosition(asDb(db))).available).toBe(0);
  });
});

describe('what ingestion refuses', () => {
  it('refuses an author with no local person carrying that account', async () => {
    const { db, me, aarav, flat } = await setup();
    const r = await ingestPeerTxn(asDb(db), { ...envelope(flat, me, aarav), authorUid: 'acct-nobody' });
    expect(r).toEqual({ ok: false, reason: 'unknown-author' });
  });

  it('refuses anything aimed at my personal group', async () => {
    const { db, me, aarav, personal } = await setup();
    const r = await ingestPeerTxn(asDb(db), { ...envelope(personal, me, aarav), groupId: personal });
    expect(r).toEqual({ ok: false, reason: 'personal-group' });
  });

  it('refuses a split that does not add up', async () => {
    const { db, me, aarav, flat } = await setup();
    const r = await ingestPeerTxn(asDb(db), {
      ...envelope(flat, me, aarav),
      shares: [{ personId: me, amount: BILL }, { personId: aarav, amount: MY_SHARE }],
    });
    expect(r).toEqual({ ok: false, reason: 'unbalanced' });
  });

  it('refuses a share parked on someone outside the group', async () => {
    const { db, me, aarav, flat } = await setup();
    const stranger = addPerson(db, 'Stranger', false);
    const r = await ingestPeerTxn(asDb(db), {
      ...envelope(flat, me, aarav),
      shares: [{ personId: me, amount: MY_SHARE }, { personId: stranger, amount: MY_SHARE }],
    });
    expect(r).toEqual({ ok: false, reason: 'not-a-member' });
  });

  it('refuses to evaluate trust when there are two "me" rows', async () => {
    // F5: seed.ts mints is_me with a fresh uuid per install. With two, "who wrote
    // this" and "are they trusted" both read an arbitrary row.
    const { db, me, aarav, flat } = await setup();
    addPerson(db, 'Me again', true);
    const r = await ingestPeerTxn(asDb(db), envelope(flat, me, aarav));
    expect(r).toEqual({ ok: false, reason: 'ambiguous-me' });
  });
});

describe('a transfer is confirmed, not trusted', () => {
  /**
   * The sharpest claim in the app. "I paid you ₹4,000" credits cash you may never
   * have received AND erases a real debt, in one write. Trust answers "is this
   * person honest"; it cannot answer "did the transfer actually land", which fails
   * for reasons neither person controls.
   */
  it('still waits even when the sender is trusted', async () => {
    const { db, me, aarav, flat } = await setup({ trusted: true });
    const before = await snapshot(db, me);

    const res = await ingestPeerTxn(asDb(db), {
      authorUid: 'acct-aarav', groupId: flat, kind: 'settlement',
      date: Date.now(), category: 'Settlement',
      payments: [{ personId: aarav, amount: BILL }],
      shares: [{ personId: me, amount: BILL }],
    });
    expect(res).toMatchObject({ ok: true, applied: false });
    expect(await snapshot(db, me)).toEqual(before);
    expect(await getPendingApprovalCount(asDb(db))).toBe(1);
  });

  it('records where it actually landed, not where they said they sent it', async () => {
    const { db, me, aarav, flat } = await setup({ trusted: true });
    const res = await ingestPeerTxn(asDb(db), {
      authorUid: 'acct-aarav', groupId: flat, kind: 'settlement',
      date: Date.now(), category: 'Settlement',
      payMethod: 'upi',            // how they sent it
      payments: [{ personId: aarav, amount: BILL }],
      shares: [{ personId: me, amount: BILL }],
    });
    if (!res.ok) throw new Error(res.reason);

    await approveTxn(asDb(db), res.txnId, PayMethod.Bank);   // where it arrived

    const approval = await getApproval(asDb(db), res.txnId);
    expect(approval?.landed_pay_method).toBe('bank');
    // Applied to the entry too, so the ledger acts on my side's truth.
    const row = await db.getFirstAsync<{ pay_method: string }>(
      'SELECT pay_method FROM txn WHERE id = ?', [res.txnId],
    );
    expect(row?.pay_method).toBe('bank');
  });

  it('is not swept up by trusting the author', async () => {
    // Trusting someone clears their expenses. It must not clear their claim that
    // they have paid you — that is the one thing trust cannot answer.
    const { db, me, aarav, flat } = await setup();
    await ingestPeerTxn(asDb(db), envelope(flat, me, aarav));           // an expense
    await ingestPeerTxn(asDb(db), {                                     // and an arrival
      authorUid: 'acct-aarav', groupId: flat, kind: 'settlement',
      date: Date.now(), category: 'Settlement',
      payments: [{ personId: aarav, amount: BILL }],
      shares: [{ personId: me, amount: BILL }],
    });
    expect(await getPendingApprovalCount(asDb(db))).toBe(2);

    // What `trustAuthor` does: flip the state, then approve everything except
    // money arriving.
    await db.runAsync("UPDATE person SET trust_state = 'trusted' WHERE id = ?", [aarav]);
    const pending = await getPendingApprovals(asDb(db));
    for (const a of pending) {
      const t = await db.getFirstAsync<{ kind: string }>('SELECT kind FROM txn WHERE id = ?', [a.txn_id]);
      if (t?.kind !== 'settlement') await approveTxn(asDb(db), a.txn_id);
    }
    expect(await getPendingApprovalCount(asDb(db))).toBe(1);
  });
});

describe('a peer recurring rule', () => {
  const rule = (flat: string, me: string, aarav: string) => ({
    ...envelope(flat, me, aarav),
    recurFreq: 'monthly',
    date: Date.now() - 90 * 86400000,   // started three months ago
  });

  /**
   * The loudest possible version of the thing this model exists to stop: a rule
   * nobody accepted, quietly posting an occurrence every month.
   */
  it('spawns nothing at all while it waits', async () => {
    const { db, me, aarav, flat } = await setup();
    const before = await snapshot(db, me);
    const res = await ingestPeerTxn(asDb(db), rule(flat, me, aarav));
    expect(res).toMatchObject({ ok: true, applied: false });

    const made = await materializeDueOccurrences(asDb(db));
    expect(made).toBe(0);
    expect(await snapshot(db, me)).toEqual(before);
  });

  it('starts posting once the rule itself is approved', async () => {
    const { db, me, aarav, flat } = await setup();
    const res = await ingestPeerTxn(asDb(db), rule(flat, me, aarav));
    if (!res.ok) throw new Error(res.reason);
    await approveTxn(asDb(db), res.txnId);

    expect(await materializeDueOccurrences(asDb(db))).toBeGreaterThan(0);
    // Occurrences of an approved rule need no further approval — that is the
    // whole point of approving the rule rather than each month.
    expect(await getPendingApprovalCount(asDb(db))).toBe(0);
  });

  it('is not announced as a committed bill while it waits', async () => {
    // "Coming up", reminders and the forecast all read getActiveRecurringRules.
    // A rule I have not accepted is a proposal, not a bill.
    const { db, me, aarav, flat } = await setup();
    await ingestPeerTxn(asDb(db), rule(flat, me, aarav));
    expect(await getActiveRecurringRules(asDb(db))).toHaveLength(0);
  });
});
