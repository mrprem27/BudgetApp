import { ingestPeerTxn } from '../db/queries/peerIngest';
import { approveTxn, rejectTxn, reopenApproval, getPendingApprovalCount, getPendingApprovals, getApproval } from '../db/queries/approval';
import { pendingDisputes, markDisputeSent, recordDispute, disputesFor, markSynced } from '../db/queries/syncDoc';
import { getMyExposure } from '../db/queries/balances';
import { getCashPosition, proposeOverspendRaid } from '../db/queries/savings';
import {
  getTransactionsForGroup, getLedgerStats, updateTxn, getActiveRecurringRules, insertTxn,
  softDeleteTxn, PeerEntryError,
} from '../db/queries/transactions';
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
    version: 1,
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
    expect(again).toEqual({ ok: false, reason: 'stale' });
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
  /**
   * I can refuse an entry somebody else wrote. I cannot rewrite it.
   *
   * Nothing gated this, so a peer's ₹4,000 dinner could be quietly edited down to
   * ₹400 here — my copy disagreeing with theirs permanently, with no version bump
   * on their side to reconcile it and nothing to tell either of us. The honest
   * answers are approve and reject, and both exist.
   */
  it('cannot be edited at all — only accepted or refused', async () => {
    const { db, me, aarav, flat } = await setup();
    const before = await snapshot(db, me);
    const res = await ingestPeerTxn(asDb(db), envelope(flat, me, aarav));
    if (!res.ok) throw new Error(res.reason);

    await expect(updateTxn(asDb(db), {
      id: res.txnId, groupId: flat, kind: 'expense', date: Date.now(), category: 'Food',
      payments: [{ personId: aarav, amount: BILL }],
      shares: [{ personId: me, amount: MY_SHARE }, { personId: aarav, amount: MY_SHARE }],
    })).rejects.toThrow(PeerEntryError);

    // Refused means untouched: still waiting, and still moving none of my numbers.
    expect(await getPendingApprovalCount(asDb(db))).toBe(1);
    expect(await snapshot(db, me)).toEqual(before);
  });

  it('cannot be swiped away either — that is what refusing is for', async () => {
    const { db, me, aarav, flat } = await setup();
    const res = await ingestPeerTxn(asDb(db), envelope(flat, me, aarav));
    if (!res.ok) throw new Error(res.reason);

    await expect(softDeleteTxn(asDb(db), res.txnId)).rejects.toThrow(PeerEntryError);
    expect(await db.getFirstAsync('SELECT is_deleted FROM txn WHERE id = ?', [res.txnId]))
      .toEqual({ is_deleted: 0 });

    // ...and the labelled path still works, and still tells them.
    await rejectTxn(asDb(db), res.txnId);
    expect(await db.getFirstAsync('SELECT is_deleted FROM txn WHERE id = ?', [res.txnId]))
      .toEqual({ is_deleted: 1 });
    expect(await db.getFirstAsync('SELECT dispute_state FROM txn_approval WHERE txn_id = ?', [res.txnId]))
      .toEqual({ dispute_state: 'raise' });
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

  /*
   * A negative entry BALANCES, which is why the sum check cannot catch it and why
   * this needs its own guard ahead of it. From a trusted author there is no
   * approval step either, so it lands applied: `getGroupNet` then reads it as the
   * sender being owed money out of an entry with no positive amount in it, and
   * the audit log records "added ₹-5,000.00".
   */
  it.each([
    ['a negative payment', { payments: [{ personId: 'AARAV', amount: -BILL }], shares: [{ personId: 'ME', amount: -BILL }] }],
    ['a zero share', { shares: [{ personId: 'ME', amount: 0 }, { personId: 'AARAV', amount: 0 }], payments: [{ personId: 'AARAV', amount: 0 }] }],
  ])('refuses %s even though it balances', async (_label, patch) => {
    const { db, me, aarav, flat } = await setup();
    const swap = (rows: { personId: string; amount: number }[]) =>
      rows.map(r => ({ ...r, personId: r.personId === 'ME' ? me : aarav }));
    const r = await ingestPeerTxn(asDb(db), {
      ...envelope(flat, me, aarav),
      payments: swap(patch.payments),
      shares: swap(patch.shares),
    });
    expect(r).toEqual({ ok: false, reason: 'not-positive' });
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
      authorUid: 'acct-aarav', groupId: flat, version: 1, kind: 'settlement',
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
      authorUid: 'acct-aarav', groupId: flat, version: 1, kind: 'settlement',
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
      authorUid: 'acct-aarav', groupId: flat, version: 1, kind: 'settlement',
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
    const { db, me, aarav, flat } = await setup();
    const res = await ingestPeerTxn(asDb(db), rule(flat, me, aarav));
    if (!res.ok) throw new Error(res.reason);
    await approveTxn(asDb(db), res.txnId);

    expect(await materializeDueOccurrences(asDb(db))).toBe(0);
  });

  /**
   * The other half of that trade, and the reason it is safe to make.
   *
   * If the author's months arrived as ordinary peer entries, an untrusted author
   * would have me approving the same rent every month — turning one decision into
   * an indefinite interruption, which is exactly what approving a RULE was meant
   * to settle. The occurrence carries its rule id, so it inherits that decision.
   */
  it('counts an occurrence of a rule I approved without asking again', async () => {
    const { db, me, aarav, flat } = await setup();          // Aarav is on `review`
    const res = await ingestPeerTxn(asDb(db), rule(flat, me, aarav));
    if (!res.ok) throw new Error(res.reason);
    await approveTxn(asDb(db), res.txnId);

    const occ = await ingestPeerTxn(asDb(db), {
      ...envelope(flat, me, aarav),
      entryId: 'occ-1',
      parentRecurId: res.txnId,
      recurOverrideDate: Date.now(),
    });
    expect(occ).toMatchObject({ ok: true, applied: true });
    expect(await getPendingApprovalCount(asDb(db))).toBe(0);
  });

  it('still asks about an occurrence whose rule I have not accepted', async () => {
    // The narrowness check. Inheriting from a rule that is itself waiting would
    // be a way to smuggle spending past a decision I never made.
    const { db, me, aarav, flat } = await setup();
    const res = await ingestPeerTxn(asDb(db), rule(flat, me, aarav));
    if (!res.ok) throw new Error(res.reason);

    const occ = await ingestPeerTxn(asDb(db), {
      ...envelope(flat, me, aarav),
      entryId: 'occ-1',
      parentRecurId: res.txnId,
      recurOverrideDate: Date.now(),
    });
    expect(occ).toMatchObject({ ok: true, applied: false });
  });

  it('still asks about a transfer, however the rule was decided', async () => {
    // A transfer is confirmed by both sides in every case. No rule, and no trust,
    // may waive it: "I paid you ₹5,000" erases a real debt in the same write.
    const { db, me, aarav, flat } = await setup({ trusted: true });
    const res = await ingestPeerTxn(asDb(db), rule(flat, me, aarav));
    if (!res.ok) throw new Error(res.reason);
    await approveTxn(asDb(db), res.txnId);

    const occ = await ingestPeerTxn(asDb(db), {
      ...envelope(flat, me, aarav),
      entryId: 'occ-1',
      kind: 'settlement' as const,
      parentRecurId: res.txnId,
      recurOverrideDate: Date.now(),
      payments: [{ personId: aarav, amount: MY_SHARE }],
      shares: [{ personId: me, amount: MY_SHARE }],
    });
    expect(occ).toMatchObject({ ok: true, applied: false });
  });

  it('is not announced as a committed bill while it waits', async () => {
    // "Coming up", reminders and the forecast all read getActiveRecurringRules.
    // A rule I have not accepted is a proposal, not a bill.
    const { db, me, aarav, flat } = await setup();
    await ingestPeerTxn(asDb(db), rule(flat, me, aarav));
    expect(await getActiveRecurringRules(asDb(db))).toHaveLength(0);
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
 * Versions, and the four things they stop.
 *
 * An entry that can only ever be created is not a synced ledger — it is a ledger
 * that lands once and then freezes, which reads as working right up until someone
 * corrects an amount. So edits must arrive. And the moment they can, three ways to
 * move money without anyone agreeing to it open up, all of them closed here.
 */
describe('an edit from a peer', () => {
  const edited = (flat: string, me: string, aarav: string, version: number, bill: number) => ({
    ...envelope(flat, me, aarav),
    entryId: 'entry-1',
    version,
    payments: [{ personId: aarav, amount: bill }],
    shares: [{ personId: me, amount: bill / 2 }, { personId: aarav, amount: bill / 2 }],
  });

  it('replaces the entry in place rather than making a second copy', async () => {
    const { db, me, aarav, flat } = await setup({ trusted: true });
    await ingestPeerTxn(asDb(db), edited(flat, me, aarav, 1, BILL));
    const r = await ingestPeerTxn(asDb(db), edited(flat, me, aarav, 2, 6_000_00));
    expect(r).toMatchObject({ ok: true, txnId: 'entry-1' });

    const rows = await getTransactionsForGroup(asDb(db), flat);
    expect(rows).toHaveLength(1);
    // The new figure, not the old one, and not both.
    expect((await snapshot(db, me)).owe).toBe(3_000_00);
  });

  it('refuses a stale copy that arrives after a newer one', async () => {
    // At-least-once delivery means a re-send can overtake. Applying it would roll
    // a corrected figure back to the value the group already fixed.
    const { db, me, aarav, flat } = await setup({ trusted: true });
    await ingestPeerTxn(asDb(db), edited(flat, me, aarav, 1, BILL));
    await ingestPeerTxn(asDb(db), edited(flat, me, aarav, 2, 6_000_00));

    expect(await ingestPeerTxn(asDb(db), edited(flat, me, aarav, 1, BILL)))
      .toEqual({ ok: false, reason: 'stale' });
    expect((await snapshot(db, me)).owe).toBe(3_000_00);
  });

  it('re-opens an approval I had already given, when the numbers change', async () => {
    /*
     * The one that matters most. I accept ₹4,000. They edit it to ₹40,000. If the
     * edit inherited my decision, the new figure would land in my ledger on the
     * strength of a decision I made about a different number.
     */
    const { db, me, aarav, flat } = await setup();
    const first = await ingestPeerTxn(asDb(db), edited(flat, me, aarav, 1, BILL));
    if (!first.ok) throw new Error(first.reason);
    await approveTxn(asDb(db), first.txnId);
    const afterApproval = await snapshot(db, me);
    expect(afterApproval.owe).toBe(MY_SHARE);

    await ingestPeerTxn(asDb(db), edited(flat, me, aarav, 2, 40_000_00));

    expect(await getPendingApprovalCount(asDb(db))).toBe(1);
    // And it moves nothing until I say so — not the old figure, not the new one.
    expect((await snapshot(db, me)).owe).toBe(0);
  });

  it('cannot overrule a rejection, however much I trust the author', async () => {
    /*
     * I said this did not happen. A trusted author editing it must not apply the
     * new version silently — that would erase my decision with no way for me to
     * see it. Trust means "their entries may count", never "their edits overrule
     * me". It comes back as a question instead of being discarded, because they
     * may genuinely have corrected it.
     */
    const { db, me, aarav, flat } = await setup({ trusted: true });
    const first = await ingestPeerTxn(asDb(db), edited(flat, me, aarav, 1, BILL));
    if (!first.ok) throw new Error(first.reason);
    await rejectTxn(asDb(db), first.txnId);
    expect((await snapshot(db, me)).owe).toBe(0);

    const second = await ingestPeerTxn(asDb(db), edited(flat, me, aarav, 2, 6_000_00));
    expect(second).toMatchObject({ ok: true, applied: false });
    expect(await getPendingApprovalCount(asDb(db))).toBe(1);
    expect((await snapshot(db, me)).owe).toBe(0);
  });

  it('carries a deletion the author made, and it moves my numbers back', async () => {
    const { db, me, aarav, flat } = await setup({ trusted: true });
    await ingestPeerTxn(asDb(db), edited(flat, me, aarav, 1, BILL));
    expect((await snapshot(db, me)).owe).toBe(MY_SHARE);

    await ingestPeerTxn(asDb(db), { ...edited(flat, me, aarav, 2, BILL), isDeleted: true });

    expect((await snapshot(db, me)).owe).toBe(0);
    expect(await getTransactionsForGroup(asDb(db), flat)).toHaveLength(0);
  });
});

/**
 * F10 — a rejection has to reach the person who wrote the entry.
 *
 * Rejecting soft-deletes it here and does nothing to their copy, so their balance
 * and mine silently disagree and neither of us is told. Two confident numbers,
 * one of them wrong, and nothing in either app admits it. The objection is queued
 * on this device and delivered by the drain.
 */
describe('objecting to a peer entry', () => {
  it('queues an objection when I reject, and takes it back when I reopen', async () => {
    const { db, me, aarav, flat } = await setup();
    const res = await ingestPeerTxn(asDb(db), { ...envelope(flat, me, aarav), entryId: 'e-obj' });
    if (!res.ok) throw new Error(res.reason);

    await rejectTxn(asDb(db), res.txnId);
    let queued = await pendingDisputes(asDb(db));
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ txn_id: 'e-obj', group_id: flat, dispute_state: 'raise' });

    // Undoing the rejection must travel too — otherwise an objection I have
    // withdrawn sits on their screen forever with no way for them to know.
    await reopenApproval(asDb(db), res.txnId);
    queued = await pendingDisputes(asDb(db));
    expect(queued[0].dispute_state).toBe('clear');

    await markDisputeSent(asDb(db), res.txnId);
    expect(await pendingDisputes(asDb(db))).toHaveLength(0);
  });

  it('never objects to my own entry — there is nobody to tell', async () => {
    const { db, me, flat } = await setup();
    const mine = await insertTxn(asDb(db), {
      groupId: flat, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
      payments: [{ personId: me, amount: BILL }],
      shares: [{ personId: me, amount: BILL }],
    });
    await rejectTxn(asDb(db), mine);
    expect(await pendingDisputes(asDb(db))).toHaveLength(0);
  });

  it('shows the author an objection, and hides it once they edit in response', async () => {
    const { db, me, aarav, flat } = await setup();
    const mine = await insertTxn(asDb(db), {
      groupId: flat, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
      payments: [{ personId: me, amount: BILL }],
      shares: [{ personId: me, amount: MY_SHARE }, { personId: aarav, amount: MY_SHARE }],
    });
    await markSynced(asDb(db), mine, 1);
    await recordDispute(asDb(db), mine, 'acct-aarav', 1, Date.now(), false);

    const live = await disputesFor(asDb(db), mine);
    expect(live).toHaveLength(1);
    // Resolved to a local name where this device knows the account.
    expect(live[0].name).toBe('Aarav');

    // I edit in response and push v2. The objection was about v1, which no longer
    // exists — leaving it up would be an unanswerable complaint about a figure
    // that has already changed.
    await markSynced(asDb(db), mine, 2);
    expect(await disputesFor(asDb(db), mine)).toHaveLength(0);
  });

  it('drops an objection about an entry this device does not have', async () => {
    // Someone rejected an entry I deleted outright. Storing it against nothing
    // would leave a row no screen can ever explain.
    const { db } = await setup();
    await recordDispute(asDb(db), 'no-such-entry', 'acct-aarav', 1, Date.now(), false);
    expect(await disputesFor(asDb(db), 'no-such-entry')).toHaveLength(0);
  });

  it('a withdrawn objection stops being shown', async () => {
    const { db, me, flat } = await setup();
    const mine = await insertTxn(asDb(db), {
      groupId: flat, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
      payments: [{ personId: me, amount: BILL }], shares: [{ personId: me, amount: BILL }],
    });
    await markSynced(asDb(db), mine, 1);
    await recordDispute(asDb(db), mine, 'acct-aarav', 1, Date.now(), false);
    expect(await disputesFor(asDb(db), mine)).toHaveLength(1);

    await recordDispute(asDb(db), mine, 'acct-aarav', 1, Date.now(), true);
    expect(await disputesFor(asDb(db), mine)).toHaveLength(0);
  });
});
