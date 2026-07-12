import { parseToPaise } from './money';
import type { TxnKind } from '../constants/enums';

/**
 * Tolerant statement parser for the Import → Review flow. Bank/UPI exports vary
 * wildly, so this is best-effort and never throws: it extracts what it can and
 * the Review inbox is the correction layer. Pure (no DB / RN), so it's unit-tested.
 */

export type ParsedDirection = 'debit' | 'credit' | 'unknown';

export type ParsedRow = {
  /** epoch ms; falls back to now when no date is found. */
  date: number;
  /** positive paise. */
  amount: number;
  description: string;
  direction: ParsedDirection;
  /** debit → expense, credit → income (the user can change it in Review). */
  kind: TxnKind;
  /** Known category when the source carries one (our own export). Otherwise the
   *  Review flow guesses it via `matchCategory`. */
  category?: string;
  raw: string;
};

export type ParseResult = { rows: ParsedRow[]; skipped: number };

const DELIMITERS = [',', '\t', ';', '|'] as const;
const MONEY_RE = /^[(\-]?\s*(?:₹|rs\.?|inr)?\s*[\d,]+(?:\.\d{1,2})?\s*(?:dr|cr)?\s*\)?$/i;

type MoneyMarker = 'dr' | 'cr' | 'neg' | 'none';

