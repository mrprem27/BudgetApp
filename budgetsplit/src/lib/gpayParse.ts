import { parseToPaise } from './money';
import type { ParsedRow, ParseResult } from './importParse';

/**
 * Parser for **Google Pay transaction statement PDFs** (the app imports GPay
 * only). Works on the *text* extracted from the PDF — extraction itself is a
 * separate concern; this stays pure (no DB/RN) and unit-tested, with the Review
 * inbox as the correction layer.
 *
 * Real GPay statement shape (one transaction = a block of lines):
 *   01 Jun, 2026
 *   09:46 AM
 *   Paid to Sandeep Malik            ← "Paid to X" = expense · "Received from X" = income
 *   UPI Transaction ID: 651859540084
 *   Paid by ICICI Bank 6607          ← funding account (income rows say "Paid to <bank>") — ignored
 *   ₹950                             ← amount: ₹, thousands commas, optional paise (₹948.60)
 * Blocks are anchored on the date line (`DD Mon, YYYY`), so page headers, the
 * "Sent/Received" summary and the period line are naturally skipped.
 */

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// Row date line, e.g. "01 Jun, 2026" (3-letter month + comma). The period line
// "01 June 2026 - 30 June 2026" uses the full month name + no comma, so it
// never matches — that's how the summary block is excluded.
const DATE_RE = /^(\d{1,2})\s+([A-Za-z]{3}),\s+(\d{4})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;
const PARTY_RE = /^(Paid to|Received from)\s+(.+)$/i;
const UPI_RE = /UPI Transaction ID:\s*(\d+)/i;
const AMOUNT_RE = /^₹\s*[\d,]+(?:\.\d{1,2})?$/;

/** Is this text a Google Pay statement? Import rejects anything else. */
export function isGpayStatement(text: string): boolean {
  const t = text ?? '';
  return /google\s*pay|transaction statement/i.test(t) && /UPI Transaction ID/i.test(t);
}

function parseBlockDate(dateLine: string, timeLine: string | undefined): number {
  const m = DATE_RE.exec(dateLine);
  if (!m) return Date.now();
  const [, d, monAbbr, y] = m;
  const month = MONTHS[monAbbr.toLowerCase()];
  if (month === undefined) return Date.now();
  let hh = 0, mm = 0;
  if (timeLine) {
    const tm = TIME_RE.exec(timeLine);
    if (tm) {
      hh = Number(tm[1]) % 12;
      if (/pm/i.test(tm[3])) hh += 12;
      mm = Number(tm[2]);
    }
  }
  return new Date(Number(y), month, Number(d), hh, mm).getTime();
}

/** Parse extracted GPay statement text → rows for the Review inbox. Never throws. */
export function parseGpayStatement(text: string): ParseResult {
  const lines = (text ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // Group lines into blocks, each starting at a date line.
  const blocks: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (DATE_RE.test(line)) {
      current = [line];
      blocks.push(current);
    } else if (current) {
      current.push(line);
    }
  }

  const rows: ParsedRow[] = [];
  let skipped = 0;

  for (const block of blocks) {
    const timeLine = block[1] && TIME_RE.test(block[1]) ? block[1] : undefined;
    // First party line is the counterparty; a later "Paid to <bank>" (income
    // funding line) is ignored because we take the first match only.
    const partyLine = block.find(l => PARTY_RE.test(l));
    const amountLine = block.find(l => AMOUNT_RE.test(l));
    if (!partyLine || !amountLine) { skipped += 1; continue; }

    const party = PARTY_RE.exec(partyLine)!;
    const isReceived = /received from/i.test(party[1]);
    const description = party[2].trim();
    const amount = parseToPaise(amountLine);
    if (amount <= 0) { skipped += 1; continue; }

    const upi = UPI_RE.exec(block.join('\n'));
    rows.push({
      date: parseBlockDate(block[0], timeLine),
      amount,
      description,
      direction: isReceived ? 'credit' : 'debit',
      kind: isReceived ? 'income' : 'expense',
      raw: (upi ? `UPI ${upi[1]} · ` : '') + block.join(' '),
    });
  }

  return { rows, skipped };
}
