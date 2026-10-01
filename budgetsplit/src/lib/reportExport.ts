import type { ReportRange } from './dateRange';
import type * as SQLite from 'expo-sqlite';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { fullDate, monthLabel, shortDate } from './dateFormat';
import { getTransactionsInRange } from '../db/queries/transactions';
import { settlementView } from './settlementView';
import { getMe } from '../db/queries/persons';
import { GROUP_EXPORT_HEADER } from './importParse';
import { rowLine } from './groupExport';
import { formatRupees, formatCompact } from './money';
import { computeDonutWedges, type DonutSeg } from './donut';
import { txnTotal, myShareOf, myIncomeOf } from './splitMath';
import type { BudgetGroup } from '../db/queries/groups';

/**
 * Report export builders — pure string assembly extracted from reports.tsx
 * (which was an 870-line screen). These produce the CSV / PDF-HTML payloads;
 * the screen keeps the file/print/share IO. The HTML is a deliberately light
 * (dark-on-white) document so it prints and renders correctly in PDF viewers.
 */

/** The subset of a group summary the PDF needs. */
export type PdfSummary = { group: BudgetGroup; income: number; expense: number };

/**
 * Month transactions as a CSV string (one row per transaction).
 *
 * Same header and same row builder as the group export, deliberately. This wrote
 * `Amount (Rs)` where the group export writes `Amount`, and assembled its own
 * otherwise-identical row — so a report CSV failed `isBudgetSplitExport`, fell
 * through to the generic bank-statement heuristic on re-import, and arrived with
 * its Category and Kind guessed. Two builders for one format is also how the
 * group export got a Direction column and this one did not.
 *
 * The only thing that changes here is scope: one month, and the groups passed in.
 */
export async function buildReportCsv(
  db: SQLite.SQLiteDatabase,
  groups: BudgetGroup[],
  month: Date,
  /** A custom period instead of the month (`U-60`). */
  range?: ReportRange,
): Promise<string> {
  const fromMs = range ? range.from : startOfMonth(month).getTime();
  const toMs = range ? range.to : endOfMonth(month).getTime();

  const me = await getMe(db);
  const meId = me?.id ?? '';
  const lines = [GROUP_EXPORT_HEADER];
  for (const g of groups) {
    const txns = await getTransactionsInRange(db, g.id, fromMs, toMs);
    for (const t of txns) lines.push(rowLine(g.name, t, meId));
  }
  return lines.join('\n');
}

/**
 * A printable report as a self-contained light-themed HTML document (`U-19`).
 *
 * Page one is the Reports screen on paper: the period, what you spent / received / moved (three
 * figures, never one across them), then your categories. Each group follows with its entries.
 *
 * Every amount is YOUR SHARE, the basis of the boxes above it. The rows used to print the whole
 * bill while the boxes summed your share, so in a shared group a ₹1,200 dinner split three ways
 * printed ₹1,200 and added ₹400: the rows did not add up to the total over them. The whole bill
 * is still there, in its own column, when it differs.
 */
