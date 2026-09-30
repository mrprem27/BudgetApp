import { PayMethod } from '../constants/enums';

/**
 * Detect where the money came from, from the plain text of an ingested transaction
 * (a bank/UPI alert email today; a bank/UPI-app notification later). Pure, no
 * DB / RN — unit-tested. Best-effort: returns null when nothing matches, and the
 * Review inbox lets the user set/override it. The detected value is a *suggestion*.
 *
 * The text names HOW it was paid ("UPI", "mandate", "NEFT") — those words are still read, but only
 * to tell the source (`U-49`): the app stores From alone. UPI and an autopay run from the bank
 * unless the text names a credit card, in which case it is card debt.
 *
 * Order matters: the more specific / higher-signal cues are tested first.
 */

// An autopay mandate or a UPI payment is the bank — unless it names a credit card.
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

const CREDIT_CARD_RE = /\bcredit[\s-]?card\b/i;

/** Best-effort From from ingested text, or null. */
export function detectPayMethod(text: string | null | undefined): PayMethod | null {
  const t = text ?? '';
  if (!t) return null;
  if (AUTOPAY_RE.test(t)) return CREDIT_CARD_RE.test(t) ? PayMethod.Card : PayMethod.Bank;
  if (WALLET_RE.test(t)) return PayMethod.Wallet;
  if (UPI_RE.test(t)) return CREDIT_CARD_RE.test(t) ? PayMethod.Card : PayMethod.Bank;
  if (DEBIT_CARD_RE.test(t)) return PayMethod.Bank;
  if (CARD_RE.test(t)) return PayMethod.Card;
  if (BANK_RE.test(t)) return PayMethod.Bank;
  if (CASH_RE.test(t)) return PayMethod.Cash;
  return null;
}
