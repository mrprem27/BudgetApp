import type { PayMethod } from '../constants/enums';

/**
 * Detect how a payment was made from the plain text of an ingested transaction
 * (a bank/UPI alert email today; a bank/UPI-app notification later). Pure, no
 * DB / RN — unit-tested. Best-effort: returns null when nothing matches, and the
 * Review inbox lets the user set/override it. The detected value is a *suggestion*.
 *
 * Order matters: the more specific / higher-signal cues are tested first so a
 * mail that says both "UPI" and "credit card" resolves to the dominant instrument.
 */

// autopay first — a mandate debit often also names the instrument ("e-mandate on
// your card"), but the defining fact is that it's an automatic recurring debit.
const AUTOPAY_RE = /\b(?:auto[\s-]?pay|autopay|e-?mandate|mandate|standing instruction|si\s+debit|auto[\s-]?debit)\b/i;
// Cards — "card ending 1234", "credit/debit card", "xx1234 card".
const CARD_RE = /\b(?:credit card|debit card|card ending|card no|card x{2,}\d+|ending in \d{3,4}|\bcard\b)\b/i;
// Bank rails — NEFT / IMPS / RTGS / net banking / bank transfer.
const BANK_RE = /\b(?:neft|imps|rtgs|net[\s-]?banking|internet banking|bank transfer|a\/c transfer)\b/i;
// Wallets — named wallets or an explicit "wallet balance".
const WALLET_RE = /\b(?:wallet|paytm balance|amazon pay balance|amazon pay|mobikwik|freecharge|ola money|phonepe wallet)\b/i;
// UPI — VPA handles (name@bank), "via UPI", UPI ref, "you paid".
const UPI_RE = /(?:@[a-z]{2,}\b|\bupi\b|\bvpa\b|\bp2p\b|unified payments)/i;
// Cash — rarely in alerts, but explicit "cash".
const CASH_RE = /\bcash\b/i;

/** Best-effort pay-method from ingested text, or null. */
export function detectPayMethod(text: string | null | undefined): PayMethod | null {
  const t = text ?? '';
  if (!t) return null;
  if (AUTOPAY_RE.test(t)) return 'autopay';
  if (WALLET_RE.test(t)) return 'wallet';
  if (UPI_RE.test(t)) return 'upi';
  if (CARD_RE.test(t)) return 'card';
  if (BANK_RE.test(t)) return 'bank';
  if (CASH_RE.test(t)) return 'cash';
  return null;
}
