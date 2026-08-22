import type { PendingTxn } from '../db/queries/pending';
import type { Person } from '../db/queries/persons';
import type { ParsedDirection } from './importParse';
import { parseToPaise, splitByMode } from './money';
import { validateShares } from './splitMath';
import type { TxnKind, SplitMode, PayMethod } from '../constants/enums';

/**
 * Pure commit logic for the Review inbox — how a pending row resolves into the
 * transaction that gets written. Extracted from `app/review.tsx` so the money
 * shape (who pays, who owes, which direction) is unit-testable in isolation;
 * the screen keeps the state, the writes and the Undo.
 */

// payMethod: '' = none/unset (row need not have one).
export type RowEdit = {
  kind: TxnKind;
  category: string;
  amount: string;
  dest: string;
  payMethod: PayMethod | '';
  counterparty: string;
  direction: ParsedDirection;
};

export type SplitState = { included: string[]; mode: SplitMode; values: Record<string, string> };

// A committable row resolved to its insert shape, or the reason it isn't ready.
// `payments` defaults to "the payer paid the whole amount" — only an inbound
// transfer overrides it (with none, so the money reads as arriving).
export type CommitPlan =
  | {
      ok: true; groupId: string; kind: TxnKind; payer: string;
      shares: { personId: string; amount: number }[];
      payments?: { personId: string; amount: number }[];
      total: number; category: string; payMethod?: PayMethod; snap: PendingTxn; destName: string;
    }
  | { ok: false };

/** Fallback category when the user never picked one, per kind. */
export const DEFAULT_CATEGORY: Record<TxnKind, string> = {
  expense: 'Other', income: 'Other Income', settlement: 'Repayment',
};

/** Everything `planCommit` needs to know about the screen's loaded data. */
export type ReviewContext = {
  meId: string;
  personalId: string;
  sharedGroups: { id: string; name: string }[];
  groupMembers: Record<string, Person[]>;
  /** Payer carried by the active saved view, if one is applied. */
  viewPaidBy?: string | null;
};

/** Effective values for a row = local edits layered over the persisted draft columns. */
export function effectiveRow(row: PendingTxn, edits: Partial<RowEdit> | undefined): RowEdit {
  const e = edits ?? {};
  const kind = e.kind ?? row.kind;
  const persistedDest = row.dest_group_id ?? 'personal';
  // An expense can be split into a group; a transfer can be *settled* in one
  // (against a member). Income matches Quick and is always personal.
  const dest = kind === 'income' ? 'personal' : (e.dest ?? persistedDest);
  return {
    kind,
    category: e.category ?? row.category ?? '',
    amount: e.amount ?? String(row.amount / 100),
    dest,
    payMethod: e.payMethod ?? row.pay_method ?? '',
    // Only a transfer into a group has a counterparty; anything else drops it
    // so a leftover pick can't follow the row into another shape.
    counterparty: kind === 'settlement' && dest !== 'personal'
      ? (e.counterparty ?? row.counterparty_id ?? '')
      : '',
    direction: e.direction ?? row.direction,
  };
}

/** Effective split state = local edits over the persisted `split_draft`. */
export function effectiveSplit(
  row: PendingTxn,
  local: SplitState | undefined,
  members: Person[],
): SplitState {
  if (local) return local;
  if (row.split_draft) {
    try {
      const d = JSON.parse(row.split_draft) as Partial<SplitState>;
      return {
        included: d.included ?? members.map(m => m.id),
        mode: d.mode ?? 'equal',
        values: d.values ?? {},
      };
    } catch { /* fall through to defaults */ }
  }
  return { included: members.map(m => m.id), mode: 'equal', values: {} };
}

/** Snapshot a row's CURRENT effective state so Undo restores exactly that. */
export function snapshotRow(row: PendingTxn, v: RowEdit, split: SplitState): PendingTxn {
  const isGroup = v.dest !== 'personal';
  return {
    ...row,
    kind: v.kind,
    category: v.category || null,
    amount: parseToPaise(v.amount),
    dest_group_id: isGroup ? v.dest : null,
    split_draft: isGroup && v.kind === 'expense' ? JSON.stringify(split) : null,
    pay_method: v.payMethod || null,
    counterparty_id: v.counterparty || null,
    direction: v.direction,
  };
}

/** Who paid a group row: the active view's payer if they're a member of that
 *  group, otherwise me. Personal rows are always me. */
export function payerFor(ctx: ReviewContext, groupId: string): string {
  const p = ctx.viewPaidBy;
  if (p && (ctx.groupMembers[groupId] ?? []).some(m => m.id === p)) return p;
  return ctx.meId;
}