export async function buildReportHtml(
  db: SQLite.SQLiteDatabase,
  summaries: PdfSummary[],
  month: Date,
  range?: ReportRange,
): Promise<string> {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const monthHeading = range ? `${shortDate(new Date(range.from))} – ${shortDate(new Date(range.to))}` : monthLabel(month);
  const fromMs = range ? range.from : startOfMonth(month).getTime();
  const toMs = range ? range.to : endOfMonth(month).getTime();
  const meId = (await getMe(db))?.id ?? '';

  const num = (text: string, color = INK) => `<td class="num" style="color:${color}">${text}</td>`;
  const byCategory: Record<string, number> = {};
  const spendAt: { date: number; paise: number }[] = [];
  let moved = 0;
  let body = '';

  for (const s of summaries) {
    const txns = (await getTransactionsInRange(db, s.group.id, fromMs, toMs)).sort((a, b) => b.date - a.date);
    if (txns.length === 0) continue;

    const entries = txns.filter(t => t.kind !== 'settlement').map(t => {
      const total = txnTotal(t);
      const mine = t.kind === 'income' ? myIncomeOf(t, meId) : myShareOf(t, meId);
      if (t.kind === 'expense' && mine > 0) {
        byCategory[t.category] = (byCategory[t.category] ?? 0) + mine;
        spendAt.push({ date: t.date, paise: mine });
      }
      const income = t.kind === 'income';
      return `<tr>
              <td>${format(new Date(t.date), 'dd MMM')}</td>
              <td>${esc(t.category)}</td>
              <td class="note">${esc(t.note ?? '')}</td>
              ${num(total !== mine ? formatRupees(total) : '', MUTED)}
              ${num(mine > 0 ? `${income ? '+' : '−'}${formatRupees(mine)}` : '–', mine > 0 ? (income ? GREEN : RED) : MUTED)}
            </tr>`;
    }).join('');

    /*
     * Transfers in a table of their own. A settlement moved money without consuming it, so in
     * one table with spending an SIP read as an expense in a document whose totals are Income /
     * Expense / Net: the printed rows and the printed net disagreed with each other.
     */
    const transfers = txns.filter(t => t.kind === 'settlement').map(t => {
      const view = settlementView(t);
      const total = txnTotal(t);
      // Somebody else's settle-up in a shared group is listed, and is not money I moved.
      if (t.payments.some(x => x.personId === meId) || t.shares.some(x => x.personId === meId)) moved += total;
      return `<tr>
              <td>${format(new Date(t.date), 'dd MMM')}</td>
              <td>${esc(view.label)}</td>
              <td class="note">${esc(t.note ?? '')}</td>
              ${num(`${view.outbound ? '−' : '+'}${formatRupees(total)}`, VIOLET)}
            </tr>`;
    }).join('');

    body += `
          <h2>${esc(s.group.name)}</h2>
          <div class="totals">
            ${box('Received', s.income, GREEN)}${box('Spent', s.expense, RED)}${box('Net', s.income - s.expense, TEAL)}
          </div>
          ${entries ? `<table>
            <thead><tr><th>Date</th><th>Category</th><th>Note</th><th class="num">Whole bill</th><th class="num">Your share</th></tr></thead>
            <tbody>${entries}</tbody>
          </table>` : ''}
          ${transfers ? `<h3>Transfers, not counted above</h3>
          <table>
            <thead><tr><th>Date</th><th>What</th><th>Note</th><th class="num">Amount</th></tr></thead>
            <tbody>${transfers}</tbody>
          </table>` : ''}`;
  }

  const spent = summaries.reduce((t, s) => t + s.expense, 0);
  const received = summaries.reduce((t, s) => t + s.income, 0);
  const cats = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  const catTotal = cats.reduce((t, [, v]) => t + v, 0);
  // The ring holds six names at most; the rest are one "Other" slice. The table lists them all.
  const ring = cats.slice(0, RING_MAX).map(([name, paise], i) => ({ name, paise, color: SERIES[i] }));
  const rest = cats.slice(RING_MAX).reduce((t, [, v]) => t + v, 0);
  if (rest > 0) ring.push({ name: 'Other', paise: rest, color: SERIES[RING_MAX] });
  const colorOf = (i: number) => SERIES[Math.min(i, RING_MAX)];
  const overview = body ? `
          <div class="totals">
            ${box('Spent', spent, RED)}${box('Received', received, GREEN)}${box('Moved', moved, VIOLET)}
          </div>
          ${cats.length > 0 ? `<h3>Where it went</h3>
          <div class="where">
            ${donutSvg(ring, catTotal)}
            <table>
              <thead><tr><th>Category</th><th class="num">Share</th><th class="num">Amount</th></tr></thead>
              <tbody>${cats.map(([name, v], i) => {
                const pct = catTotal > 0 ? Math.round((v / catTotal) * 100) : 0;
                return `<tr><td><span class="dot" style="background:${colorOf(i)}"></span>${esc(name)}</td>${num(`${pct}%`, MUTED)}${num(formatRupees(v))}</tr>`;
              }).join('')}</tbody>
            </table>
          </div>
          <h3>When it went</h3>
          ${barsSvg(spendBuckets(spendAt, fromMs, Math.min(toMs, Date.now())))}` : ''}` : '';

  if (!body) body = `<p class="empty">No transactions ${range ? 'in this period' : 'this month'}.</p>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
        <style>
          /* Light document, readable on white paper and when printed (dark page
             backgrounds are commonly dropped by PDF viewers/printers). */
          * { box-sizing: border-box; }
          body { font-family: -apple-system, 'Inter', Roboto, Helvetica, sans-serif; background: #FFFFFF; color: ${INK}; padding: 40px 36px; margin: 0; }
          h1 { font-size: 24px; margin: 0; font-weight: 700; letter-spacing: -0.5px; }
          .sub { color: ${MUTED}; font-size: 13px; margin: 4px 0 24px; }
          h2 { font-size: 16px; margin: 32px 0 12px; font-weight: 700; page-break-after: avoid; }
          h3 { font-size: 11px; margin: 20px 0 6px; color: ${MUTED}; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; page-break-after: avoid; }
          .totals { display: flex; gap: 12px; margin-bottom: 12px; page-break-inside: avoid; }
          .box { flex: 1; border: 1px solid ${RULE}; border-radius: 8px; padding: 10px 12px; }
          .box-label { display: block; font-size: 10px; color: ${MUTED}; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; margin-bottom: 4px; }
          .box-value { font-size: 16px; font-weight: 700; font-family: ${MONO}; }
          /* Hairlines under rows, no boxes round cells; the heading repeats on every page and a row never splits across two. */
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; }
          th { text-align: left; color: ${MUTED}; font-weight: 600; padding: 6px 8px; border-bottom: 1px solid ${INK}; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; }
          td { padding: 7px 8px; border-bottom: 1px solid ${RULE}; vertical-align: top; }
          td.note { color: ${MUTED}; }
          .num { text-align: right; font-family: ${MONO}; white-space: nowrap; }
          .where { display: flex; gap: 24px; align-items: center; page-break-inside: avoid; }
          .where table { flex: 1; }
          .dot { display: inline-block; width: 8px; height: 8px; border-radius: 4px; margin-right: 8px; }
          svg { display: block; }
          .empty { color: ${MUTED}; text-align: center; padding: 40px; }
          .footer { margin-top: 32px; text-align: center; font-size: 10px; color: ${MUTED}; }
        </style></head>
        <body>
          <h1>BudgetSplit Report</h1>
          <div class="sub">${monthHeading} · every amount is your share</div>
          ${overview}
          ${body}
          <div class="footer">Generated by BudgetSplit &middot; ${fullDate(new Date())}</div>
        </body></html>`;
}

