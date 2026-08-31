import { toRecurRows } from '../lib/recurringSuggest';
import {
  effectiveRow, effectiveSplit, snapshotRow, payerFor, planCommit,
  DEFAULT_CATEGORY, txnInputFromPlan, type ReviewContext, type RowEdit, type SplitState,
} from '../lib/reviewCommit';
import type { PendingTxn } from '../db/queries/pending';
import type { Person } from '../db/queries/persons';

const person = (id: string): Person => ({ id, name: id } as Person);

const row = (over: Partial<PendingTxn> = {}): PendingTxn => ({
  id: 'r1',
  description: 'Cafe',
  amount: 50000,
  date: Date.now(),
  kind: 'expense',
  category: null,
  dest_group_id: null,
  split_draft: null,
  pay_method: null,
  counterparty_id: null,
  direction: 'debit',
  ...over,
} as PendingTxn);

const ctx = (over: Partial<ReviewContext> = {}): ReviewContext => ({
  meId: 'me',
  personalId: 'personal',
  sharedGroups: [{ id: 'g1', name: 'Trip' }],
  groupMembers: { g1: [person('me'), person('you')] },
  ...over,
});

const equalSplit = (ids: string[]): SplitState => ({ included: ids, mode: 'equal', values: {} });
const plan = (c: ReviewContext, r: PendingTxn, edits: Partial<RowEdit> = {}, s?: SplitState) => {
  const v = effectiveRow(r, edits);
  return planCommit(c, r, v, s ?? equalSplit(c.groupMembers[v.dest]?.map(m => m.id) ?? []));
};

describe('effectiveRow', () => {
  it('layers local edits over the persisted draft', () => {
    const v = effectiveRow(row({ category: 'Food' }), { category: 'Travel' });
    expect(v.category).toBe('Travel');
  });

  it('falls back to the persisted values with no edits', () => {
    const v = effectiveRow(row({ category: 'Food', amount: 12300 }), undefined);
    expect(v.category).toBe('Food');
    expect(v.amount).toBe('123');
  });

  it('renders a null category as an empty string', () => {
    expect(effectiveRow(row({ category: null }), undefined).category).toBe('');
  });

  it('forces income to be personal even if a group was chosen', () => {
    const v = effectiveRow(row({ dest_group_id: 'g1' }), { kind: 'income' });
    expect(v.dest).toBe('personal');
  });

  it('drops the counterparty on anything but a group transfer', () => {
    const asExpense = effectiveRow(row({ counterparty_id: 'you', dest_group_id: 'g1' }), { kind: 'expense' });
    expect(asExpense.counterparty).toBe('');

    const asPersonalTransfer = effectiveRow(row({ counterparty_id: 'you' }), { kind: 'settlement', dest: 'personal' });
    expect(asPersonalTransfer.counterparty).toBe('');
  });

  it('keeps the counterparty on a group transfer', () => {
    const v = effectiveRow(row({ counterparty_id: 'you', dest_group_id: 'g1', kind: 'settlement' }), undefined);
    expect(v.counterparty).toBe('you');
  });

  it('converts paise to a rupee string', () => {
    expect(effectiveRow(row({ amount: 999 }), undefined).amount).toBe('9.99');
  });
});

