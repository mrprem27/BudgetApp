/**
 * On-device receipt OCR (Apple Vision via the `expo-ocr` native module, iOS only —
 * no Android engine exists). Two parsers run on the same raw text: a single-total
 * extractor (used as a fallback/cross-check) and a best-effort, non-AI line-item
 * heuristic. Neither is meant to be perfect — the raw OCR text is always shown
 * alongside the parsed result (see ReceiptScanSheet) so a miss is easy to catch
 * and fix manually, rather than silently wrong.
 */
import { recognizeText } from 'expo-ocr';

export { recognizeText };

const AMOUNT_REGEX = /(?:total|amount|grand\s*total|net|balance|due)[:\s]*(?:₹|rs\.?|inr)?\s*([\d,]+\.?\d{0,2})/i;
const AMOUNT_FALLBACK = /₹\s*([\d,]+\.?\d{0,2})/;

export function parseReceiptText(text: string): { amount: number | null; note: string | null } {
  if (!text) return { amount: null, note: null };

  let match = text.match(AMOUNT_REGEX);
  if (!match) match = text.match(AMOUNT_FALLBACK);

  let amount: number | null = null;
  if (match?.[1]) {
    const cleaned = match[1].replace(/,/g, '');
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed) && parsed > 0) {
      amount = Math.round(parsed * 100);
    }
  }

  const firstLine = text.split('\n').find(l => l.trim().length > 2 && !/^(total|amount|tax|receipt)/i.test(l.trim()));
  const note = firstLine?.trim().slice(0, 60) ?? null;

  return { amount, note };
}

export type ParsedLineItem = { name: string; qty: string; unitPrice: string };

// Lines that are receipt boilerplate, never a purchased item, even when they
// happen to end in a number (a GST rate, a table number, a phone digit run).
// Widened against a real POS receipt (docs/COMPETITIVE_ANALYSIS.md's OCR "Big
// Bet") that also had dine-in/token/cashier/FSSAI-license/tel-no lines ending
// in bare numbers that all needed rejecting, then again against general
// retail/restaurant/mall receipt conventions (card-payment terminal jargon,
// delivery-app-integrated POS charges, retail discount-summary lines).
//
// Deliberately NOT included: MRP, HSN, SAC, PAN, Qty, Rate. All of these often
// sit INLINE on a real item's own line on Indian tax invoices (e.g.
// "Britannia Biscuit MRP:45 Qty:2 Amt:80.00" is a real item, not noise) —
// rejecting the whole line on any of them would silently drop real items.
// "PAN" specifically would also collide with "Paan", a real, common menu
// item. The genuine "Item / Qty / Price / Amount" COLUMN-HEADER row (as
// opposed to an inline per-item label) is handled separately by
// `HEADER_ROW_RE` below, which only matches a line that is ENTIRELY header
// words — never a real item line, which always has non-header text too.
const BOILERPLATE_RE = /\b(total|subtotal|sub[-\s]?total|tax|gst|cgst|sgst|igst|vat|service\s*charge|discount|balance|change|cash|card|upi|date|time|receipt|invoice|bill\s*no|table|gstin|thank\s*you|visit\s*again|round\s*off|dine\s*in|token|cashier|assign|fssai|lic(?:ense)?|covers?|pax|waiter|captain|kot|tel|phone|mobile|optional|server|guests?|order\s*no|check\s*no|counter\s*no|void|duplicate|reprint|auth(?:orization)?\s*code|approval\s*code|ref(?:erence)?\s*no|terminal\s*id|batch\s*no|rrn|signature|you\s*saved|loyalty|reward\s*points|delivery\s*charge|packing\s*charge|convenience\s*fee)\b/i;

// A column-header ROW — e.g. "Item  Qty  Price  Amount" or "Description Rate
// Qty Total" — matched only when the ENTIRE line (after trim) consists of
// nothing but these header words. A real item line always has additional
// text (a product name), so this can never misfire on one — unlike a loose
// per-word "qty"/"rate" keyword, which would (see BOILERPLATE_RE comment).
const HEADER_WORD = String.raw`(?:item|description|particulars|s\.?\s*no\.?|qty\.?|quantity|price|rate|amount|amt\.?|total)`;
const HEADER_ROW_RE = new RegExp(`^${HEADER_WORD}(?:\\s+${HEADER_WORD})+$`, 'i');

// A trailing price: whitespace, optional ₹/Rs, digits with optional thousands
// commas and up to 2 decimal places, end of line. Requires a preceding space so
// it doesn't match a price glued onto a product code.
const TRAILING_PRICE_RE = /\s(?:₹|rs\.?)?\s*([\d,]+(?:\.\d{1,2})?)\s*$/i;

