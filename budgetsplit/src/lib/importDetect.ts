import { parseStatement, isBudgetSplitExport, parseBudgetSplitExport, type ParseResult } from './importParse';
import { isGpayStatement, parseGpayStatement } from './gpayParse';
import { isPaytmCsv, parsePaytmCsv, isPaytmStatement, parsePaytmStatement, isPaytmWorkbook, parsePaytmWorkbook } from './paytmParse';
import { parseTransactionEmail } from './emailTxnParse';
import type { Sheet } from './xlsx';
import type { TxnSource } from '../constants/enums';

/**
 * Picks the right parser for a piece of imported content and reports what it
 * decided. Detection lives here (not in the Import screen) so the routing is
 * pure and unit-tested, and so a picked file needs no format question — the
 * screen just shows what was recognised and how many rows came out.
 *
 * `source` is stamped on every row so the Review inbox groups them under the
 * right section; `format` is the human label the screen shows back.
 */

export type DetectedParse = {
  result: ParseResult;
  source: TxnSource;
  /** Human label for what we recognised, e.g. "Paytm statement". */
  format: string;
};

/** The picker on the Import screen — only consulted for pasted text that no
 *  detector claims. */
export type PasteSource = 'gpay' | 'other' | 'email';

/**
 * Detect and parse pasted or PDF-extracted text.
 *
 * Order matters: the most specific signature wins. Our own export is checked
 * first because it is exact (it carries Category and Kind), then Paytm and
 * Google Pay, and only then does the user's picker decide.
 */
export function parseAnyText(text: string, pasteSource: PasteSource = 'other'): DetectedParse {
  const content = text ?? '';
  if (isBudgetSplitExport(content)) {
    return { result: parseBudgetSplitExport(content), source: 'bank_csv', format: 'BudgetSplit export' };
  }
  if (isPaytmCsv(content)) {
    return { result: parsePaytmCsv(content), source: 'paytm', format: 'Paytm statement (CSV)' };
  }
  if (isPaytmStatement(content)) {
    return { result: parsePaytmStatement(content), source: 'paytm', format: 'Paytm statement' };
  }
  if (isGpayStatement(content)) {
    return { result: parseGpayStatement(content), source: 'gpay', format: 'Google Pay statement' };
  }
  if (pasteSource === 'email') {
    return { result: parseTransactionEmail(content), source: 'email', format: 'Transaction alert email' };
  }
  if (pasteSource === 'gpay') {
    return { result: parseGpayStatement(content), source: 'gpay', format: 'Google Pay statement' };
  }
  return { result: parseStatement(content), source: 'bank_csv', format: 'Bank / UPI statement' };
}

/**
 * Detect and parse a spreadsheet. Only Paytm's workbook layout is recognised
 * by name today; anything else falls back to the tolerant statement parser fed
 * with the sheet's rows re-joined as CSV, so an unknown export still imports
 * something rather than failing outright.
 */
export function parseAnyWorkbook(sheets: Sheet[]): DetectedParse {
  if (isPaytmWorkbook(sheets)) {
    return { result: parsePaytmWorkbook(sheets), source: 'paytm', format: 'Paytm statement (Excel)' };
  }
  // Widest sheet = the one most likely to hold the transaction table.
  const sheet = sheets.slice().sort((a, b) => b.rows.length - a.rows.length)[0];
  const text = (sheet?.rows ?? [])
    .map(r => r.map(c => (c.includes(',') ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
    .join('\n');
  return parseAnyText(text);
}