/** Which delimiter splits the text most consistently across its lines. */
function detectDelimiter(lines: string[]): string {
  let best = ',';
  let bestScore = -1;
  for (const d of DELIMITERS) {
    const counts = lines.map(l => l.split(d).length - 1).filter(c => c > 0);
    if (counts.length === 0) continue;
    const mode = counts.slice().sort((a, b) => a - b)[Math.floor(counts.length / 2)];
    const consistent = counts.filter(c => c === mode).length;
    // Prefer the most consistent delimiter; tie-break toward more columns so a
    // stray comma inside "12,500" never beats a real "|"/tab separator.
    const score = consistent * 100 + mode;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

/** Parse a money-looking field → { paise (>=0), marker } or null. Zero cells are
 *  kept so debit/credit column positions survive. */
function parseMoney(field: string): { paise: number; marker: MoneyMarker } | null {
  const f = field.trim();
  if (!f || !MONEY_RE.test(f)) return null;
  const paise = parseToPaise(f);
  let marker: MoneyMarker = 'none';
  if (/dr\b/i.test(f)) marker = 'dr';
  else if (/cr\b/i.test(f)) marker = 'cr';
  else if (f.startsWith('(') || f.startsWith('-')) marker = 'neg';
  return { paise, marker };
}

const DMY = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/;

/** Parse a date-looking field → epoch ms, or null. Tries dd/mm/yyyy then Date.parse. */
function parseDate(field: string): number | null {
  const f = field.trim();
  if (!f) return null;
  const m = DMY.exec(f);
  if (m) {
    const [, d, mo, y] = m;
    const yr = y.length === 2 ? 2000 + Number(y) : Number(y);
    const dt = new Date(yr, Number(mo) - 1, Number(d));
    if (!isNaN(dt.getTime()) && dt.getMonth() === Number(mo) - 1) return dt.getTime();
  }
  // ISO / named-month formats — but never treat a bare number as a date.
  if (/[a-z]/i.test(f) || /\d{4}-\d{2}-\d{2}/.test(f)) {
    const t = Date.parse(f);
    if (!isNaN(t)) return t;
  }
  return null;
}

export function parseStatement(text: string): ParseResult {
  const lines = (text ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return { rows: [], skipped: 0 };

  const delim = detectDelimiter(lines);
  const rows: ParsedRow[] = [];
  let skipped = 0;

  for (const line of lines) {
    const fields = (delim && line.includes(delim) ? line.split(delim) : [line]).map(f => f.trim());

    const moneyFields = fields
      .map((f, i) => ({ i, m: parseMoney(f) }))
      .filter((x): x is { i: number; m: { paise: number; marker: MoneyMarker } } => x.m !== null);

    // No money anywhere → header / junk.
    if (moneyFields.length === 0) { skipped += 1; continue; }

    const dateIdx = fields.findIndex(f => parseDate(f) !== null);
    const date = dateIdx >= 0 ? parseDate(fields[dateIdx])! : Date.now();

    let amount = 0;
    let amtIdx = -1;
    let direction: ParsedDirection = 'unknown';

    const marked = moneyFields.find(x => x.m.marker !== 'none');
    if (marked) {
      amount = marked.m.paise; amtIdx = marked.i;
      direction = marked.m.marker === 'cr' ? 'credit' : 'debit';
    } else if (moneyFields.length >= 3) {
      // [… debit, credit, balance] — last money field is the running balance.
      const debit = moneyFields[moneyFields.length - 3];
      const credit = moneyFields[moneyFields.length - 2];
      if (debit.m.paise > 0) { amount = debit.m.paise; amtIdx = debit.i; direction = 'debit'; }
      else { amount = credit.m.paise; amtIdx = credit.i; direction = 'credit'; }
    } else if (moneyFields.length === 2) {
      // [debit, credit] — whichever is non-zero.
      const [a, b] = moneyFields;
      if (a.m.paise > 0) { amount = a.m.paise; amtIdx = a.i; direction = 'debit'; }
      else { amount = b.m.paise; amtIdx = b.i; direction = 'credit'; }
    } else {
      // Single plain amount, no debit indicator → treat as income (Review corrects).
      amount = moneyFields[0].m.paise; amtIdx = moneyFields[0].i; direction = 'credit';
    }

    if (amount <= 0) { skipped += 1; continue; }
    const kind: TxnKind = direction === 'credit' ? 'income' : 'expense';

    const usedIdx = new Set<number>([dateIdx, amtIdx]);
    const description = fields
      .filter((f, i) => !usedIdx.has(i) && !MONEY_RE.test(f))
      .sort((a, b) => b.length - a.length)[0] ?? 'Imported';

    rows.push({ date, amount, description, direction, kind, raw: line });
  }

  return { rows, skipped };
}

// --- BudgetSplit's own export format ---------------------------------------
// Re-importing a file produced by the per-group "Export as CSV" action. Unlike a
// bank statement, this format is precise: it carries Category and Kind, so we
// parse it exactly (preserving both) instead of guessing.

/** The header row every group export starts with. Also its detection signature. */
export const GROUP_EXPORT_HEADER = 'Date,Group,Category,Kind,Amount,Note';

/** Split one CSV line, honouring double-quoted fields and "" escapes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** First non-empty line matches our export header (BOM-tolerant, case-insensitive). */
export function isBudgetSplitExport(text: string): boolean {
  const first = (text ?? '').replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim()).find(Boolean);
  return !!first && first.toLowerCase() === GROUP_EXPORT_HEADER.toLowerCase();
}

function normalizeKind(field: string): TxnKind {
  const k = field.trim().toLowerCase();
  return k === 'income' || k === 'settlement' ? k : 'expense';
}

/** Parse an export date to epoch ms. Accepts `yyyy-MM-dd` plus an optional
 *  ` HH:mm` / `THH:mm(:ss)` time (interpreted in local time); falls back to now. */
function parseExportDate(field: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(field.trim());
  if (m) {
    const d = new Date(
      Number(m[1]), Number(m[2]) - 1, Number(m[3]),
      Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0),
    );
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return Date.now();
}

/** Parse a BudgetSplit group-export CSV. Category and Kind are preserved. */
export function parseBudgetSplitExport(text: string): ParseResult {
  const lines = (text ?? '').replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim());
  const rows: ParsedRow[] = [];
  let skipped = 0;
  let headerSeen = false;

  for (const line of lines) {
    if (!line) continue;
    if (!headerSeen && line.toLowerCase() === GROUP_EXPORT_HEADER.toLowerCase()) { headerSeen = true; continue; }

    const fields = splitCsvLine(line);
    if (fields.length < 5) { skipped += 1; continue; }
    const [dateStr, , categoryStr, kindStr, amountStr, noteStr = ''] = fields;

    const amount = parseToPaise(amountStr);
    if (!(amount > 0)) { skipped += 1; continue; }

    const kind = normalizeKind(kindStr);
    const category = categoryStr.trim() || undefined;
    const note = noteStr.trim();
    const description = note || category || 'Imported';
    const direction: ParsedDirection = kind === 'income' ? 'credit' : 'debit';

    rows.push({ date: parseExportDate(dateStr), amount, description, direction, kind, category, raw: line });
  }

  return { rows, skipped };
}
