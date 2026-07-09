import { parseToPaise, splitByMode } from './money';
import type { SplitMode } from '../constants/enums';
import type { Person } from '../db/queries/persons';

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

/** A tax / tip / discount adjustment on an itemized bill. */
export type Adjustment = {
  label: string;
  type: 'tax' | 'tip' | 'discount';
  mode: 'flat' | 'percent';
  value: string;
};

/** Bill total (paise) after applying tax/tip/discount adjustments to a subtotal. */
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

  const raw: Record<string, number> = {};
  for (const m of members) raw[m.id] = 0;

  for (const item of items) {
    if (item.assignedTo.length === 0) continue;
    // Split the item by its own mode, then scale each share by the adjustment ratio.
    const base = computeItemSubtotal(item);
    const split = splitItemBase(item, base);
    for (const pid of item.assignedTo) {
      raw[pid] = (raw[pid] ?? 0) + Math.round((split[pid] ?? 0) * ratio);
    }
  }

  const assigned = Object.values(raw).reduce((a, b) => a + b, 0);
  const unassignedItems = items.filter(i => i.assignedTo.length === 0);
  if (unassignedItems.length === 0) {
    let diff = total - assigned;
    for (const m of members) {
      if (diff === 0) break;
      if (raw[m.id] > 0) { raw[m.id] += diff > 0 ? 1 : -1; diff += diff > 0 ? -1 : 1; }
    }
  }

  return raw;
}
