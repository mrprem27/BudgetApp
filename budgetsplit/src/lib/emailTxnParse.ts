import { parseToPaise } from './money';
import { detectPayMethod } from './payMethodDetect';
import type { ParsedRow, ParseResult } from './importParse';

/**
 * Parser for **bank / UPI / wallet transaction-ALERT emails** (HDFC, ICICI, SBI,
 * Axis, GPay, PhonePe, Paytm, etc.). One alert email = one transaction. Works on
 * the plain text of the email (subject + body); extraction/fetching the mail is a
 * separate concern (paste today, OAuth/IMAP later — see emailSource.ts). Pure (no
 * DB / RN), unit-tested; the Review inbox is the correction layer for anything
 * this can't nail (bank formats vary wildly, so this is best-effort, never throws).
 *
 * Recognized shapes (examples):
 *   "Rs. 950.00 has been debited from your A/c XX1234 on 01-Jun-2026 to Swiggy"
 *   "INR 1,200.00 credited to your account on 02/06/2026 from ACME SALARY"
 *   "You've paid ₹450 to BigBasket via UPI on 3 Jun 2026"
 *   "Your a/c is debited by Rs 2,499 towards Netflix on 05-06-26"
 */

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// Money: ₹ / Rs / Rs. / INR followed by an amount (thousands commas, optional paise).
const MONEY_RE = /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i;

// Direction keywords. "credited/received/refund" → money in; the rest → money out.
const CREDIT_RE = /\b(credited|received|refund(?:ed)?|deposited|cashback|added)\b/i;
const DEBIT_RE = /\b(debited|debit|paid|sent|spent|purchase[d]?|withdrawn|deducted|charged)\b/i;

// Counterparty. Capture a short token after the relationship word; stop before the
// next clause word (on/via/ref/…), a digit run, or end. Best-effort.
const STOP = 'on|via|ref|reference|txn|upi|dated|date|at\\b|a/c|acct|account|info|avl|available|bal';
const TO_RE = new RegExp(`\\b(?:paid to|sent to|to vpa|towards|to)\\s+([A-Za-z][A-Za-z0-9 &._'@-]{1,39}?)(?=\\s+(?:${STOP})\\b|[.,;\\n]|$)`, 'i');
const FROM_RE = new RegExp(`\\b(?:received from|credited by|from)\\s+([A-Za-z][A-Za-z0-9 &._'@-]{1,39}?)(?=\\s+(?:${STOP})\\b|[.,;\\n]|$)`, 'i');

const DMY_SLASH = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/;             // 02/06/2026 or 05-06-26 (dd/mm)
const DMON = /\b(\d{1,2})[-\s]([A-Za-z]{3})[a-z]*[-,\s]+(\d{4})\b/;         // 01-Jun-2026 / 3 Jun 2026
const ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/;                                   // 2026-06-01

/** Does this text look like a transaction alert (has money + a direction word)? */
export function isTransactionAlert(text: string): boolean {
  const t = text ?? '';
  return MONEY_RE.test(t) && (CREDIT_RE.test(t) || DEBIT_RE.test(t));
}

/** First date found in the text → epoch ms (local). Falls back to `now`. */
function parseAlertDate(text: string, now: number): number {
  const mon = DMON.exec(text);
  if (mon) {
    const month = MONTHS[mon[2].toLowerCase()];
    if (month !== undefined) {
      const d = new Date(Number(mon[3]), month, Number(mon[1]));
      if (!isNaN(d.getTime())) return d.getTime();
    }
  }
  const iso = ISO.exec(text);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (!isNaN(d.getTime()) && d.getMonth() === Number(iso[2]) - 1) return d.getTime();
  }
  const dmy = DMY_SLASH.exec(text);
  if (dmy) {
    const day = Number(dmy[1]), month = Number(dmy[2]);
    const yr = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(yr, month - 1, day);
      if (!isNaN(d.getTime()) && d.getMonth() === month - 1) return d.getTime();
    }
  }
  return now;
}

/** Trim/clean a captured counterparty (drop trailing noise, collapse spaces). */
function cleanParty(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/[\s.,;:-]+$/, '').trim();
}

/**
 * Parse one transaction-alert email → a single Review-inbox row (or none).
 * `nowMs` is injectable for deterministic tests; defaults to Date.now().
 */
export function parseTransactionEmail(text: string, nowMs: number = Date.now()): ParseResult {
  const raw = (text ?? '').trim();
  if (!raw) return { rows: [], skipped: 0 };

  const money = MONEY_RE.exec(raw);
  if (!money) return { rows: [], skipped: 1 };
  const amount = parseToPaise(money[1]);
  if (amount <= 0) return { rows: [], skipped: 1 };

  // Direction: an explicit credit word (and no debit word) → income; else expense.
  const hasCredit = CREDIT_RE.test(raw);
  const hasDebit = DEBIT_RE.test(raw);
  const isCredit = hasCredit && !hasDebit;
  const kind = isCredit ? 'income' as const : 'expense' as const;
  const direction = isCredit ? 'credit' as const : 'debit' as const;

  // Counterparty: income prefers "from X", spend prefers "to/at X".
  const party = isCredit
    ? (FROM_RE.exec(raw)?.[1] ?? TO_RE.exec(raw)?.[1])
    : (TO_RE.exec(raw)?.[1] ?? FROM_RE.exec(raw)?.[1]);
  const description = party ? cleanParty(party) : (isCredit ? 'Credit' : 'Imported');

  return {
    rows: [{
      date: parseAlertDate(raw, nowMs),
      amount,
      description: description || 'Imported',
      direction,
      kind,
      payMethod: detectPayMethod(raw) ?? undefined,
      raw: raw.slice(0, 300),
    }],
    skipped: 0,
  };
}
