import { parseToPaise } from './money';
import { splitCsvRows, type ParsedRow, type ParseResult, type ParsedDirection } from './importParse';
import { TxnKind, PayMethod } from '../constants/enums';
import type { Sheet } from './xlsx';

/**
 * Parser for **Paytm UPI statements** — the Excel (.xlsx), CSV and PDF exports of
 * the same "Passbook Payments History". All three land on one row shape so the
 * Review inbox behaves identically whichever file the user picked.
 *
 * Excel/CSV are tabular and exact:
 *   Date | Time | Transaction Details | Other Transaction Details (UPI ID or A/c No)
 *        | Your Account | Amount | UPI Ref No. | Order ID | Remarks | Tags | Comment
 *   24/07/2026 | 20:33:55 | Money sent to Shivpujan Lal | 9973030845-2@ibl on PhonePe
 *        | ICICI Bank - 21 | -68.00 | 311049826294 | | | #💵 Money Transfer |
 * The workbook has two sheets — a Summary and the history; only the history matters.
 *
 * The PDF carries the same rows but pdf.js flattens the table into interleaved
 * fragments with no reliable line breaks, so that path anchors on the `24 Jul`
 * date token and scans each block. The PDF also omits the year on row dates — it
 * only appears in the header period (`10 JUN'26 - 24 JUL'26`), so we resolve each
 * row's year against that range.
 *
 * Paytm tags a lot of its rows, and those tags are better than any guess we could
 * make from the merchant name, so they map straight onto app categories. Rows
 * tagged Money Transfer / Money Received are person-to-person, not spending, so
 * they come in as transfers (stored kind `settlement`) and stay out of totals.
 *
 * Pure (no DB / RN), so it's unit-tested against real exports.
 */

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Paytm's own tag → our category. Its tags are hand-picked per transaction, so
 *  they beat `matchCategory` guessing; unmapped tags fall through to the guess. */
const TAG_CATEGORY: Record<string, string> = {
  'groceries': 'Groceries',
  'food': 'Eating Out',
  'food & drinks': 'Eating Out',
  'restaurant': 'Eating Out',
  'taxi': 'Cab & Auto',
  'travel': 'Travel',
  'fuel': 'Fuel',
  'shopping': 'Shopping',
  'medical': 'Health & Pharmacy',
  'health': 'Health & Pharmacy',
  'bill payments': 'Bills',
  'bills': 'Bills',
  'recharge': 'Mobile Recharge',
  'mobile recharge': 'Mobile Recharge',
  'electricity': 'Electricity',
  'entertainment': 'Entertainment',
  'education': 'Education',
  'rent': 'Rent',
  'insurance': 'Insurance',
  'investment': 'Investments / SIP',
  'investments': 'Investments / SIP',
  'emi': 'EMI & Loans',
  'loan': 'EMI & Loans',
  'cashback': 'Cashback',
  'refund': 'Refunds',
  'salary': 'Salary',
  // Deliberately vague Paytm buckets — no better mapping than "Other".
  'services': 'Other',
  'miscellaneous': 'Other',
  'others': 'Other',
};

/** Tags that mean "money moved between people", not income/spending. */
const TRANSFER_TAGS = new Set(['money transfer', 'money received', 'self transfer']);

/** The category a transfer row gets — a TRANSFER_CATEGORIES name. */
const TRANSFER_CATEGORY = 'Repayment';

/** Every tag we recognise, longest first so "money received" wins over "money". */
const KNOWN_TAGS = [...Object.keys(TAG_CATEGORY), ...TRANSFER_TAGS]
  .sort((a, b) => b.length - a.length);

