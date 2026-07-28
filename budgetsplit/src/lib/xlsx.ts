import { unzipSync, strFromU8 } from 'fflate';

/**
 * Minimal `.xlsx` reader — just enough to turn a spreadsheet into `string[][]`.
 *
 * An .xlsx is a ZIP of XML parts. We inflate it with fflate (pure JS, Hermes-safe)
 * and read the SheetML with regexes rather than a DOM — React Native has no
 * DOMParser, and a full spreadsheet library is megabytes for a feature that only
 * needs cell text. Formulas, styles and number formats are ignored: every cell
 * comes back as the string the file stores, and the caller (a statement parser)
 * does its own money/date interpretation.
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

/** One worksheet part → row-major cells. */
function parseSheet(xml: string, shared: string[]): string[][] {
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
          value = t === 's' ? (shared[Number(raw)] ?? '') : raw;
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

  const paths = Object.keys(files)
    .filter(p => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]));
  if (paths.length === 0) throw new Error('No worksheets in that .xlsx');

  return paths.map((p, i) => ({
    name: names[i] ?? `Sheet${i + 1}`,
    rows: parseSheet(strFromU8(files[p]), shared),
  }));
}
