import AsyncStorage from '@react-native-async-storage/async-storage';
import { PENDING_PAYMENT_MIN_AWAY_MS, PENDING_PAYMENT_TTL_MS } from './pendingPayment';

/**
 * A settle-up we handed off to a UPI app and have not yet asked about.
 *
 * Sibling of `pendingPayment.ts`, and deliberately a separate record rather than a
 * variant of it. The two answer the same question — "did that go through?" — but
 * write different things: a scanned payment lands in `pending_txn` for Review,
 * because its category, group and split are all still guesses. A settlement has
 * none of that ambiguity — from, to, amount and scope were chosen by the user
 * *before* the hand-off — so a confirmed one goes straight to the ledger, exactly
 * as it would have if they had tapped Save themselves.
 *
 * **The resolved plan is stored, not the inputs.** `planAllGroupsSettlement` reads
 * live balances, so re-planning at confirm time could quietly settle a different
 * group than the one the user was looking at when they paid. This is the same call
 * `applyOverspendRaid` makes, for the same reason: what was shown is what happens.
 *
 * Nothing reaches the ledger until the user says yes — the app still never records
 * a settlement it did not observe, it records one the user asserts.
 */
export type PendingSettlementPlan = {
  groupId: string;
  from: string;
  to: string;
  amount: number;
};

export type PendingSettlement = {
  /** Already resolved against the balances the user saw. Never re-planned. */
  plans: PendingSettlementPlan[];
  /** Total across all plans, for the prompt. */
  amountPaise: number;
  /** Who is being paid, for the prompt. */
  payeeName: string;
  category: string;
  note?: string;
  payMethod?: string;
  /** The date the user picked on the form, not the confirm time. */
  date: number;
  /** When we handed off — used to ignore a stale record. */
  startedAt: number;
};

const KEY = 'pending_upi_settlement_v1';

/** Same window as a scanned payment — see `pendingPayment.ts` for the reasoning. */
export { PENDING_PAYMENT_MIN_AWAY_MS, PENDING_PAYMENT_TTL_MS };

export async function setPendingSettlement(s: PendingSettlement | null): Promise<void> {
  if (s === null) await AsyncStorage.removeItem(KEY);
  else await AsyncStorage.setItem(KEY, JSON.stringify(s));
}

export async function getPendingSettlement(): Promise<PendingSettlement | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as PendingSettlement;
    // A corrupt or half-written record is indistinguishable from no record. Money
    // moves off the back of this one, so the guard is stricter than the expense
    // path's: every plan must name both ends and carry a positive amount.
    if (!Array.isArray(s?.plans) || s.plans.length === 0) return null;
    if (typeof s.amountPaise !== 'number' || s.amountPaise <= 0) return null;
    for (const p of s.plans) {
      if (!p?.groupId || !p.from || !p.to) return null;
      if (typeof p.amount !== 'number' || p.amount <= 0) return null;
    }
    return s;
  } catch {
    return null;
  }
}

/** Whether enough — but not too much — time has passed to ask about this hand-off. */
export function shouldAskAboutSettlement(s: PendingSettlement, nowMs: number): boolean {
  const away = nowMs - s.startedAt;
  return away >= PENDING_PAYMENT_MIN_AWAY_MS && away <= PENDING_PAYMENT_TTL_MS;
}