/** Strip Paytm's leading `#`, the emoji it prefixes tags with, and case. */
function normalizeTag(tag: string): string {
  return tag
    .replace(/#/g, ' ')
    // Emoji + variation selectors + ZWJ — keep letters, digits, spaces, &.
    .replace(/[^\p{L}\p{N}&\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Reduce a tag field to a known tag name. The tabular exports give the tag in
 * its own cell, but the PDF flattens it into the surrounding text (`Tag: #
 * Groceries State Bank Of India - 43 …`), so we match the longest known tag the
 * field *starts with* rather than requiring the whole field to be the tag.
 */
function canonicalTag(field: string): string {
  const norm = normalizeTag(field);
  if (!norm) return '';
  return KNOWN_TAGS.find(t => norm === t || norm.startsWith(t + ' ')) ?? '';
}

/** Money cell → positive paise. Strips `Rs.`/`₹`/`INR` first: `parseToPaise`
 *  keeps dots, so a bare "Rs.68" would otherwise read as ₹0.68. */
function paytmPaise(field: string): number {
  const cleaned = field.replace(/(?:rs\.?|inr|₹)/gi, ' ');
  return parseToPaise(cleaned);
}

/** Sign marker on a Paytm amount: `-68.00` is money out, `+20,000.00` money in. */
function directionOf(field: string): ParsedDirection {
  const f = field.trim();
  if (/^\+/.test(f)) return 'credit';
  if (/^-/.test(f)) return 'debit';
  // The PDF renders the sign as its own fragment, so also accept "- Rs.68".
  if (/^\s*-\s*(?:rs\.?|₹|inr)/i.test(f)) return 'debit';
  if (/^\s*\+\s*(?:rs\.?|₹|inr)/i.test(f)) return 'credit';
  return 'unknown';
}

/**
 * How Paytm introduces the other side of a transaction. Shared by the tabular
 * and PDF paths so both agree on where the counterparty name starts.
 * `Automatic payment …` has two forms: "Automatic payment for X" and the
 * first-time "Automatic payment of ₹99 setup for X".
 */
const PARTY_PREFIX =
  'Money sent to|Money received from|Received from|Paid to|Payment to|Transferred to'
  + '|Automatic payment(?:\\s+of\\s+\\S+\\s+setup)?\\s+for|Refund from|Cashback from';

/** "Paid to Urban Company" → "Urban Company". Keeps the whole string when it
 *  doesn't use one of Paytm's known prefixes. Runs of whitespace are collapsed
 *  so the same merchant reads identically however the export spaced it — which
 *  also keeps Review's merchant matching from treating them as two payees. */
function counterparty(details: string): string {
  const m = new RegExp(`^\\s*(?:${PARTY_PREFIX})\\s+(.+)$`, 'i').exec(details.trim());
  return (m ? m[1] : details).replace(/\s+/g, ' ').trim();
}

/** How the money actually moved. A Rupay credit card funding a UPI payment is
 *  spending on credit, which matters more for budgeting than the UPI rail. */
function payMethodFor(account: string, details: string): PayMethod {
  if (/automatic payment|autopay|mandate/i.test(details)) return PayMethod.Autopay;
  if (/credit card|debit card|\bcard\b/i.test(account)) return PayMethod.Card;
  if (/wallet/i.test(account)) return PayMethod.Wallet;
  return PayMethod.Upi;
}

/** Resolve kind/direction/category for a row, given its tag and sign. */
function classify(
  tag: string,
  direction: ParsedDirection,
  details: string,
): { kind: TxnKind; category?: string } {
  const t = canonicalTag(tag);
  // A person-to-person transfer either way — not spend, not earnings.
  if (TRANSFER_TAGS.has(t) || /^\s*money (?:sent to|received from)\b/i.test(details)) {
    return { kind: 'settlement', category: TRANSFER_CATEGORY };
  }
  const kind: TxnKind = direction === 'credit' ? 'income' : 'expense';
  const mapped = TAG_CATEGORY[t];
  // An expense tag on an income row (or vice versa) would be wrong in Review's
  // category picker, so only carry a tag that matches the row's kind.
  if (!mapped) return { kind };
  if (kind === 'income' && !['Cashback', 'Refunds', 'Salary'].includes(mapped)) return { kind };
  return { kind, category: mapped };
}

/** dd/MM/yyyy (+ optional HH:mm:ss) → epoch ms. Null when it isn't a date. */
function parseSheetDate(dateField: string, timeField: string): number | null {
  const m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(dateField.trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  const t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(timeField.trim());
  const dt = new Date(
    Number(y), Number(mo) - 1, Number(d),
    t ? Number(t[1]) : 0, t ? Number(t[2]) : 0, t && t[3] ? Number(t[3]) : 0,
  );
  if (isNaN(dt.getTime()) || dt.getMonth() !== Number(mo) - 1) return null;
  return dt.getTime();
}

// --- tabular path (.xlsx / .csv) -------------------------------------------

type ColMap = {
  date: number; time: number; details: number; other: number;
  account: number; amount: number; ref: number; remarks: number; tags: number;
};

/** Locate columns by header text, so a reordered/extended export still parses. */
function mapColumns(header: string[]): ColMap | null {
  const find = (...res: RegExp[]) =>
    header.findIndex(h => res.some(re => re.test((h ?? '').trim())));
  const cols: ColMap = {
    date: find(/^date$/i),
    time: find(/^time$/i),
    details: find(/^transaction details$/i, /^description$/i, /^narration$/i),
    other: find(/other transaction details/i, /^upi id$/i),
    account: find(/^your account$/i, /^account$/i),
    amount: find(/^amount$/i),
    ref: find(/upi ref/i, /^ref(erence)? no/i),
    remarks: find(/^remarks$/i),
    tags: find(/^tags?$/i),
  };
  // Only the three columns we can't reconstruct are mandatory.
  if (cols.date < 0 || cols.details < 0 || cols.amount < 0) return null;
  return cols;
}

/** Is this the Paytm passbook sheet (by tab name or by its header row)? */
function isPaytmHistorySheet(sheet: Sheet): boolean {
  if (/passbook|payment history|transaction/i.test(sheet.name)) {
    return sheet.rows.some(r => mapColumns(r) !== null);
  }
  return sheet.rows.slice(0, 10).some(r => mapColumns(r) !== null && r.some(c => /transaction details/i.test(c ?? '')));
}

/** Does this workbook look like a Paytm statement? */
export function isPaytmWorkbook(sheets: Sheet[]): boolean {
  return sheets.some(isPaytmHistorySheet);
}

/** Parse already-split rows (from .xlsx cells or CSV fields). */
function parseRows(rows: string[][]): ParseResult {
  const headerIdx = rows.findIndex(r => mapColumns(r) !== null);
  if (headerIdx < 0) return { rows: [], skipped: rows.length };
  const cols = mapColumns(rows[headerIdx])!;

  const out: ParsedRow[] = [];
  let skipped = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const cell = (idx: number) => (idx >= 0 ? (r[idx] ?? '').trim() : '');
    const amountField = cell(cols.amount);
    const amount = paytmPaise(amountField);
    const date = parseSheetDate(cell(cols.date), cell(cols.time));
    // A row without a real date+amount is a spacer, a footer or the summary block.
    if (date === null || amount <= 0) { skipped += 1; continue; }

    const details = cell(cols.details);
    const account = cell(cols.account);
    const direction = directionOf(amountField);
    const { kind, category } = classify(cell(cols.tags), direction, details);

    const raw = [
      details, cell(cols.other), account, amountField,
      cell(cols.ref) && `UPI Ref No: ${cell(cols.ref)}`,
      cell(cols.remarks), cell(cols.tags),
    ].filter(Boolean).join(' · ');

    out.push({
      date, amount,
      description: counterparty(details) || 'Paytm transaction',
      direction, kind, category,
      payMethod: payMethodFor(account, details),
      raw,
    });
  }

  return { rows: out, skipped };
}

/** Parse a Paytm `.xlsx`. Reads the passbook history sheet — sheet 2 in Paytm's
 *  export, where sheet 1 is the summary — falling back to any sheet that has the
 *  right header row. */
export function parsePaytmWorkbook(sheets: Sheet[]): ParseResult {
  const sheet = sheets.find(isPaytmHistorySheet) ?? sheets[sheets.length - 1];
  if (!sheet) return { rows: [], skipped: 0 };
  return parseRows(sheet.rows);
}

/**
 * Parse a Paytm CSV export (same columns as the workbook's history sheet).
 *
 * Tokenised over the whole text (`splitCsvRows`), not split on newlines first.
 * Paytm's "Transaction Details" column is free text and carries newlines — a
 * merchant address, a multi-line note — and splitting on `\n` before honouring
 * quotes tore that row in half: the first fragment failed the column mapping and
 * the second parsed as garbage, so the transaction was silently absent from the
 * import and only the aggregate "N skipped" count hinted at it. Exactly the
 * defect fixed in our own export path; this one was left behind.
 */
export function parsePaytmCsv(text: string): ParseResult {
  return parseRows(splitCsvRows(text).filter(r => r.some(c => c?.trim())));
}

/**
 * Does this CSV text look like a Paytm export?
 *
 * Row-tokenised too, so a header sitting below a preamble row whose text contains
 * a newline is still found. Only the first 15 rows are read: this runs on every
 * import to pick a parser, and a header that far down is not one.
 */
export function isPaytmCsv(text: string): boolean {
  return splitCsvRows(text).slice(0, 15).some(f =>
    mapColumns(f) !== null && f.some(c => /transaction details/i.test(c ?? '')),
  );
}

// --- PDF-text path ---------------------------------------------------------

// Row date token, e.g. "24 Jul". Title-case month only, which is what the row
// table uses — the header period is uppercase (`10 JUN'26`), so it never matches
// here and can't be mistaken for a transaction.
const PDF_DATE_RE = /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g;
// Header period, e.g. "10 JUN'26 - 24 JUL'26" — the only place a year appears.
const PERIOD_RE = /(\d{1,2})\s*([A-Za-z]{3})[A-Za-z]*\s*['’]?(\d{2,4})\s*[-–]\s*(\d{1,2})\s*([A-Za-z]{3})[A-Za-z]*\s*['’]?(\d{2,4})/;
const PDF_TIME_RE = /(\d{1,2}):(\d{2})\s*(AM|PM)/i;
// Signed form first — an unsigned "Rs.3,000" (Paytm prints self-transfers that
// way) is still a real row, it just has no direction to read off the sign.
const PDF_AMOUNT_RE = /([-+])\s*(?:Rs\.?|₹|INR)\s*([\d,]+(?:\.\d{1,2})?)/i;
const PDF_AMOUNT_UNSIGNED_RE = /(?:Rs\.?|₹|INR)\s*([\d,]+(?:\.\d{1,2})?)/i;
const PDF_PARTY_RE = new RegExp(
  `(${PARTY_PREFIX})\\s+([^#]*?)(?=\\s*(?:UPI ID|UPI Ref|Tag:|Note:|$))`, 'i',
);
// The tag is followed by whatever the table printed next, so grab a bounded run
// of text and let `canonicalTag` find the tag at the front of it.
const PDF_TAG_RE = /Tag:\s*(.{0,40})/i;

const fullYear = (y: string) => (y.length <= 2 ? 2000 + Number(y) : Number(y));

/** The statement's covered period, used to put a year on the row dates. */
function parsePeriod(text: string): { start: number; end: number } | null {
  const m = PERIOD_RE.exec(text);
  if (!m) return null;
  const [, d1, mo1, y1, d2, mo2, y2] = m;
  const s = MONTHS[mo1.toLowerCase()];
  const e = MONTHS[mo2.toLowerCase()];
  if (s === undefined || e === undefined) return null;
  const start = new Date(fullYear(y1), s, Number(d1)).getTime();
  const end = new Date(fullYear(y2), e, Number(d2), 23, 59, 59).getTime();
  if (isNaN(start) || isNaN(end) || end < start) return null;
  return { start, end };
}

/**
 * A PDF row date has no year. Pick the year that lands the date inside the
 * statement period — this is what makes a Dec–Jan statement come out right.
 * With no period header, assume the most recent such date that isn't in the
 * future (relative to `now`, injectable for tests).
 */
function resolveYear(day: number, month: number, period: { start: number; end: number } | null, now: number): number {
  if (period) {
    const endYear = new Date(period.end).getFullYear();
    for (const y of [endYear, endYear - 1, endYear + 1]) {
      const t = new Date(y, month, day).getTime();
      if (t >= new Date(period.start).setHours(0, 0, 0, 0) && t <= period.end) return t;
    }
    // Outside the stated period (Paytm occasionally spills a row) — nearest year.
    return new Date(endYear, month, day).getTime();
  }
  const thisYear = new Date(now).getFullYear();
  const candidate = new Date(thisYear, month, day).getTime();
  return candidate > now ? new Date(thisYear - 1, month, day).getTime() : candidate;
}

/** Attach the time-of-day fragment ("8:33 PM") to a resolved date. */
function withTime(dayStart: number, block: string): number {
  const t = PDF_TIME_RE.exec(block);
  if (!t) return dayStart;
  let hh = Number(t[1]) % 12;
  if (/pm/i.test(t[3])) hh += 12;
  const d = new Date(dayStart);
  d.setHours(hh, Number(t[2]), 0, 0);
  return d.getTime();
}

/** Is this text a Paytm statement (PDF-extracted or pasted)? */
export function isPaytmStatement(text: string): boolean {
  const t = text ?? '';
  return /paytm/i.test(t) && /(passbook payments? history|UPI Ref No|Paytm Statement for)/i.test(t);
}

/**
 * Parse Paytm statement text — the PDF's extracted text, or a paste of it.
 * pdf.js flattens the table, so rows are found by scanning between date tokens
 * rather than by line. `now` is injectable so the undated-fallback is testable.
 */
export function parsePaytmStatement(text: string, now: number = Date.now()): ParseResult {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return { rows: [], skipped: 0 };

  const period = parsePeriod(text);

  // Every row starts at a date token; a block runs to the next one.
  const anchors: { index: number; day: number; month: number }[] = [];
  PDF_DATE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PDF_DATE_RE.exec(t)) !== null) {
    const month = MONTHS[m[2].toLowerCase()];
    if (month === undefined) continue;
    anchors.push({ index: m.index, day: Number(m[1]), month });
  }

  const rows: ParsedRow[] = [];
  let skipped = 0;

  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const block = t.slice(a.index, i + 1 < anchors.length ? anchors[i + 1].index : t.length);

    const signed = PDF_AMOUNT_RE.exec(block);
    const amt = signed ?? PDF_AMOUNT_UNSIGNED_RE.exec(block);
    const party = PDF_PARTY_RE.exec(block);
    // No amount or no counterparty → a header, the summary block or page furniture.
    if (!amt || !party) { skipped += 1; continue; }

    const amount = paytmPaise(signed ? amt[2] : amt[1]);
    if (amount <= 0) { skipped += 1; continue; }

    const direction: ParsedDirection = !signed ? 'unknown' : amt[1] === '+' ? 'credit' : 'debit';
    const details = `${party[1]} ${party[2]}`.trim();
    const tag = PDF_TAG_RE.exec(block)?.[1] ?? '';
    const { kind, category } = classify(tag, direction, details);
    // The funding account is printed in fragments ("ICICI Bank " + "Rupay Credit " +
    // "Card - 00"), so match it across the whole block rather than as one field.
    const account = /(credit card|debit card)/i.exec(block)?.[1]
      ?? /(wallet)/i.exec(block)?.[1]
      ?? '';

    rows.push({
      date: withTime(resolveYear(a.day, a.month, period, now), block),
      amount,
      description: counterparty(details) || 'Paytm transaction',
      direction, kind, category,
      payMethod: payMethodFor(account, details),
      raw: block.trim(),
    });
  }

  return { rows, skipped };
}