describe('effectiveSplit', () => {
  const members = [person('me'), person('you')];

  it('defaults to an equal split across all members', () => {
    expect(effectiveSplit(row(), undefined, members)).toEqual({ included: ['me', 'you'], mode: 'equal', values: {} });
  });

  it('prefers the in-memory state when present', () => {
    const local = equalSplit(['me']);
    expect(effectiveSplit(row(), local, members)).toBe(local);
  });

  it('reads a persisted draft', () => {
    const draft = JSON.stringify({ included: ['you'], mode: 'exact', values: { you: '100' } });
    expect(effectiveSplit(row({ split_draft: draft }), undefined, members)).toEqual({
      included: ['you'], mode: 'exact', values: { you: '100' },
    });
  });

  it('falls back to defaults when the persisted draft is corrupt', () => {
    const out = effectiveSplit(row({ split_draft: '{oops' }), undefined, members);
    expect(out.included).toEqual(['me', 'you']);
  });

  it('fills missing fields of a partial draft', () => {
    const out = effectiveSplit(row({ split_draft: JSON.stringify({ mode: 'shares' }) }), undefined, members);
    expect(out).toEqual({ included: ['me', 'you'], mode: 'shares', values: {} });
  });

  /**
   * A draft is a JSON blob of person ids that can sit in `pending_txn` for weeks,
   * and nothing about removing somebody from a group touches it. Committing it
   * verbatim wrote a `txn_share` for a non-member: the ledger showed a share
   * belonging to somebody not in the group, balances reported a debt against
   * them, and "who paid what" stopped adding up to its own total.
   */
  it('drops people who are no longer in the group', () => {
    const draft = JSON.stringify({ included: ['me', 'you', 'gone'], mode: 'equal', values: {} });
    const out = effectiveSplit(row({ split_draft: draft }), undefined, members);
    expect(out.included).toEqual(['me', 'you']);
  });

  it('drops their per-person amount too, so the split still sums to the total', () => {
    const draft = JSON.stringify({
      included: ['me', 'gone'], mode: 'exact', values: { me: '250', gone: '250' },
    });
    const out = effectiveSplit(row({ split_draft: draft }), undefined, members);
    expect(out).toEqual({ included: ['me'], mode: 'exact', values: { me: '250' } });
  });

  it('falls back to an equal split rather than an empty one when everyone has left', () => {
    const draft = JSON.stringify({ included: ['gone', 'alsogone'], mode: 'percent', values: { gone: '50' } });
    const out = effectiveSplit(row({ split_draft: draft }), undefined, members);
    // Never empty: `validateShares` would refuse that, with nothing on screen saying why.
    expect(out).toEqual({ included: ['me', 'you'], mode: 'equal', values: {} });
  });

  // The same filter, reached a different way: the user picked another destination
  // group after drafting the split, so the draft names the old group's members.
  it('drops ids that belong to a different group after the destination changes', () => {
    const draft = JSON.stringify({ included: ['me', 'flatmate'], mode: 'equal', values: {} });
    const out = effectiveSplit(row({ split_draft: draft }), undefined, [person('me'), person('aarav')]);
    expect(out.included).toEqual(['me']);
  });

  it('yields an empty included list when the group has no members', () => {
    expect(effectiveSplit(row(), undefined, []).included).toEqual([]);
  });
});

describe('snapshotRow', () => {
  it('captures the effective state, not the stored state', () => {
    const v = effectiveRow(row({ category: 'Food' }), { category: 'Travel', amount: '99' });
    const snap = snapshotRow(row({ category: 'Food' }), v, equalSplit([]));
    expect(snap.category).toBe('Travel');
    expect(snap.amount).toBe(9900);
  });

  it('stores a split draft only for a group expense', () => {
    const groupExpense = effectiveRow(row({ dest_group_id: 'g1' }), {});
    expect(snapshotRow(row(), groupExpense, equalSplit(['me'])).split_draft).toContain('me');

    const personal = effectiveRow(row(), {});
    expect(snapshotRow(row(), personal, equalSplit(['me'])).split_draft).toBeNull();

    const groupTransfer = effectiveRow(row({ dest_group_id: 'g1' }), { kind: 'settlement' });
    expect(snapshotRow(row(), groupTransfer, equalSplit(['me'])).split_draft).toBeNull();
  });

  it('normalises empty strings back to null columns', () => {
    const v = effectiveRow(row(), { category: '', payMethod: '', counterparty: '' });
    const snap = snapshotRow(row(), v, equalSplit([]));
    expect(snap.category).toBeNull();
    expect(snap.pay_method).toBeNull();
    expect(snap.counterparty_id).toBeNull();
  });
});

describe('payerFor', () => {
  it('uses the active view payer when they are a group member', () => {
    expect(payerFor(ctx({ viewPaidBy: 'you' }), 'g1')).toBe('you');
  });
  it('falls back to me when the view payer is not in that group', () => {
    expect(payerFor(ctx({ viewPaidBy: 'stranger' }), 'g1')).toBe('me');
  });
  it('falls back to me when no view is active', () => {
    expect(payerFor(ctx(), 'g1')).toBe('me');
  });
});

describe('planCommit — readiness', () => {
  it('rejects a zero, empty or non-numeric amount', () => {
    expect(plan(ctx(), row(), { amount: '0' }).ok).toBe(false);
    expect(plan(ctx(), row(), { amount: '' }).ok).toBe(false);
    expect(plan(ctx(), row(), { amount: 'abc' }).ok).toBe(false);
    expect(plan(ctx(), row(), { amount: '0.00' }).ok).toBe(false);
  });

  // parseToPaise strips the sign, and the Review amount field filters [^0-9.]
  // on input — so a negative can never reach here. Pinned so a future change to
  // either side is a deliberate decision rather than a silent one.
  it('treats a signed amount as its magnitude (sign is stripped upstream)', () => {
    expect(plan(ctx(), row(), { amount: '-5' })).toMatchObject({ ok: true, total: 500 });
  });

  it('rejects when the screen has not loaded its ids yet', () => {
    expect(plan(ctx({ meId: '' }), row()).ok).toBe(false);
    expect(plan(ctx({ personalId: '' }), row()).ok).toBe(false);
  });

  it('rejects a group expense whose split does not add up', () => {
    const s: SplitState = { included: ['me', 'you'], mode: 'exact', values: { me: '100', you: '100' } };
    expect(plan(ctx(), row({ dest_group_id: 'g1' }), {}, s).ok).toBe(false);
  });

  it('rejects a group expense with nobody included', () => {
    expect(plan(ctx(), row({ dest_group_id: 'g1' }), {}, equalSplit([])).ok).toBe(false);
  });

  it('rejects a group transfer with no counterparty', () => {
    expect(plan(ctx(), row({ dest_group_id: 'g1' }), { kind: 'settlement', counterparty: '' }).ok).toBe(false);
  });

  it('rejects a group transfer whose counterparty is not a member', () => {
    const r = row({ dest_group_id: 'g1', kind: 'settlement', counterparty_id: 'stranger' });
    expect(plan(ctx(), r).ok).toBe(false);
  });
});

