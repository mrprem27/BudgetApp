import type { TxnWithSplits } from '../db/queries/transactions';
import type { BudgetGroup } from '../db/queries/groups';

jest.mock('../db/queries/transactions', () => ({
  getTransactionsInRange: jest.fn(),
}));
// The report CSV is the group export scoped to a month, so it reads `getMe` for
// the Direction column the same way.
jest.mock('../db/queries/persons', () => ({
  getMe: jest.fn(async () => ({ id: 'p1', name: 'Prem' })),
  getAllPersons: jest.fn(async () => [{ id: 'p1', name: 'Prem' }, { id: 'p2', name: 'Asha' }, { id: 'p3', name: 'Ravi' }]),
}));

// Every category these tests use is in the catalog; `Mystery` is the one that is not.
jest.mock('../db/queries/categories', () => ({
  getCategories: jest.fn(async () => ['Food', 'Fuel', 'Older', 'Newer', '<b>Food</b>', 'Rent', 'Travel', 'Bills', 'Gym', 'Books'].map(name => ({ name }))),
}));

import { getTransactionsInRange } from '../db/queries/transactions';
import { buildReportCsv, buildReportHtml, spendBuckets, type PdfSummary } from '../lib/reportExport';
import { splitCsvLine, GROUP_EXPORT_HEADER, isBudgetSplitExport, parseBudgetSplitExport } from '../lib/importParse';

/** Header is Date,Group,Category,Kind,Direction,Amount,Note. */
const AMOUNT = 5;
const NOTE = 6;

const mockRange = getTransactionsInRange as jest.MockedFunction<typeof getTransactionsInRange>;
const db = {} as never;
const MONTH = new Date(2026, 0, 15);

const group = (id: string, name: string): BudgetGroup => ({ id, name } as BudgetGroup);

const txn = (over: Partial<TxnWithSplits> = {}): TxnWithSplits => ({
  id: 't1',
  group_id: 'g1',
  date: new Date(2026, 0, 10, 12).getTime(),
  category: 'Food',
  kind: 'expense',
  note: 'lunch',
  payments: [{ personId: 'p1', amount: 25000 }],
  shares: [{ personId: 'p1', amount: 25000 }],
  ...over,
} as TxnWithSplits);

beforeEach(() => mockRange.mockReset());

