import { unzipSync, strFromU8 } from 'fflate';

/**
 * Minimal `.xlsx` reader — just enough to turn a spreadsheet into `string[][]`.
 *
 * An .xlsx is a ZIP of XML parts. We inflate it with fflate (pure JS, Hermes-safe)
 * and read the SheetML with regexes rather than a DOM — React Native has no
 * DOMParser, and a full spreadsheet library is megabytes for a feature that only
 * needs cell text. Formulas and styles are ignored — except that a cell STYLED as a date comes back as
 * `dd/mm/yyyy` rather than its serial day number. Everything else is the string the file stores, and
 * the caller (a statement parser) does its own money/date interpretation.
 *
 * Pure (no RN / no DB), so it's unit-tested against real exports.
 */

export type Sheet = {
  /** Sheet name as shown in Excel's tab bar. */
  name: string;
  /** Row-major cells, already expanded so `rows[r][c]` lines up with column c. */
  rows: string[][];
};

/** Undo the five XML entities SheetML actually emits. */
function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    // Ampersand last, so "&amp;lt;" doesn't become "<".
    .replace(/&amp;/g, '&');
}

/** Concatenate every <t> run inside a chunk (rich text splits a string across runs). */
function textRuns(xml: string): string {
  let out = '';
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out += unescapeXml(m[1] ?? '');
  return out;
}

/** `xl/sharedStrings.xml` → the indexed string table cells refer to with t="s". */
function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  const out: string[] = [];
  const re = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si\s*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(textRuns(m[1] ?? ''));
  return out;
}

/** Column letters → 0-based index ("A"→0, "AA"→26). */
function colIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref.toUpperCase())?.[1];
  if (!letters) return -1;
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}

/** Excel's built-in date/time number formats (ECMA-376 §18.8.30). */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

/**
 * Which cell styles (`s="N"`) display a date. A date cell stores a serial day number (`46264`), and
 * without this the importer read it as an amount and dated the row today. The style says it is a
 * date: a built-in date format, or a custom one whose code has day/month/year letters.
 */
function dateStyles(stylesXml: string | undefined): Set<number> {
  const out = new Set<number>();
  if (!stylesXml) return out;
  const custom = new Map<number, string>();
  const nf = /<numFmt\s[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = nf.exec(stylesXml)) !== null) custom.set(Number(m[1]), unescapeXml(m[2]));
  const xfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1] ?? '';
  const xf = /<xf\s([^>]*?)\/?>/g;
  let i = 0;
  while ((m = xf.exec(xfs)) !== null) {
    const id = Number(/numFmtId="(\d+)"/.exec(m[1])?.[1] ?? 0);
    // Quoted literals and [colour]/[h] sections removed first, so "Rs" or "[Red]" can't pass as d/m/y.
    const code = (custom.get(id) ?? '').replace(/"[^"]*"|\[[^\]]*\]/g, '');
    if (BUILTIN_DATE_FORMATS.has(id) || /[dmy]/i.test(code)) out.add(i);
    i++;
  }
  return out;
}

/** An Excel serial day (1900 system) as `dd/mm/yyyy`, the order Indian statements use. */
function serialToDate(raw: string): string | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 2_958_465) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86_400_000);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** One worksheet part → row-major cells. */
function parseSheet(xml: string, shared: string[], dates: Set<number> = new Set()): string[][] {
  const rows: string[][] = [];
  const rowRe = /<row(?:\s[^>]*)?>([\s\S]*?)<\/row>|<row\s[^>]*\/>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml)) !== null) {
    const body = rm[1] ?? '';
    const cells: string[] = [];
    const cellRe = /<c\s([^>]*?)\/>|<c\s([^>]*?)>([\s\S]*?)<\/c>/g;
    let cm: RegExpExecArray | null;
    let auto = 0;
    while ((cm = cellRe.exec(body)) !== null) {
      const attrs = cm[1] ?? cm[2] ?? '';
      const inner = cm[3] ?? '';
      const ref = /r="([A-Z]+\d+)"/i.exec(attrs)?.[1];
      // Honour the cell reference so blank cells keep later columns aligned;
      // fall back to sequence when a writer omits r= entirely.
      const at = ref ? colIndex(ref) : auto;
      auto = at + 1;
      if (at < 0) continue;

      const t = /t="([^"]+)"/.exec(attrs)?.[1];
      let value = '';
      if (t === 'inlineStr') {
        value = textRuns(inner);
      } else {
        const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        if (v != null) {
          const raw = unescapeXml(v);
          // t="s" is an index into the shared table; everything else is literal.
          const style = Number(/\bs="(\d+)"/.exec(attrs)?.[1] ?? -1);
          value = t === 's' ? (shared[Number(raw)] ?? '')
            : !t && dates.has(style) ? (serialToDate(raw) ?? raw)
            : raw;
        }
      }
      while (cells.length < at) cells.push('');
      cells[at] = value;
    }
    rows.push(cells);
  }
  return rows;
}

/** Workbook tab order + names, so callers can address a sheet by name or index. */
function parseSheetNames(workbookXml: string | undefined): string[] {
  if (!workbookXml) return [];
  const out: string[] = [];
  const re = /<sheet\s[^>]*name="([^"]*)"[^>]*\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(workbookXml)) !== null) out.push(unescapeXml(m[1]));
  return out;
}

/**
 * Read every worksheet in an .xlsx. Sheets come back in workbook tab order,
 * which is what `sheet1.xml`, `sheet2.xml`… are numbered by in practice.
 * Throws if the bytes aren't a readable .xlsx — callers surface the real reason.
 */
export function readXlsx(bytes: Uint8Array): Sheet[] {
  const files = unzipSync(bytes);
  const shared = parseSharedStrings(files['xl/sharedStrings.xml'] ? strFromU8(files['xl/sharedStrings.xml']) : undefined);
  const names = parseSheetNames(files['xl/workbook.xml'] ? strFromU8(files['xl/workbook.xml']) : undefined);
  const dates = dateStyles(files['xl/styles.xml'] ? strFromU8(files['xl/styles.xml']) : undefined);

  const paths = Object.keys(files)
    .filter(p => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]));
  if (paths.length === 0) throw new Error('No worksheets in that .xlsx');

  return paths.map((p, i) => ({
    name: names[i] ?? `Sheet${i + 1}`,
    rows: parseSheet(strFromU8(files[p]), shared, dates),
  }));
}