/** Resolve a row to its insert shape, or mark it not-ready. Pure — no writes. */
export function planCommit(
  ctx: ReviewContext,
  row: PendingTxn,
  v: RowEdit,
  split: SplitState,
): CommitPlan {
  if (!ctx.personalId || !ctx.meId) return { ok: false };
  const total = parseToPaise(v.amount);
  if (total <= 0) return { ok: false };
  const category = v.category || DEFAULT_CATEGORY[v.kind];
  const payMethod = v.payMethod || undefined;
  const groupName = (id: string) => ctx.sharedGroups.find(g => g.id === id)?.name ?? 'group';
  const snap = snapshotRow(row, v, split);

  if (v.kind === 'settlement') {
    // Which way the money moved. Seeded from the statement (debit = left your
    // account, credit = arrived) but editable: not every export signs its
    // amounts, and money arriving can be a transfer TO you rather than income.
    const inbound = v.direction === 'credit';
    if (v.dest !== 'personal') {
      // Settling with a member: the same two-sided shape `recordSettlement`
      // writes, so it moves who-owes-whom exactly like Settle up does.
      const members = ctx.groupMembers[v.dest] ?? [];
      const other = v.counterparty;
      if (!other || !members.some(m => m.id === other) || !members.some(m => m.id === ctx.meId)) return { ok: false };
      const fromId = inbound ? other : ctx.meId;
      const toId = inbound ? ctx.meId : other;
      return {
        ok: true, groupId: v.dest, kind: 'settlement', payer: fromId, total, category, payMethod, snap,
        payments: [{ personId: fromId, amount: total }],
        shares: [{ personId: toId, amount: total }],
        destName: groupName(v.dest),
      };
    }
    // Personal: money moved but there's no counterparty to owe. Recording it
    // one-sided is what makes the cash position move the right way —
    // `computeCash` does `− settledOut + settledIn`, so an outbound transfer
    // carries only a payment and an inbound one only a share. Booking both
    // sides would net to zero and silently hide the movement.
    return {
      ok: true, groupId: ctx.personalId, kind: 'settlement', payer: ctx.meId, total, category, payMethod, snap,
      payments: inbound ? [] : [{ personId: ctx.meId, amount: total }],
      shares: inbound ? [{ personId: ctx.meId, amount: total }] : [],
      destName: 'Personal',
    };
  }

  if (v.dest !== 'personal') {
    const byPerson = splitByMode(total, split.included, split.mode, split.values);
    const shares = split.included.map(id => ({ personId: id, amount: byPerson[id] ?? 0 }));
    // Same allocation rule the Quick-Add save path uses.
    if (!validateShares(total, shares).ok) return { ok: false };
    return {
      ok: true, groupId: v.dest, kind: 'expense', payer: payerFor(ctx, v.dest), total, category, payMethod, snap,
      shares,
      destName: groupName(v.dest),
    };
  }
  return {
    ok: true, groupId: ctx.personalId, kind: v.kind, payer: ctx.meId, total, category, payMethod, snap,
    // Income has no shares (canonical shape, matches Quick); expense = my full share.
    shares: v.kind === 'income' ? [] : [{ personId: ctx.meId, amount: total }],
    destName: 'Personal',
  };
}

/**
 * The `insertTxn` input a committed pending row becomes.
 *
 * Pure mapping, so it belongs here beside the plan it consumes rather than inline in the
 * screen — same reasoning as `planCommit` above: the screen keeps state, writes and Undo,
 * this file decides what a row *means*.
 *
 * The location is **carried, never recaptured.** Only Scan & Pay sets it, and it does so at
 * the moment of the scan while the user stands at the merchant. Reading the device's
 * position at commit time would stamp wherever they happen to be while reviewing, which is
 * indistinguishable from the real thing once written — and Review is usually done later,
 * elsewhere.
 */
export function txnInputFromPlan(row: PendingTxn, plan: Extract<CommitPlan, { ok: true }>) {
  return {
    groupId: plan.groupId,
    kind: plan.kind,
    entryMode: 'quick' as const,
    date: row.date,
    category: plan.category,
    note: row.description,
    payMethod: plan.payMethod,
    payments: plan.payments ?? [{ personId: plan.payer, amount: plan.total }],
    shares: plan.shares,
    // Where it came from, carried through the commit. Dropping it recorded every
    // reviewed row as hand-typed, when it came from a bank statement, a GPay
    // export or a UPI scan — and `txn.source` is the only record of that once the
    // pending row is deleted. Nothing reads it yet, which is exactly why it had to
    // be fixed before something does: the rows written meanwhile are unrecoverable.
    source: row.source,
    lat: row.lat ?? undefined,
    lng: row.lng ?? undefined,
    placeLabel: row.place_label ?? undefined,
  };
}
