import { parseToPaise, splitByMode, largestRemainder } from './money';
import type { SplitMode } from '../constants/enums';
import type { Person } from '../db/queries/persons';
import type { ItemizedAdjustment } from '../db/queries/transactions';

/** A draft line item being entered on the Itemized screen (string fields = raw input). */
export type LineItemDraft = {
  id: string;
  name: string;
  qty: string;
  unitPrice: string;
  assignedTo: string[];
  /** How this item is split among `assignedTo`. Defaults to 'equal'. */
  splitMode?: SplitMode;
  /** Per-member raw input for non-equal modes: exact ₹ (exact), % (percent), or share count (shares). */
  splitValues?: Record<string, string>;
};

/**
 * Split one item's base amount (paise, pre-adjustment) among its assigned members
 * per the item's split mode. Reuses the app-wide split engine so itemized splits
 * match Quick/Transfer. Equal ignores splitValues; exact reads ₹ inputs directly
 * (any shortfall/overage is the user's remainder to reconcile).
 */
export function splitItemBase(item: LineItemDraft, base: number): Record<string, number> {
  return splitByMode(base, item.assignedTo, item.splitMode ?? 'equal', item.splitValues ?? {});
}

/** A tax / tip / discount / service-charge adjustment on an itemized bill.
 *  Same shape as the query layer's `ItemizedAdjustment` — typed from it so the
 *  two can't drift again (the DB type was missing `service` for months). */
export type Adjustment = ItemizedAdjustment;

/** Bill total (paise) after applying tax/tip/service/discount adjustments to a subtotal. */
export function computeAdjustedTotal(subtotal: number, adjustments: Adjustment[]): number {
  let total = subtotal;
  for (const adj of adjustments) {
    const val = parseToPaise(adj.value);
    const amount = adj.mode === 'percent' ? Math.round((subtotal * val) / 10000) : val;
    if (adj.type === 'discount') total -= amount;
    else total += amount;
  }
  return Math.max(0, total);
}

/** One line item's subtotal (paise) = qty x unit price. */
export function computeItemSubtotal(item: LineItemDraft): number {
  const qty = Math.max(1, parseInt(item.qty, 10) || 1);
  const price = parseToPaise(item.unitPrice);
  return qty * price;
}

/**
 * Per-person share (paise) of an itemized bill: each assigned item is split
 * equally among its people and scaled by the adjustment ratio; any rounding
 * remainder is nudged onto participants so the shares sum to the exact total.
 */
export function computePerPersonShares(
  items: LineItemDraft[],
  adjustments: Adjustment[],
  members: Person[],
): Record<string, number> {
  const subtotal = items.reduce((s, i) => s + computeItemSubtotal(i), 0);
  const total = computeAdjustedTotal(subtotal, adjustments);
  const ratio = subtotal > 0 ? total / subtotal : 1;

  /*
   * Each person's share of the SUBTOTAL first, exactly, with no scaling yet.
   *
   * The adjustment is then applied once, over the whole bill, by
   * `largestRemainder`. That ordering is the fix, and the previous one could
   * leave a bill permanently unsaveable.
   *
   * It scaled each person's slice of each item by `ratio` and rounded — so the
   * error was up to half a paise per item PER PERSON — and then tried to absorb
   * the total drift with a pass that moved at most ±1 paise per member. With more
   * items than members it simply could not close: four ₹100 dishes shared three
   * ways with a 5% service charge came out 1 paise over, the screen said
   * "₹0.01 over-assigned" with every item already assigned, and there was no
   * control anywhere that could change it. Save was dead.
   *
   * Rounding once, at the end, is exact by construction: the parts sum to the
   * total because that is what `largestRemainder` guarantees.
   */
  const base: Record<string, number> = {};
  for (const m of members) base[m.id] = 0;

  for (const item of items) {
    if (item.assignedTo.length === 0) continue;
    const itemBase = computeItemSubtotal(item);
    const split = splitItemBase(item, itemBase);
    for (const pid of item.assignedTo) {
      base[pid] = (base[pid] ?? 0) + (split[pid] ?? 0);
    }
  }

  // Something is unassigned, so the shares are NOT meant to reach the total —
  // the gap is what the screen asks the user to close. Scale each share on its
  // own and leave it short.
  if (items.some(i => i.assignedTo.length === 0)) {
    const scaled: Record<string, number> = {};
    for (const m of members) scaled[m.id] = Math.round((base[m.id] ?? 0) * ratio);
    return scaled;
  }

  const ids = members.map(m => m.id);
  const parts = largestRemainder(total, ids.map(id => base[id] ?? 0));
  const out: Record<string, number> = {};
  ids.forEach((id, i) => { out[id] = parts[i]; });
  return out;
}
