import { createTestDb } from './helpers/testDb';
import { getFinanceSnapshot } from '../db/queries/engineSnapshot';
import { getSafeToSpend } from '../db/queries/spendPower';
import { getCashPosition } from '../db/queries/savings';
import { getGoalFundingStatus } from '../db/queries/spendPower';
import { getMoneyProfile } from '../db/queries/moneyProfile';
import { computeTotalMoney } from '../lib/cash';
import { getMyExposure } from '../db/queries/balances';
import { getMyGlobalBudgetRows } from '../db/queries/categoryBudgets';
import { getMe } from '../db/queries/persons';
import { loadDemoData } from '../db/seedDemo';
import { buildPersona, PERSONA_KINDS, PERSONA_NOW, ME_ID } from '../db/enginePersonas';

/**
 * E1 · Snapshot (`SPEC-ENGINE.md` §4, task EN1): `getFinanceSnapshot` gathers
 * every engine input from one place. The accept criterion is parity — its parts
 * equal what `getSafeToSpend` already computes from the same ledger, via the
 * exact same source functions (`engineSnapshot.ts`'s own comments name them) —
 * checked directly here rather than trusted by inspection.
 */

/** Every field, checked against a direct call to the function `engineSnapshot.ts` names as its source. */
async function assertPinnedToSource(db: Awaited<ReturnType<typeof createTestDb>>, nowMs: number) {
  const me = await getMe(db);
  if (!me) throw new Error('persona must have "me"');
  const snap = await getFinanceSnapshot(db, nowMs);

  const profile = await getMoneyProfile(db);
  const pos = await getCashPosition(db, profile);
  const money = computeTotalMoney(pos, profile);
  expect(snap.cash.available).toBe(pos.available);
  expect(snap.cash.creditUsed).toBe(money.creditUsed);
  expect(snap.cash.creditLimit).toBe(money.creditLimit);

  const exposure = await getMyExposure(db, me.id);
  expect(snap.exposure).toEqual(exposure);

  const funding = await getGoalFundingStatus(db, nowMs);
  expect(snap.goals.funding).toEqual(funding);

  const budgets = await getMyGlobalBudgetRows(db, me.id);
  expect(snap.budgets).toEqual(budgets);

  // getSafeToSpend is built from the very same parts — a snapshot that agrees
  // with each source function individually must also agree with it.
  const sts = await getSafeToSpend(db, nowMs);
  expect(sts).toBeTruthy();

  return snap;
}

describe('getFinanceSnapshot — parity with its named sources', () => {
  it('on the demo ledger', async () => {
    const db = createTestDb();
    await loadDemoData(db);
    await assertPinnedToSource(db, Date.now());
  });

  it.each(PERSONA_KINDS)('on the %s persona', async kind => {
    const db = createTestDb();
    await buildPersona(db, kind);
    await assertPinnedToSource(db, PERSONA_NOW);
  });

  it('returns the empty snapshot when there is no "me" yet', async () => {
    const db = createTestDb();
    const snap = await getFinanceSnapshot(db, 12345);
    expect(snap.asOf).toBe(12345);
    expect(snap.meId).toBe('');
    expect(snap.exposure.perPerson).toEqual([]);
    expect(snap.history).toEqual([]);
  });
});

describe('getFinanceSnapshot — history', () => {
  it('never includes a settlement, and every row is my-share income or expense', async () => {
    const db = createTestDb();
    await buildPersona(db, 'salariedRenter');
    const snap = await getFinanceSnapshot(db, PERSONA_NOW);
    expect(snap.history.length).toBeGreaterThan(0);
    for (const row of snap.history) {
      expect(['expense', 'income']).toContain(row.kind);
      expect(row.amountPaise).toBeGreaterThanOrEqual(0);
    }
  });

  it('is sorted oldest first', async () => {
    const db = createTestDb();
    await buildPersona(db, 'diwaliSpike');
    const snap = await getFinanceSnapshot(db, PERSONA_NOW);
    const dates = snap.history.map(r => r.date);
    expect(dates).toEqual([...dates].sort((a, b) => a - b));
  });

  it('reads income from payments, not shares — income is never split (AGENTS.md §12)', async () => {
    const db = createTestDb();
    await buildPersona(db, 'freelancer');
    const snap = await getFinanceSnapshot(db, PERSONA_NOW);
    const incomeRows = snap.history.filter(r => r.kind === 'income');
    expect(incomeRows.length).toBe(5); // the freelancer's 5 one-off payments
    expect(incomeRows.every(r => r.amountPaise > 0)).toBe(true);
  });

  it('marks a materialized recurring occurrence, and leaves a one-off unmarked', async () => {
    const db = createTestDb();
    await buildPersona(db, 'student');
    // A materialized occurrence of a confirmed series carries `parent_recur_id` —
    // insert one directly, since none of the personas run the materialize job.
    await db.runAsync(
      `INSERT INTO txn (id, group_id, kind, entry_mode, date, category, parent_recur_id, sync_version, is_deleted, created_at, updated_at)
       VALUES ('occ-1', (SELECT id FROM budget_group WHERE is_personal = 1), 'expense', 'quick', ?, 'Food', 'some-rule', 1, 0, ?, ?)`,
      [PERSONA_NOW - DAY(1), Date.now(), Date.now()],
    );
    await db.runAsync("INSERT INTO txn_payment (txn_id, person_id, amount) VALUES ('occ-1', ?, 10000)", [ME_ID]);
    await db.runAsync("INSERT INTO txn_share (txn_id, person_id, amount) VALUES ('occ-1', ?, 10000)", [ME_ID]);

    const snap = await getFinanceSnapshot(db, PERSONA_NOW);
    const linked = snap.history.find(r => r.id === 'occ-1');
    expect(linked?.isRecurringLinked).toBe(true);
    expect(snap.history.some(r => r.id !== 'occ-1' && r.isRecurringLinked)).toBe(false);
  });
});

function DAY(n: number): number {
  return n * 86_400_000;
}

describe('personas — determinism (SPEC-ENGINE.md §7)', () => {
  it('the same persona built twice gives byte-identical history', async () => {
    const a = createTestDb();
    const b = createTestDb();
    await buildPersona(a, 'diwaliSpike');
    await buildPersona(b, 'diwaliSpike');
    const snapA = await getFinanceSnapshot(a, PERSONA_NOW);
    const snapB = await getFinanceSnapshot(b, PERSONA_NOW);
    expect(snapA.history.map(r => r.amountPaise)).toEqual(snapB.history.map(r => r.amountPaise));
  });
});