describe('buildReportCsv', () => {
  it('emits only the header when there are no transactions', async () => {
    mockRange.mockResolvedValue([]);
    const csv = await buildReportCsv(db, [group('g1', 'Trip')], MONTH);
    // Not a header of its own. This wrote `Amount (Rs)` where the group export
    // writes `Amount`, so a report CSV failed `isBudgetSplitExport` and re-imported
    // through the generic bank heuristic with its Category and Kind guessed.
    expect(csv).toBe(GROUP_EXPORT_HEADER);
  });

  it('writes one row per transaction across all groups', async () => {
    mockRange.mockResolvedValue([txn(), txn({ id: 't2' })]);
    const csv = await buildReportCsv(db, [group('g1', 'A'), group('g2', 'B')], MONTH);
    expect(csv.split('\n')).toHaveLength(5); // header + 2 groups x 2 txns
  });

  it('converts paise to a 2-decimal rupee amount', async () => {
    mockRange.mockResolvedValue([txn({ payments: [{ personId: 'p1', amount: 123456 }], shares: [{ personId: 'p1', amount: 123456 }] })]);
    const csv = await buildReportCsv(db, [group('g1', 'Trip')], MONTH);
    expect(splitCsvLine(csv.split('\n')[1])[AMOUNT]).toBe('1234.56');
  });

  // Canonical row total (txnTotal): the payments side for every kind — income has
  // no shares, and a balanced expense's payments equal its shares — with shares as
  // the fallback for legacy rows that recorded no payments.
  it('totals every kind from payments, falling back to shares', async () => {
    mockRange.mockResolvedValue([
      txn({ kind: 'income', payments: [{ personId: 'p1', amount: 500000 }], shares: [] }),
      txn({ id: 't2', kind: 'expense', payments: [{ personId: 'p1', amount: 90000 }], shares: [{ personId: 'p1', amount: 90000 }] }),
      txn({ id: 't3', kind: 'expense', payments: [], shares: [{ personId: 'p1', amount: 30000 }] }),
    ]);
    const csv = await buildReportCsv(db, [group('g1', 'Trip')], MONTH);
    const amounts = csv.split('\n').slice(1).map(l => splitCsvLine(l)[AMOUNT]);
    expect(amounts).toEqual(['5000.00', '900.00', '300.00']);
  });

  // Now carries the time, because it shares the group export's row builder — and
  // a re-import that keeps the time is strictly better than one that discards it.
  it('formats the date as yyyy-MM-dd HH:mm', async () => {
    mockRange.mockResolvedValue([txn({ date: new Date(2026, 0, 5, 9, 7).getTime() })]);
    const csv = await buildReportCsv(db, [group('g1', 'Trip')], MONTH);
    expect(splitCsvLine(csv.split('\n')[1])[0]).toBe('2026-01-05 09:07');
  });

  // D21: the whole point of aligning the two headers.
  it('can be re-imported, which the (Rs) header made impossible', async () => {
    mockRange.mockResolvedValue([txn({ category: 'Groceries', note: 'weekly shop' })]);
    const csv = await buildReportCsv(db, [group('g1', 'Trip')], MONTH);
    expect(isBudgetSplitExport(csv)).toBe(true);
    expect(parseBudgetSplitExport(csv).rows[0]).toMatchObject({
      amount: 25000, kind: 'expense', category: 'Groceries', description: 'weekly shop',
    });
  });

  it('renders a null note as an empty field', async () => {
    mockRange.mockResolvedValue([txn({ note: null as unknown as string })]);
    const csv = await buildReportCsv(db, [group('g1', 'Trip')], MONTH);
    expect(splitCsvLine(csv.split('\n')[1])[NOTE]).toBe('');
  });

  // Quote-escaping must apply to EVERY quoted field, not just the note — an
  // unescaped quote terminates the field early and shifts every later column.
  it('escapes embedded quotes in the note', async () => {
    mockRange.mockResolvedValue([txn({ note: 'the "good" cafe' })]);
    const csv = await buildReportCsv(db, [group('g1', 'Trip')], MONTH);
    expect(splitCsvLine(csv.split('\n')[1])[NOTE]).toBe('the "good" cafe');
  });

  it('escapes embedded quotes in the group name', async () => {
    mockRange.mockResolvedValue([txn()]);
    const csv = await buildReportCsv(db, [group('g1', 'Trip "2026"')], MONTH);
    const cells = splitCsvLine(csv.split('\n')[1]);
    expect(cells).toHaveLength(7);
    expect(cells[1]).toBe('Trip "2026"');
  });

  it('escapes embedded quotes in the category', async () => {
    mockRange.mockResolvedValue([txn({ category: 'Food "out"' })]);
    const csv = await buildReportCsv(db, [group('g1', 'Trip')], MONTH);
    const cells = splitCsvLine(csv.split('\n')[1]);
    expect(cells).toHaveLength(7);
    expect(cells[2]).toBe('Food "out"');
  });

  it('keeps columns aligned when fields contain commas', async () => {
    mockRange.mockResolvedValue([txn({ category: 'Food, Drink', note: 'a, b' })]);
    const csv = await buildReportCsv(db, [group('g1', 'Trip, 2026')], MONTH);
    expect(splitCsvLine(csv.split('\n')[1])).toHaveLength(7);
  });
});