// Print-safe (dark-on-white) colours: the PDF is a light document.
const INK = '#14201E';
const MUTED = '#5C6B69';
const RULE = '#D5DCDA';
const GREEN = '#0E7C5A';
const RED = '#C0392B';
const VIOLET = '#5B4BC4';
const TEAL = '#0E6E66';
// `SF Mono` alone fell back to a proportional face on Android.
const MONO = "'SF Mono', Menlo, 'Roboto Mono', monospace";

const box = (label: string, paise: number, color: string) =>
  `<div class="box"><span class="box-label">${label}</span><span class="box-value" style="color:${color}">${formatRupees(paise)}</span></div>`;

// ── Charts, as inline SVG: the PDF is printed from HTML, so a chart is markup, not a library ──

const RING_MAX = 6;
/** Print-safe series colours, darkest first; the seventh is the "Other" slice. */
const SERIES = ['#0E6E66', '#C0392B', '#5B4BC4', '#B7791F', '#2B6CB0', '#B83280', '#8A9694'];

/** A point on a circle, 0° at twelve o'clock, clockwise. */
function polar(cx: number, cy: number, r: number, deg: number): string {
  const a = ((deg - 90) * Math.PI) / 180;
  return `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
}

/** The category ring, with the total in its centre. The app's own wedge maths (`computeDonutWedges`). */
function donutSvg(segs: DonutSeg[], total: number): string {
  const size = 150, c = size / 2, r = 56, w = 20;
  const wedges = computeDonutWedges(segs, total, { gap: 1.5, minSpan: 4 });
  if (wedges.length === 0) return '';
  const arcs = wedges.length === 1
    // One slice is a whole ring: an arc from a point back to itself draws nothing.
    ? `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${wedges[0].color}" stroke-width="${w}" />`
    : wedges.map(wd => `<path d="M ${polar(c, c, r, wd.a0)} A ${r} ${r} 0 ${wd.a1 - wd.a0 > 180 ? 1 : 0} 1 ${polar(c, c, r, wd.a1)}" fill="none" stroke="${wd.color}" stroke-width="${w}" />`).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${arcs}
            <text x="${c}" y="${c - 2}" text-anchor="middle" font-size="9" fill="${MUTED}">SPENT</text>
            <text x="${c}" y="${c + 12}" text-anchor="middle" font-size="12" font-weight="700" fill="${INK}">${formatCompact(total)}</text>
          </svg>`;
}

export type SpendBucket = { label: string; paise: number };

/**
 * Spend per day when the period is a month or less, per month when it is longer, with every
 * bucket present (an empty day is a real zero, and a chart that skips it lies about the gap).
 */
export function spendBuckets(points: { date: number; paise: number }[], fromMs: number, toMs: number): SpendBucket[] {
  if (!(toMs >= fromMs)) return [];
  const byDay = (toMs - fromMs) / 86_400_000 <= 31;
  const key = (d: Date) => (byDay ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : `${d.getFullYear()}-${d.getMonth()}`);
  const sums = new Map<string, number>();
  for (const p of points) {
    if (p.date < fromMs || p.date > toMs) continue;
    const k = key(new Date(p.date));
    sums.set(k, (sums.get(k) ?? 0) + p.paise);
  }
  const out: SpendBucket[] = [];
  const d = new Date(fromMs);
  d.setHours(0, 0, 0, 0);
  if (!byDay) d.setDate(1);
  // 400 is a ceiling, not a size: a period is at most a year of days or decades of months.
  for (let i = 0; i < 400 && d.getTime() <= toMs; i++) {
    out.push({ label: byDay ? String(d.getDate()) : format(d, 'MMM'), paise: sums.get(key(d)) ?? 0 });
    if (byDay) d.setDate(d.getDate() + 1); else d.setMonth(d.getMonth() + 1);
  }
  return out;
}

/** The buckets as bars, the tallest labelled with its amount. */
function barsSvg(buckets: SpendBucket[]): string {
  const max = Math.max(0, ...buckets.map(b => b.paise));
  if (buckets.length === 0 || max <= 0) return '';
  const W = 520, H = 120, top = 16, base = H - 16;
  const step = W / buckets.length;
  const bw = Math.max(2, Math.min(18, step * 0.6));
  // Every label when they fit, otherwise about ten of them.
  const every = Math.max(1, Math.ceil(buckets.length / 16));
  const peak = buckets.findIndex(b => b.paise === max);
  const bars = buckets.map((b, i) => {
    const h = b.paise > 0 ? Math.max(1.5, ((base - top) * b.paise) / max) : 0;
    const x = i * step + (step - bw) / 2;
    return `${h > 0 ? `<rect x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${TEAL}" />` : ''}${
      i % every === 0 ? `<text x="${(i * step + step / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="8" fill="${MUTED}">${b.label}</text>` : ''}`;
  }).join('');
  const px = Math.min(W - 30, Math.max(30, peak * step + step / 2));
  return `<svg width="100%" viewBox="0 0 ${W} ${H}" style="page-break-inside:avoid">
            <line x1="0" y1="${base}" x2="${W}" y2="${base}" stroke="${RULE}" stroke-width="1" />
            ${bars}
            <text x="${px.toFixed(1)}" y="10" text-anchor="middle" font-size="9" font-weight="600" fill="${INK}">${formatCompact(max)}</text>
          </svg>`;
}
