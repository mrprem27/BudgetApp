import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A UPI payment we handed off and have not yet asked about.
 *
 * The app cannot observe whether a payment succeeded — it only opens someone else's
 * app with the fields filled in. So the handoff is remembered here, across the app
 * switch, and on return the user is asked once. Same shape and reasoning as
 * `lib/overspendNotice.ts`: something happens while the UI isn't looking, and is
 * worthless unless it survives to the moment the user can answer.
 *
 * Nothing is written to the ledger until they say yes. That is the whole point — a
 * cancelled payment must not leave a phantom expense behind, which is the failure
 * mode of recording optimistically at handoff time.
 */
export type PendingPayment = {
  vpa: string;
  /** Payee/merchant name, when the QR carried one. */
  name?: string;
  amountPaise: number;
  /** Category guessed from the merchant name at scan time. */
  category?: string;
  /** When we handed off — used to ignore a stale record. */
  startedAt: number;
};

const KEY = 'pending_upi_payment_v1';

/**
 * Older than this and we don't ask. Someone who scanned, got distracted and came back
 * the next day will not remember, and a wrongly-confirmed expense is worse than a
 * missed one — they can still add it by hand.
 */
export const PENDING_PAYMENT_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Below this, they almost certainly bounced straight back without paying — the UPI
 * app barely had time to open. Asking would train people to dismiss the prompt.
 */
export const PENDING_PAYMENT_MIN_AWAY_MS = 5000;

export async function setPendingPayment(p: PendingPayment | null): Promise<void> {
  if (p === null) await AsyncStorage.removeItem(KEY);
  else await AsyncStorage.setItem(KEY, JSON.stringify(p));
}

export async function getPendingPayment(): Promise<PendingPayment | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as PendingPayment;
    // A corrupt or half-written record is indistinguishable from no record.
    if (!p?.vpa || typeof p.amountPaise !== 'number' || p.amountPaise <= 0) return null;
    return p;
  } catch {
    return null;
  }
}

/** Whether enough — but not too much — time has passed to ask about this handoff. */
export function shouldAskAbout(p: PendingPayment, nowMs: number): boolean {
  const away = nowMs - p.startedAt;
  return away >= PENDING_PAYMENT_MIN_AWAY_MS && away <= PENDING_PAYMENT_TTL_MS;
}