describe('buildReportHtml', () => {
  const summary = (name: string, income: number, expense: number): PdfSummary => ({
    group: group('g1', name), income, expense,
  });

  it('produces a self-contained HTML document', async () => {
    mockRange.mockResolvedValue([txn()]);
    const html = await buildReportHtml(db, [summary('Trip', 0, 25000)], MONTH);
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('</html>');
    expect(html).not.toMatch(/<script|src=["']http/i);
  });

  it('shows the month label', async () => {
    mockRange.mockResolvedValue([txn()]);
    const html = await buildReportHtml(db, [summary('Trip', 0, 25000)], MONTH);
    expect(html).toContain('January 2026');
  });

  it('falls back to an empty-state message when nothing matched', async () => {
    mockRange.mockResolvedValue([]);
    const html = await buildReportHtml(db, [summary('Trip', 0, 0)], MONTH);
    expect(html).toContain('No transactions this month.');
  });

  it('skips groups with no transactions rather than printing an empty table', async () => {
    mockRange.mockResolvedValueOnce([]).mockResolvedValueOnce([txn()]).mockResolvedValue([]);
    const html = await buildReportHtml(db, [summary('Empty', 0, 0), summary('Full', 0, 25000)], MONTH);
    expect(html).not.toContain('<h2>Empty</h2>');
    expect(html).toContain('<h2>Full</h2>');
  });

  it('escapes HTML in group name, category and note', async () => {
    mockRange.mockResolvedValue([txn({ category: '<b>Food</b>', note: 'a & b <img>' })]);
    const html = await buildReportHtml(db, [summary('<script>x</script>', 0, 25000)], MONTH);
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;Food&lt;/b&gt;');
    expect(html).toContain('a &amp; b &lt;img&gt;');
    expect(html).not.toContain('<script>x</script>');
  });

  it('signs income with + and expense with -', async () => {
    mockRange.mockResolvedValue([
      txn({ kind: 'income', payments: [{ personId: 'p1', amount: 1000 }], shares: [] }),
      txn({ id: 't2', kind: 'expense' }),
    ]);
    const html = await buildReportHtml(db, [summary('Trip', 1000, 25000)], MONTH);
    expect(html).toMatch(/>\+₹/);
    expect(html).toMatch(/>−₹/);
  });

  it('sorts transactions newest first', async () => {
    mockRange.mockResolvedValue([
      txn({ id: 'old', category: 'Older', date: new Date(2026, 0, 2).getTime() }),
      txn({ id: 'new', category: 'Newer', date: new Date(2026, 0, 20).getTime() }),
    ]);
    const html = await buildReportHtml(db, [summary('Trip', 0, 50000)], MONTH);
    expect(html.indexOf('Newer')).toBeLessThan(html.indexOf('Older'));
  });

  it('renders a negative net without crashing', async () => {
    mockRange.mockResolvedValue([txn()]);
    const html = await buildReportHtml(db, [summary('Trip', 1000, 90000)], MONTH);
    expect(html).toContain('Net');
  });

  it('handles an empty summaries list', async () => {
    const html = await buildReportHtml(db, [], MONTH);
    expect(html).toContain('No transactions this month.');
  });
  it('prints my share in every row, and the whole bill beside it only when they differ (U-19)', async () => {
    mockRange.mockResolvedValue([
      txn({ id: 'a', note: 'dinner', payments: [{ personId: 'p2', amount: 120000 }], shares: [{ personId: 'p1', amount: 40000 }, { personId: 'p2', amount: 80000 }] }),
      txn({ id: 'b', note: 'solo' }),
    ]);
    const html = await buildReportHtml(db, [summary('Flat', 0, 65000)], MONTH);
    // The entries, not the facts over them (the largest expense names its note too).
    const row = (note: string) => html.slice(html.indexOf('<h2>')).split('<tr>').find(r => r.includes(note))!;
    // The split dinner: ₹1,200 as the whole bill, ₹400 as mine. It printed ₹1,200 under a ₹650 total.
    expect(row('dinner')).toContain('₹1,200');
    expect(row('dinner')).toContain('−₹400');
    // Mine in full: the whole-bill cell stays empty.
    expect(row('solo')).toContain('−₹250');
    expect(row('solo').match(/₹/g)).toHaveLength(1);
    expect(html).toContain('every amount is your share');
  });

  it('keeps transfers out of the spending table and names them as not counted', async () => {
    mockRange.mockResolvedValue([
      txn({ id: 'a' }),
      txn({ id: 's', kind: 'settlement', category: 'Repayment', note: 'paid Asha', payments: [{ personId: 'p1', amount: 50000 }], shares: [{ personId: 'p2', amount: 50000 }] }),
      txn({ id: 'o', kind: 'settlement', category: 'Repayment', note: 'theirs', payments: [{ personId: 'p2', amount: 70000 }], shares: [{ personId: 'p3', amount: 70000 }] }),
    ]);
    const html = await buildReportHtml(db, [summary('Flat', 0, 25000)], MONTH);
    const [spending, transfers] = html.split('Transfers, not counted above');
    expect(transfers).toContain('paid Asha');
    expect(spending).not.toContain('paid Asha');
    // Moved is what I moved (₹500), not two friends settling between themselves.
    expect(html).toMatch(/Moved<\/span><span class="kpi-value">₹500</);
    // Who paid whom, signed from my side: mine is money out, theirs carries no sign at all.
    const row = (note: string) => transfers.split('<tr>').find(r => r.includes(note))!;
    expect(row('paid Asha')).toContain('You paid Asha');
    expect(row('paid Asha')).toContain('−₹500.00');
    expect(row('theirs')).toContain('Asha paid Ravi');
    expect(row('theirs')).toContain('>₹700.00');
  });

  it('leads with the categories, by my share', async () => {
    mockRange.mockResolvedValue([txn({ id: 'a', category: 'Food' }), txn({ id: 'b', category: 'Fuel', payments: [{ personId: 'p1', amount: 75000 }], shares: [{ personId: 'p1', amount: 75000 }] })]);
    const html = await buildReportHtml(db, [summary('Me', 0, 100000)], MONTH);
    const where = html.slice(html.indexOf('Where it went'), html.indexOf('<h2>'));
    expect(where.indexOf('Fuel')).toBeLessThan(where.indexOf('Food'));
    expect(where).toContain('75%');
  });

  it('measures the four figures against the period before (U-95)', async () => {
    const jan = txn({ id: 'now' });
    const dec = txn({ id: 'then', date: new Date(2025, 11, 10, 12).getTime(), payments: [{ personId: 'p1', amount: 20000 }], shares: [{ personId: 'p1', amount: 20000 }] });
    mockRange.mockImplementation(async (_db, _g, from) => (from >= new Date(2026, 0, 1).getTime() ? [jan] : [dec]));
    const html = await buildReportHtml(db, [summary('Me', 0, 25000)], MONTH);
    expect(html).toContain('25% more than December');
    expect(html).toContain('nothing in December to compare'); // received
    expect(html).toContain('Prepared for Prem');
    expect(html).toContain('Largest category');
  });

  it('folds a category you have not adopted into Everything else, as the Reports screen does', async () => {
    mockRange.mockResolvedValue([txn({ id: 'a', category: 'Food' }), txn({ id: 'b', category: 'Mystery', note: 'theirs' })]);
    const html = await buildReportHtml(db, [summary('Flat', 0, 50000)], MONTH);
    const where = html.slice(html.indexOf('Where it went'), html.indexOf('<h2>'));
    expect(where).toContain('Everything else');
    expect(where).not.toContain('Mystery');
    // The entry itself keeps the name it was written with.
    expect(html.slice(html.indexOf('<h2>'))).toContain('Mystery');
  });

  it('names a custom period correctly when it is empty', async () => {
    mockRange.mockResolvedValue([]);
    const html = await buildReportHtml(db, [summary('Trip', 0, 0)], MONTH, { from: new Date(2026, 0, 1).getTime(), to: new Date(2026, 0, 9).getTime() } as never);
    expect(html).toContain('No transactions in this period.');
  });
  it('draws the category ring and the spend-over-time bars as inline SVG (U-19)', async () => {
    mockRange.mockResolvedValue([
      txn({ id: 'a', category: 'Food' }),
      txn({ id: 'b', category: 'Fuel', date: new Date(2026, 0, 20, 12).getTime() }),
    ]);
    const html = await buildReportHtml(db, [summary('Me', 0, 50000)], MONTH);
    expect(html.match(/<svg class="(ring|bars)"/g)).toHaveLength(2);
    // Every chart carries its own size: one without a height was at the mercy of the print renderer.
    expect(html.match(/<svg class="\w+" xmlns="[^"]+" width="\d+" height="\d+"/g)).toHaveLength(html.match(/<svg/g)!.length);
    expect(html).not.toMatch(/display:\s*flex/);
    // Two slices, each an arc with real coordinates.
    expect(html.match(/<path d="M [\d.]+ [\d.]+ A 64 64/g)).toHaveLength(2);
    expect(html).not.toMatch(/NaN/);
    // January: a bar for the 10th and the 20th, nothing external to load.
    expect(html.match(/<rect class="bar"/g)).toHaveLength(2);
    expect(html).not.toMatch(/<script|src=["']http/i);
  });

  it('one category is a whole ring, and no spending draws no charts', async () => {
    mockRange.mockResolvedValue([txn()]);
    const one = await buildReportHtml(db, [summary('Me', 0, 25000)], MONTH);
    expect(one).toMatch(/<circle [^>]*stroke-width="24"/);
    expect(one).not.toMatch(/NaN/);
    // One day of spending is not a chart.
    expect(one).not.toMatch(/<svg class="bars"/);
    mockRange.mockResolvedValue([txn({ kind: 'income' })]);
    expect(await buildReportHtml(db, [summary('Me', 25000, 0)], MONTH)).not.toMatch(/<svg/);
  });
});

describe('spendBuckets', () => {
  const at = (m: number, d: number) => new Date(2026, m, d, 12).getTime();
  it('is one bucket per day for a month, empty days included', () => {
    const b = spendBuckets([{ date: at(0, 3), paise: 100 }, { date: at(0, 3), paise: 50 }, { date: at(1, 1), paise: 999 }], new Date(2026, 0, 1).getTime(), new Date(2026, 0, 31, 23, 59).getTime());
    expect(b).toHaveLength(31);
    expect(b[2]).toEqual({ label: '3', paise: 150 });
    expect(b.reduce((t, x) => t + x.paise, 0)).toBe(150);
  });
  it('is one bucket per month for a longer period', () => {
    const b = spendBuckets([{ date: at(0, 3), paise: 100 }, { date: at(2, 9), paise: 40 }], new Date(2026, 0, 1).getTime(), new Date(2026, 2, 31).getTime());
    expect(b.map(x => x.label)).toEqual(['Jan', 'Feb', 'Mar']);
    expect(b.map(x => x.paise)).toEqual([100, 0, 40]);
  });
  it('is empty for a backwards period', () => {
    expect(spendBuckets([], 10, 5)).toEqual([]);
  });
});
