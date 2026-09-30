import { PayMethod, type PayFrom } from '../constants/enums';

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
// A debit card is the bank account (`W1-06`): the money leaves the bank, and nothing is owed on a
// card. Tested before CARD_RE, which would otherwise book it as credit-card debt.
const DEBIT_CARD_RE = /\bdebit[\s-]?card\b/i;
// Credit cards — "credit card", "card ending 1234", "xx1234 card". A bare card with no word for
// which kind stays Card; Review lets you change it.
const CARD_RE = /\b(?:credit card|card ending|card no|card x{2,}\d+|ending in \d{3,4}|\bcard\b)\b/i;
// Bank rails — NEFT / IMPS / RTGS / net banking / bank transfer.
const BANK_RE = /\b(?:neft|imps|rtgs|net[\s-]?banking|internet banking|bank transfer|a\/c transfer)\b/i;
// Wallets — named wallets or an explicit "wallet balance".
const WALLET_RE = /\b(?:wallet|paytm balance|amazon pay balance|amazon pay|mobikwik|freecharge|ola money|phonepe wallet)\b/i;
// UPI — VPA handles (name@bank), "via UPI", UPI ref, "you paid".
const UPI_RE = /(?:@[a-z]{2,}\b|\bupi\b|\bvpa\b|\bp2p\b|unified payments)/i;
// Cash — rarely in alerts, but explicit "cash".
const CASH_RE = /\bcash\b/i;

/**
 * Where the money came from, when the text says so and it is not the usual for its How (`U-48`):
 * a UPI payment that names a credit card is card debt, not money out of the bank.
 */
export function detectPayFrom(text: string | null | undefined): PayFrom | undefined {
  const t = text ?? '';
  return UPI_RE.test(t) && /\bcredit[\s-]?card\b/i.test(t) ? 'credit' : undefined;
}

/** Best-effort pay-method from ingested text, or null. */
export function detectPayMethod(text: string | null | undefined): PayMethod | null {
  const t = text ?? '';
  if (!t) return null;
  if (AUTOPAY_RE.test(t)) return PayMethod.Autopay;
  if (WALLET_RE.test(t)) return PayMethod.Wallet;
  if (UPI_RE.test(t)) return PayMethod.Upi;
  if (DEBIT_CARD_RE.test(t)) return PayMethod.Bank;
  if (CARD_RE.test(t)) return PayMethod.Card;
  if (BANK_RE.test(t)) return PayMethod.Bank;
  if (CASH_RE.test(t)) return PayMethod.Cash;
  return null;
}