// A leading "2 x " or "2 " quantity prefix on the description.
const LEADING_QTY_RE = /^\s*(\d{1,3})\s*[x×]?\s+(?=\S)/i;

// A line that's basically just a date (DD/MM/YYYY, DD-MM-YY, etc.) — these can
// end in what looks like a 2-4 digit "price" (the year) and must be rejected.
const DATE_LIKE_RE = /^\s*\d{1,4}[/\-.]\d{1,2}[/\-.]\d{1,4}\s*$/;

// A line that is ENTIRELY numbers/currency punctuation, no letters at all —
// e.g. "1 280.00 280.00" (qty, unit price, amount) or "530.00 530.00" or a
// lone "48.17". Real POS/restaurant receipts commonly print the item name on
// its own line and the qty/price/amount columns on the line(s) below it,
// rather than all on one line — this is what pairs the two back together.
const NUMERIC_ONLY_RE = /^[\d.,₹x×\s-]+$/i;

const MAX_PLAUSIBLE_BARE_INTEGER = 999_999; // ₹9,99,999 with no decimal point is almost
// always a misread ID (phone/GST/license/bill number), not a menu price.
const MIN_PLAUSIBLE_BARE_INTEGER = 10; // a bare integer under this is more likely a
// stray qty/covers-count digit than a real no-paise price.

/** Is this numeric token plausible as money, as opposed to some other ID that
 *  happens to be a bare number (a phone digit run, a license number, a covers
 *  count)? Numbers with a decimal point are trusted at any size — receipts
 *  consistently print money with paise, so a "45000.00" is fine; it's only
 *  bare integers (no decimal) that need bounds-checking. */
function isPlausiblePrice(raw: string): boolean {
  const value = parseFloat(raw.replace(/,/g, ''));
  if (!Number.isFinite(value) || value <= 0) return false;
  if (!raw.includes('.')) {
    if (value < MIN_PLAUSIBLE_BARE_INTEGER || value > MAX_PLAUSIBLE_BARE_INTEGER) return false;
  }
  return true;
}

/**
 * Best-effort, non-AI line-item extraction from OCR'd receipt text.
 * Two shapes are recognized, since real receipts mix both:
 *  1. Single-line "name ... price" (a simple retail receipt).
 *  2. Two-line "name" then "qty price amount" (common on restaurant/POS
 *     bills) — a name-only line is held as a pending candidate and paired
 *     with the next numbers-only line, using that line's LAST number (the
 *     "Amount" column) as the effective price. Using qty=1 against the
 *     amount rather than trying to separately reconstruct qty × unit price
 *     still totals correctly for splitting even when the real qty wasn't 1.
 * A numeric-only line whose number fails the plausibility check (a stray
 * qty/covers digit, e.g. a lone "1") is treated as noise, not a price — the
 * pending name survives it and waits for the line after. Not meant to be a
 * final parser — the raw text is always shown alongside this result so a
 * miss (or a name split across two lines, occasionally double-counted) is
 * easy to catch and fix by hand.
 */
export function parseReceiptLineItems(text: string): ParsedLineItem[] {
  if (!text) return [];

  const items: ParsedLineItem[] = [];
  let pendingName: string | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (DATE_LIKE_RE.test(line) || BOILERPLATE_RE.test(line) || HEADER_ROW_RE.test(line)) {
      pendingName = null;
      continue;
    }

    if (NUMERIC_ONLY_RE.test(line)) {
      if (pendingName) {
        const numbers = line.match(/[\d,]+(?:\.\d{1,2})?/g) ?? [];
        const last = numbers[numbers.length - 1];
        if (last && isPlausiblePrice(last)) {
          items.push({ name: pendingName, qty: '1', unitPrice: last.replace(/,/g, '') });
          pendingName = null;
        }
        // else: implausible — likely a stray qty/covers digit, not a price.
        // Leave pendingName alive so the NEXT line still gets a chance to pair.
      }
      continue;
    }

    const priceMatch = TRAILING_PRICE_RE.exec(line);
    if (priceMatch) {
      const priceStr = priceMatch[1].replace(/,/g, '');
      if (!isPlausiblePrice(priceStr)) { pendingName = null; continue; }

      let description = line.slice(0, priceMatch.index).trim();
      if (!description) { pendingName = null; continue; }

      let qty = '1';
      const qtyMatch = LEADING_QTY_RE.exec(description);
      if (qtyMatch) {
        qty = qtyMatch[1];
        description = description.slice(qtyMatch[0].length).trim();
      }
      if (!description) { pendingName = null; continue; }

      items.push({ name: description, qty, unitPrice: priceStr });
      pendingName = null;
      continue;
    }

    // Plain text, no trailing price — a candidate item name, waiting to see
    // if a numbers-only line follows it.
    pendingName = line;
  }

  return items;
}
