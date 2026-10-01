import { comparisonRange, type ReportRange } from './dateRange';
import type * as SQLite from 'expo-sqlite';
import { format, startOfMonth, endOfMonth, differenceInCalendarDays } from 'date-fns';
import { fullDate, monthLabel, shortDate } from './dateFormat';
import { getTransactionsInRange } from '../db/queries/transactions';
import { settlementView } from './settlementView';
import { getMe, getAllPersons } from '../db/queries/persons';
import { GROUP_EXPORT_HEADER } from './importParse';
import { rowLine } from './groupExport';
import { formatRupees, formatRupeesShort, formatCompact, formatChangeMagnitude } from './money';
import { computeDonutWedges, type DonutSeg } from './donut';
import { foldUncategorized } from './categoryFold';
import { getCategories } from '../db/queries/categories';
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
 * A printable report as a self-contained light-themed HTML document (`U-19`, rebuilt `U-95`).
 *
 * Read top to bottom like a statement: who and when, four figures (spent / received / net /
 * moved, never one across them; the words are the screens': Spent, Income, Net, Moved) each against the period before, four facts, where it went, when
 * it went, the groups side by side, then every entry.
 *
 * Every amount is YOUR SHARE, the basis of the figures above it. The rows used to print the whole
 * bill while the boxes summed your share, so in a shared group a ₹1,200 dinner split three ways
 * printed ₹1,200 and added ₹400: the rows did not add up to the total over them. The whole bill
 * is still there, in its own column, when it differs.
 *
 * Nothing depends on a background colour or on flex: a print renderer may drop the first, and the
 * ring sat in a flex row it could be squeezed out of. Colour is borders and SVG, layout is tables,
 * and every chart has a width and a height of its own.
 */
export async function buildReportHtml(
  db: SQLite.SQLiteDatabase,
  summaries: PdfSummary[],
  month: Date,
  range?: ReportRange,
): Promise<string> {
  const monthHeading = range ? `${shortDate(new Date(range.from))} – ${shortDate(new Date(range.to))}` : monthLabel(month);
  const fromMs = range ? range.from : startOfMonth(month).getTime();
  const toMs = range ? range.to : endOfMonth(month).getTime();
  // Measured against the same period the Reports screen uses (`comparisonRange`).
  const running = toMs > Date.now();
  const before = comparisonRange(month, range);
  const beforeName = `${range ? 'the period before' : format(new Date(before.from), 'MMMM')}${running ? ' by this point' : ''}`;
  const [me, persons, expenseCats] = await Promise.all([getMe(db), getAllPersons(db), getCategories(db, 'expense')]);
  const meId = me?.id ?? '';
  const nameOf = new Map(persons.map(p => [p.id, p.name]));
  const who = (id: string | undefined, lower = false) => (id === meId ? (lower ? 'you' : 'You') : (id && nameOf.get(id)) || 'Someone');

  const byCategory: Record<string, number> = {};
  const byDay = new Map<string, { date: number; paise: number }>();
  const spendAt: { date: number; paise: number }[] = [];
  const groupRows: { name: string; entries: number; spent: number; received: number }[] = [];
  let largest: { what: string; paise: number; date: number } | null = null;
  let moved = 0;
  let body = '';

  for (const s of summaries) {
    const txns = (await getTransactionsInRange(db, s.group.id, fromMs, toMs)).sort((a, b) => b.date - a.date);
    if (txns.length === 0) continue;

    const ledger = txns.filter(t => t.kind !== 'settlement');
    const entries = ledger.map(t => {
      const total = txnTotal(t);
      const mine = t.kind === 'income' ? myIncomeOf(t, meId) : myShareOf(t, meId);
      if (t.kind === 'expense' && mine > 0) {
        byCategory[t.category] = (byCategory[t.category] ?? 0) + mine;
        spendAt.push({ date: t.date, paise: mine });
        const day = format(new Date(t.date), 'yyyy-MM-dd');
        byDay.set(day, { date: t.date, paise: (byDay.get(day)?.paise ?? 0) + mine });
        if (!largest || mine > largest.paise) largest = { what: t.note || t.category, paise: mine, date: t.date };
      }
      const income = t.kind === 'income';
      return `<tr>
              <td>${format(new Date(t.date), 'dd MMM')}</td>
              <td>${esc(t.category)}</td>
              <td class="note">${esc(t.note ?? '')}</td>
              ${num(total !== mine ? formatRupees(total) : '', MUTED)}
              ${num(mine > 0 ? `${income ? '+' : MINUS}${formatRupees(mine)}` : '–', mine > 0 ? (income ? GREEN : INK) : MUTED)}
            </tr>`;
    }).join('');

    /*
     * Transfers in a table of their own. A settlement moved money without consuming it, so in
     * one table with spending an SIP read as an expense in a document whose totals are Received /
     * Spent / Net: the printed rows and the printed net disagreed with each other.
     */
    const transfers = txns.filter(t => t.kind === 'settlement').map(t => {
      const view = settlementView(t);
      const total = txnTotal(t);
      const from = t.payments[0]?.personId, to = t.shares[0]?.personId;
      const mineOut = t.payments.some(x => x.personId === meId), mineIn = t.shares.some(x => x.personId === meId);
      // Somebody else's settle-up in a shared group is listed, and is not money I moved.
      if (mineOut || mineIn) moved += total;
      // Between two people the row says who paid whom, and the sign is mine: `outbound` is true
      // for every such row (both sides carry one), so money Aarav sent me printed with a minus.
      const between = view.kind === 'transfer' && !!from && !!to;
      const sign = between ? (mineOut ? MINUS : mineIn ? '+' : '') : view.outbound ? MINUS : '+';
      return `<tr>
              <td>${format(new Date(t.date), 'dd MMM')}</td>
              <td>${esc(between ? `${who(from)} paid ${who(to, true)}` : view.line)}</td>
              <td class="note">${esc(t.note ?? '')}</td>
              ${num(`${sign}${formatRupees(total)}`, sign ? INK : MUTED)}
            </tr>`;
    }).join('');

    groupRows.push({ name: s.group.name, entries: ledger.length, spent: s.expense, received: s.income });
    const line = ledger.length === 0 ? 'Transfers only'
      : [`Spent ${formatRupees(s.expense)}`, s.income > 0 ? `income ${formatRupees(s.income)}` : '', `${ledger.length} ${ledger.length === 1 ? 'entry' : 'entries'}`].filter(Boolean).join(' · ');
    body += `
          <div class="group-head"><h2>${esc(s.group.name)}</h2><div class="group-line">${line}</div></div>
          ${entries ? `<table class="rows">
            <colgroup><col style="width:11%" /><col style="width:24%" /><col /><col style="width:17%" /><col style="width:18%" /></colgroup>
            <thead><tr><th>Date</th><th>Category</th><th>Note</th><th class="num">Whole bill</th><th class="num">Your share</th></tr></thead>
            <tbody>${entries}</tbody>
          </table>` : ''}
          ${transfers ? `<h3>Transfers, not counted above</h3>
          <table class="rows">
            <colgroup><col style="width:11%" /><col style="width:35%" /><col /><col style="width:18%" /></colgroup>
            <thead><tr><th>Date</th><th>What</th><th>Note</th><th class="num">Amount</th></tr></thead>
            <tbody>${transfers}</tbody>
          </table>` : ''}`;
  }

  const today = fullDate(new Date());
  const head = `
          <table class="head"><tr>
            <td><div class="brand">BudgetSplit</div><h1>${monthHeading}</h1><div class="sub">${range ? 'Report' : 'Monthly report'} · every amount is your share</div></td>
            <td class="prepared">${me?.name && me.name !== 'You' ? `Prepared for ${esc(me.name)}<br />` : ''}${today}</td>
          </tr></table>`;
  const page = (inner: string) => `<!DOCTYPE html><html><head><meta charset="utf-8" /><style>${CSS}</style></head>
        <body>${head}${inner}
          <div class="footer">Generated by BudgetSplit &middot; ${today}</div>
        </body></html>`;
  if (!body) return page(`<p class="empty">No transactions ${range ? 'in this period' : 'this month'}.</p>`);

  // The period before, for "more than August": the same two sums over the same groups.
  let spentBefore = 0, receivedBefore = 0;
  // One read for every group, kept to the groups this report covers.
  const covered = new Set(summaries.map(s => s.group.id));
  for (const t of await getTransactionsInRange(db, null, before.from, before.to)) {
    if (!covered.has(t.group_id)) continue;
    if (t.kind === 'expense') spentBefore += myShareOf(t, meId);
    else if (t.kind === 'income') receivedBefore += myIncomeOf(t, meId);
  }
  const against = (now: number, then: number) => {
    if (then <= 0) return `nothing in ${beforeName} to compare`;
    const pct = ((now - then) / then) * 100;
    if (Math.round(pct) === 0) return `the same as ${beforeName}`;
    return pct > 100 ? `${formatChangeMagnitude(pct)} ${beforeName}` : `${formatChangeMagnitude(pct)} ${pct > 0 ? 'more' : 'less'} than ${beforeName}`;
  };

  const spent = summaries.reduce((t, s) => t + s.expense, 0);
  const received = summaries.reduce((t, s) => t + s.income, 0);
  const net = received - spent;
  const netLine = received <= 0 ? 'nothing came in' : net >= 0 ? `${Math.round((net / received) * 100)}% of what came in was kept` : 'more went out than came in';
  const kpis = `
          <table class="kpi"><tr>
            ${kpi('Spent', formatRupeesShort(spent), against(spent, spentBefore), RED)}
            ${kpi('Income', formatRupeesShort(received), against(received, receivedBefore), GREEN)}
            ${kpi('Net', `${net < 0 ? MINUS : ''}${formatRupeesShort(Math.abs(net))}`, netLine, TEAL)}
            ${kpi('Moved', formatRupeesShort(moved), 'transfers, not spending', VIOLET)}
          </tr></table>`;

  // Names not in your catalog are one bucket, as on the Reports screen (`foldUncategorized`): a
  // friend's "Poker Night" was its own slice here and "Everything else" there.
  const known = new Set(expenseCats.map(c => c.name));
  const cats = Object.entries(foldUncategorized(byCategory, known)).sort((a, b) => b[1] - a[1]);
  const catTotal = cats.reduce((t, [, v]) => t + v, 0);
  // The ring holds six names at most; the rest are one slice, named under the table.
  const ring = cats.slice(0, RING_MAX).map(([name, paise], i) => ({ name, paise, color: SERIES[i] }));
  const others = cats.slice(RING_MAX);
  const rest = others.reduce((t, [, v]) => t + v, 0);
  if (rest > 0) ring.push({ name: others.length === 1 ? others[0][0] : SMALLER, paise: rest, color: SERIES[RING_MAX] });
  /** A share as text: a real amount never prints as 0%. */
  const pctOf = (v: number, of: number) => {
    const pct = of > 0 ? Math.round((v / of) * 100) : 0;
    return pct === 0 && v > 0 ? '&lt;1%' : `${pct}%`;
  };

  // Calendar days, today included: rounding elapsed time dropped today before noon, and the
  // average over "1 day" sat beside bars for two.
  const days = differenceInCalendarDays(Math.min(toMs, Date.now()), fromMs) + 1;
  const busiest = [...byDay.values()].sort((a, b) => b.paise - a.paise)[0];
  const top = largest as { what: string; paise: number; date: number } | null;
  const facts = catTotal > 0 ? `
          <table class="facts"><tr>
            ${fact('Largest category', esc(cats[0][0]), `${formatRupeesShort(cats[0][1])} · ${pctOf(cats[0][1], catTotal)} of spending`)}
            ${top ? fact('Largest expense', esc(top.what), `${formatRupeesShort(top.paise)} on ${shortDate(top.date)}`) : ''}
            ${fact('Daily average', formatRupeesShort(Math.round(catTotal / days)), `over ${days} ${days === 1 ? 'day' : 'days'}`)}
            ${busiest ? fact('Busiest day', shortDate(busiest.date), formatRupeesShort(busiest.paise)) : ''}
          </tr></table>` : '';

  const where = catTotal > 0 ? `
          <h3>Where it went</h3>
          <table class="where"><tr>
            <td class="ring-cell">${donutSvg(ring, catTotal)}</td>
            <td><table class="rows">
              <thead><tr><th>Category</th><th class="num">Amount</th><th class="num">Share</th><th></th></tr></thead>
              <tbody>${ring.map(seg => `<tr><td><span class="dot" style="border-color:${seg.color}"></span>${esc(seg.name)}</td>${num(formatRupees(seg.paise))}${num(pctOf(seg.paise, catTotal), MUTED)}<td class="meter-cell">${meterSvg(seg.paise / catTotal, seg.color)}</td></tr>`).join('')}</tbody>
            </table>
            ${others.length > 1 ? `<p class="others">${SMALLER}: ${others.map(([name, v]) => `${esc(name)} ${formatRupeesShort(v)}`).join(' · ')}</p>` : ''}</td>
          </tr></table>` : '';

  const bars = barsSvg(spendBuckets(spendAt, fromMs, Math.min(toMs, Date.now())));
  const when = bars ? `<h3>When it went</h3>${bars}` : '';

  const groups = groupRows.length > 1 ? `
          <div class="keep"><h3>By group</h3>
          <table class="rows">
            <thead><tr><th>Group</th><th class="num">Entries</th><th class="num">Income</th><th class="num">Spent</th><th class="num">Share</th><th></th></tr></thead>
            <tbody>${groupRows.map(g => `<tr><td>${esc(g.name)}</td>${num(String(g.entries), MUTED)}${num(g.received > 0 ? formatRupees(g.received) : '–', g.received > 0 ? INK : MUTED)}${num(g.spent > 0 ? formatRupees(g.spent) : '–', g.spent > 0 ? INK : MUTED)}${num(pctOf(g.spent, spent), MUTED)}<td class="meter-cell">${meterSvg(spent > 0 ? g.spent / spent : 0, TEAL)}</td></tr>`).join('')}</tbody>
          </table></div>` : '';

  return page(`${kpis}${facts}${where}${when}${groups}
          <div class="part">Entries</div>${body}`);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const num = (text: string, color = INK) => `<td class="num" style="color:${color}">${text}</td>`;
/** A real minus sign, the width of a plus, so signed columns line up. */
const MINUS = '−';

// Print-safe (dark-on-white) colours: the PDF is a light document.
const INK = '#14201E';
const MUTED = '#5C6B69';
const RULE = '#D5DCDA';
const GREEN = '#0E7C5A';
const RED = '#C0392B';
const VIOLET = '#5B4BC4';
const TEAL = '#0E6E66';

/** One of the four figures: a coloured top rule, the figure in ink, what it is measured against. */
const kpi = (label: string, value: string, line: string, color: string) =>
  `<td style="border-top-color:${color}"><span class="label">${label}</span><span class="kpi-value">${value}</span><span class="kpi-line">${line}</span></td>`;

const fact = (label: string, value: string, line: string) =>
  `<td><span class="label">${label}</span><span class="fact-value">${value}</span><span class="kpi-line">${line}</span></td>`;

// System faces only, and figures in the same face with fixed-width digits: a monospace for money
// read as a receipt printer. 540px is the page (612pt) less the body's side padding.
const CSS = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Helvetica Neue', Roboto, Arial, sans-serif; font-variant-numeric: tabular-nums; background: #FFFFFF; color: ${INK}; padding: 36px; margin: 0; font-size: 12px; line-height: 1.35; }
  table { border-collapse: collapse; width: 100%; }
  .head { border-bottom: 2px solid ${TEAL}; margin-bottom: 18px; }
  .head td { padding: 0 0 12px; vertical-align: bottom; }
  .brand { font-size: 11px; font-weight: 700; color: ${TEAL}; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 6px; }
  h1 { font-size: 26px; margin: 0; font-weight: 700; letter-spacing: -0.5px; }
  .sub { color: ${MUTED}; font-size: 12px; margin-top: 2px; }
  .prepared { text-align: right; color: ${MUTED}; font-size: 11px; white-space: nowrap; }
  .label { display: block; font-size: 9px; color: ${MUTED}; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 600; margin-bottom: 4px; }
  .kpi { border-collapse: separate; border-spacing: 8px 0; margin: 0 -8px; width: auto; min-width: calc(100% + 16px); table-layout: fixed; page-break-inside: avoid; }
  .kpi td { width: 25%; border: 1px solid ${RULE}; border-top: 3px solid ${INK}; padding: 10px 12px; vertical-align: top; }
  .kpi-value { display: block; font-size: 19px; font-weight: 700; letter-spacing: -0.3px; }
  .kpi-line { display: block; font-size: 10px; color: ${MUTED}; margin-top: 3px; }
  .facts { margin-top: 14px; table-layout: fixed; page-break-inside: avoid; }
  .facts td { border-left: 2px solid ${RULE}; padding: 2px 10px; vertical-align: top; }
  .fact-value { display: block; font-size: 13px; font-weight: 600; }
  h2 { font-size: 15px; margin: 0; font-weight: 700; }
  h3 { font-size: 10px; margin: 22px 0 6px; color: ${MUTED}; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 600; page-break-after: avoid; }
  .part { font-size: 10px; font-weight: 700; color: ${TEAL}; letter-spacing: 1.5px; text-transform: uppercase; border-bottom: 2px solid ${TEAL}; padding-bottom: 6px; margin: 30px 0 0; page-break-after: avoid; }
  .group-head { margin: 18px 0 8px; page-break-after: avoid; page-break-inside: avoid; }
  .group-line { color: ${MUTED}; font-size: 11px; margin-top: 2px; }
  /* Hairlines under rows, no boxes round cells; the heading repeats on every page and a row never splits across two. */
  .rows { font-size: 11.5px; }
  .rows thead { display: table-header-group; }
  .rows tr { page-break-inside: avoid; }
  .rows th { text-align: left; color: ${MUTED}; font-weight: 600; padding: 5px 8px; border-bottom: 1px solid ${INK}; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; }
  .rows td { padding: 6px 8px; border-bottom: 1px solid ${RULE}; vertical-align: top; }
  td.note { color: ${MUTED}; }
  .rows .num, .num { text-align: right; white-space: nowrap; }
  .where, .keep { page-break-inside: avoid; }
  .where > tbody > tr > td, .where > tr > td { vertical-align: middle; padding: 0; }
  .ring-cell { width: 190px; }
  .meter-cell { width: 96px; padding-top: 10px !important; }
  .dot { display: inline-block; width: 0; height: 0; border: 4px solid ${MUTED}; border-radius: 4px; margin-right: 8px; }
  .others { color: ${MUTED}; font-size: 10px; margin: 8px 8px 0; }
  .empty { color: ${MUTED}; text-align: center; padding: 40px; }
  .footer { page-break-before: avoid; break-before: avoid; margin-top: 28px; padding-top: 8px; border-top: 1px solid ${RULE}; text-align: center; font-size: 9px; color: ${MUTED}; }
`;

// ── Charts, as inline SVG: the PDF is printed from HTML, so a chart is markup, not a library ──

const RING_MAX = 6;
/** The ring's last slice: every category past the sixth. Not "Everything else", which is the app's name for categories you have not adopted. */
const SMALLER = 'Smaller categories';
/** Every bar but the tallest: the same teal, lighter. */
const BAR = '#7FB5AF';
/** Print-safe series colours, darkest first; the seventh is the slice for every category past the sixth. */
const SERIES = ['#0E6E66', '#C0392B', '#5B4BC4', '#B7791F', '#2B6CB0', '#B83280', '#8A9694'];
const SVG_NS = 'xmlns="http://www.w3.org/2000/svg"';

/** A point on a circle, 0° at twelve o'clock, clockwise. */
function polar(cx: number, cy: number, r: number, deg: number): string {
  const a = ((deg - 90) * Math.PI) / 180;
  return `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
}

/** The category ring, with the total in its centre. The app's own wedge maths (`computeDonutWedges`). */
function donutSvg(segs: DonutSeg[], total: number): string {
  const size = 170, c = size / 2, r = 64, w = 24;
  const wedges = computeDonutWedges(segs, total, { gap: 1.5, minSpan: 4 });
  if (wedges.length === 0) return '';
  const arcs = wedges.length === 1
    // One slice is a whole ring: an arc from a point back to itself draws nothing.
    ? `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${wedges[0].color}" stroke-width="${w}" />`
    : wedges.map(wd => `<path d="M ${polar(c, c, r, wd.a0)} A ${r} ${r} 0 ${wd.a1 - wd.a0 > 180 ? 1 : 0} 1 ${polar(c, c, r, wd.a1)}" fill="none" stroke="${wd.color}" stroke-width="${w}" />`).join('');
  return `<svg class="ring" ${SVG_NS} width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${arcs}
            <text x="${c}" y="${c - 3}" text-anchor="middle" font-size="9" letter-spacing="0.6" fill="${MUTED}">SPENT</text>
            <text x="${c}" y="${c + 14}" text-anchor="middle" font-size="15" font-weight="700" fill="${INK}">${formatCompact(total)}</text>
          </svg>`;
}

/** A share as a short bar on a track, for a table cell. */
function meterSvg(share: number, color: string): string {
  const W = 80, fill = Math.max(0, Math.min(1, share)) * W;
  return `<svg class="meter" ${SVG_NS} width="${W}" height="6" viewBox="0 0 ${W} 6"><rect width="${W}" height="6" rx="3" fill="${RULE}" />${
    fill > 0 ? `<rect width="${Math.max(3, fill).toFixed(1)}" height="6" rx="3" fill="${color}" />` : ''}</svg>`;
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

/**
 * The buckets as bars over a dashed average, the tallest labelled with its amount. Nothing under
 * two days of spending: one bar is not a chart.
 */
function barsSvg(buckets: SpendBucket[]): string {
  const max = Math.max(0, ...buckets.map(b => b.paise));
  if (max <= 0 || buckets.filter(b => b.paise > 0).length < 2) return '';
  const W = 540, H = 150, top = 18, base = H - 18;
  const step = W / buckets.length;
  const bw = Math.max(2, Math.min(22, step * 0.62));
  // Every label when they fit, otherwise about sixteen of them.
  const every = Math.max(1, Math.ceil(buckets.length / 16));
  const peak = buckets.findIndex(b => b.paise === max);
  const mean = buckets.reduce((t, b) => t + b.paise, 0) / buckets.length;
  const y = (paise: number) => base - ((base - top) * paise) / max;
  const bars = buckets.map((b, i) => {
    const h = b.paise > 0 ? Math.max(1.5, base - y(b.paise)) : 0;
    const x = i * step + (step - bw) / 2;
    return `${h > 0 ? `<rect class="bar" x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${i === peak ? TEAL : BAR}" />` : ''}${
      i % every === 0 ? `<text x="${(i * step + step / 2).toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="8" fill="${MUTED}">${b.label}</text>` : ''}`;
  }).join('');
  const px = Math.min(W - 30, Math.max(30, peak * step + step / 2));
  // The average is named at whichever end the peak is not.
  const left = peak > buckets.length / 2;
  return `<svg class="bars" ${SVG_NS} width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="max-width:100%;page-break-inside:avoid">
            <line x1="0" y1="${base}" x2="${W}" y2="${base}" stroke="${RULE}" stroke-width="1" />
            ${bars}
            <line x1="0" y1="${y(mean).toFixed(1)}" x2="${W}" y2="${y(mean).toFixed(1)}" stroke="${MUTED}" stroke-width="0.75" stroke-dasharray="3 3" />
            <text x="${left ? 0 : W}" y="${(y(mean) - 4).toFixed(1)}" text-anchor="${left ? 'start' : 'end'}" font-size="8" fill="${MUTED}">average ${formatCompact(Math.round(mean))}</text>
            <text x="${px.toFixed(1)}" y="11" text-anchor="middle" font-size="9" font-weight="600" fill="${INK}">${formatCompact(max)}</text>
          </svg>`;
}