describe('planCommit — personal rows', () => {
  it('books a personal expense as my full share', () => {
    const p = plan(ctx(), row({ amount: 50000 }));
    expect(p).toMatchObject({
      ok: true, groupId: 'personal', kind: 'expense', payer: 'me', total: 50000,
      shares: [{ personId: 'me', amount: 50000 }], destName: 'Personal',
    });
  });

  it('books personal income with no shares', () => {
    const p = plan(ctx(), row(), { kind: 'income' });
    expect(p).toMatchObject({ ok: true, kind: 'income', shares: [] });
  });

  it('applies the per-kind default category when none is set', () => {
    expect(plan(ctx(), row())).toMatchObject({ category: DEFAULT_CATEGORY.expense });
    expect(plan(ctx(), row(), { kind: 'income' })).toMatchObject({ category: DEFAULT_CATEGORY.income });
    expect(plan(ctx(), row(), { kind: 'settlement' })).toMatchObject({ category: DEFAULT_CATEGORY.settlement });
  });

  it('keeps a user-chosen category over the default', () => {
    expect(plan(ctx(), row({ category: 'Food' }))).toMatchObject({ category: 'Food' });
  });

  it('omits payMethod when unset', () => {
    expect((plan(ctx(), row()) as { payMethod?: string }).payMethod).toBeUndefined();
  });
});

// The one-sided personal transfer is deliberate: computeCash does
// "− settledOut + settledIn", so booking both sides would net to zero.
describe('planCommit — personal transfers move cash one way', () => {
  it('an outbound transfer carries only a payment', () => {
    const p = plan(ctx(), row({ kind: 'settlement', direction: 'debit' }));
    expect(p).toMatchObject({
      ok: true, kind: 'settlement', groupId: 'personal',
      payments: [{ personId: 'me', amount: 50000 }],
      shares: [],
    });
  });

  it('an inbound transfer carries only a share', () => {
    const p = plan(ctx(), row({ kind: 'settlement', direction: 'credit' }));
    expect(p).toMatchObject({
      ok: true, kind: 'settlement', groupId: 'personal',
      payments: [],
      shares: [{ personId: 'me', amount: 50000 }],
    });
  });

  it('never books both sides (which would net to zero)', () => {
    for (const direction of ['debit', 'credit'] as const) {
      const p = plan(ctx(), row({ kind: 'settlement', direction })) as {
        payments: unknown[]; shares: unknown[];
      };
      expect(p.payments.length === 0 || p.shares.length === 0).toBe(true);
    }
  });
});

describe('planCommit — group transfers settle two-sided', () => {
  const groupTransfer = (direction: 'debit' | 'credit') =>
    plan(ctx(), row({ dest_group_id: 'g1', kind: 'settlement', counterparty_id: 'you', direction }));

  it('outbound: I pay, they receive', () => {
    expect(groupTransfer('debit')).toMatchObject({
      ok: true, groupId: 'g1', payer: 'me',
      payments: [{ personId: 'me', amount: 50000 }],
      shares: [{ personId: 'you', amount: 50000 }],
    });
  });

  it('inbound: they pay, I receive', () => {
    expect(groupTransfer('credit')).toMatchObject({
      ok: true, groupId: 'g1', payer: 'you',
      payments: [{ personId: 'you', amount: 50000 }],
      shares: [{ personId: 'me', amount: 50000 }],
    });
  });

  it('always balances — payments total equals shares total', () => {
    for (const d of ['debit', 'credit'] as const) {
      const p = groupTransfer(d) as { payments: { amount: number }[]; shares: { amount: number }[] };
      const paid = p.payments.reduce((s, x) => s + x.amount, 0);
      const owed = p.shares.reduce((s, x) => s + x.amount, 0);
      expect(paid).toBe(owed);
    }
  });

  it('names the destination group', () => {
    expect(groupTransfer('debit')).toMatchObject({ destName: 'Trip' });
  });
});

describe('planCommit — group expenses', () => {
  it('splits equally across included members', () => {
    const p = plan(ctx(), row({ dest_group_id: 'g1', amount: 50000 }), {}, equalSplit(['me', 'you']));
    expect(p).toMatchObject({
      ok: true, groupId: 'g1', kind: 'expense', payer: 'me', total: 50000,
      shares: [{ personId: 'me', amount: 25000 }, { personId: 'you', amount: 25000 }],
    });
  });

  it('shares always sum to the total', () => {
    // 3-way split of an amount that does not divide evenly.
    const c = ctx({ groupMembers: { g1: [person('a'), person('b'), person('c')] }, meId: 'a' });
    const p = plan(c, row({ dest_group_id: 'g1', amount: 10000 }), {}, equalSplit(['a', 'b', 'c'])) as {
      shares: { amount: number }[];
    };
    expect(p.shares.reduce((s, x) => s + x.amount, 0)).toBe(10000);
  });

  it('uses the active view payer for the group', () => {
    const p = plan(ctx({ viewPaidBy: 'you' }), row({ dest_group_id: 'g1' }), {}, equalSplit(['me', 'you']));
    expect(p).toMatchObject({ payer: 'you' });
  });

  it('forces the kind to expense even if the row said income', () => {
    // income is coerced to personal by effectiveRow, so a group row is never income.
    const v = effectiveRow(row({ dest_group_id: 'g1' }), { kind: 'income' });
    expect(v.dest).toBe('personal');
  });

  it('falls back to a generic destination name for an unknown group', () => {
    const c = ctx({ sharedGroups: [], groupMembers: { g1: [person('me')] } });
    expect(plan(c, row({ dest_group_id: 'g1' }), {}, equalSplit(['me']))).toMatchObject({ destName: 'group' });
  });
});

describe('toRecurRows — what qualifies as recurring evidence', () => {
  const snap = (over: Record<string, unknown> = {}) => ({
    txnId: 't1',
    snap: { kind: 'expense', source: 'import', category: 'Bills', description: 'Netflix', amount: 49900, date: 1, ...over },
  });

  it('keeps an imported, categorised expense', () => {
    expect(toRecurRows([snap()])).toHaveLength(1);
  });

  it('drops a manually-typed row — you would have used the recurring toggle', () => {
    expect(toRecurRows([snap({ source: 'manual' })])).toEqual([]);
    // An absent source is manual too, not unknown.
    expect(toRecurRows([snap({ source: null })])).toEqual([]);
  });

  it('drops income and transfers', () => {
    expect(toRecurRows([snap({ kind: 'income' })])).toEqual([]);
    expect(toRecurRows([snap({ kind: 'settlement' })])).toEqual([]);
  });

  it('drops an uncategorised row, which has nothing to group by', () => {
    expect(toRecurRows([snap({ category: null })])).toEqual([]);
    expect(toRecurRows([snap({ category: '' })])).toEqual([]);
  });

  it('carries the committed txn id through, not the pending id', () => {
    expect(toRecurRows([snap()])[0].id).toBe('t1');
  });
});

/**
 * The mapper that turns a plan into what `insertTxn` writes. It had no test at
 * all, and it was silently dropping `source` — so every row committed through
 * Review was recorded as hand-typed, whatever it actually came from. Once the
 * pending row is deleted, `txn.source` is the only record left, so the loss is
 * permanent and invisible.
 */
describe('txnInputFromPlan', () => {
  const committed = (over: Partial<PendingTxn> = {}) => {
    const r = row(over);
    const p = plan(ctx(), r, { amount: '500' });
    if (!p.ok) throw new Error('expected a valid plan');
    return txnInputFromPlan(r, p);
  };

  it('carries where the row came from', () => {
    expect(committed({ source: 'gpay' }).source).toBe('gpay');
    expect(committed({ source: 'bank_csv' }).source).toBe('bank_csv');
  });

  it('carries the location the import captured', () => {
    // Only Scan & Pay has one — it is the single ingest route running while the
    // user is actually at the merchant, so losing it here loses the real thing.
    const out = committed({ lat: 28.45, lng: 77.09, place_label: 'Cyber Hub' });
    expect(out.lat).toBe(28.45);
    expect(out.lng).toBe(77.09);
    expect(out.placeLabel).toBe('Cyber Hub');
  });

  it('leaves location undefined when the import had none', () => {
    // Statement and email imports arrive days later; a location captured then
    // would be the user's sofa, recorded as though it were the shop.
    const out = committed();
    expect(out.lat).toBeUndefined();
    expect(out.placeLabel).toBeUndefined();
  });
});
