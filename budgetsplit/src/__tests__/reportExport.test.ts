import type { TxnWithSplits } from '../db/queries/transactions';
import type { BudgetGroup } from '../db/queries/groups';

jest.mock('../db/queries/transactions', () => ({
  getTransactionsInRange: jest.fn(),
}));

import { getTransactionsInRange } from '../db/queries/transactions';
import { buildReportCsv, buildReportHtml, type PdfSummary } from '../lib/reportExport';
import { splitCsvLine } from '../lib/importParse';

const mockRange = getTransactionsInRange as jest.MockedFunction<typeof getTransactionsInRange>;
const db = {} as never;
const MONTH = new Date(2026, 0, 15);

const group = (id: string, name: string): BudgetGroup => ({ id, name } as BudgetGroup);

const txn = (over: Partial<TxnWithSplits> = {}): TxnWithSplits => ({
  id: 't1',
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
    expect(csv).toBe('Date,Group,Category,Kind,Amount (Rs),Note');
  });

  it('writes one row per transaction across all groups', async () => {
    mockRange.mockResolvedValue([txn(), txn({ id: 't2' })]);
    const csv = await buildReportCsv(db, [group('g1', 'A'), group('g2', 'B')], MONTH);
    expect(csv.split('\n')).toHaveLength(5); // header + 2 groups x 2 txns
  });

  it('converts paise to a 2-decimal rupee amount', async () => {
    mockRange.mockResolvedValue([txn({ payments: [{ personId: 'p1', amount: 123456 }], shares: [{ personId: 'p1', amount: 123456 }] })]);
    const csv = await buildReportCsv(db, [group('g1', 'Trip')], MONTH);
    expect(splitCsvLine(csv.split('\n')[1])[4]).toBe('1234.56');
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
    const amounts = csv.split('\n').slice(1).map(l => splitCsvLine(l)[4]);
    expect(amounts).toEqual(['5000.00', '900.00', '300.00']);
  });

  it('formats the date as yyyy-MM-dd (no time component)', async () => {
    mockRange.mockResolvedValue([txn({ date: new Date(2026, 0, 5, 9, 7).getTime() })]);
    const csv = await buildReportCsv(db, [group('g1', 'Trip')], MONTH);
    expect(splitCsvLine(csv.split('\n')[1])[0]).toBe('2026-01-05');
  });

  it('renders a null note as an empty field', async () => {
    mockRange.mockResolvedValue([txn({ note: null as unknown as string })]);
    const csv = await buildReportCsv(db, [group('g1', 'Trip')], MONTH);
    expect(splitCsvLine(csv.split('\n')[1])[5]).toBe('');
  });

  // Quote-escaping must apply to EVERY quoted field, not just the note — an
  // unescaped quote terminates the field early and shifts every later column.
  it('escapes embedded quotes in the note', async () => {
    mockRange.mockResolvedValue([txn({ note: 'the "good" cafe' })]);
    const csv = await buildReportCsv(db, [group('g1', 'Trip')], MONTH);
    expect(splitCsvLine(csv.split('\n')[1])[5]).toBe('the "good" cafe');
  });

  it('escapes embedded quotes in the group name', async () => {
    mockRange.mockResolvedValue([txn()]);
    const csv = await buildReportCsv(db, [group('g1', 'Trip "2026"')], MONTH);
    const cells = splitCsvLine(csv.split('\n')[1]);
    expect(cells).toHaveLength(6);
    expect(cells[1]).toBe('Trip "2026"');
  });

  it('escapes embedded quotes in the category', async () => {
    mockRange.mockResolvedValue([txn({ category: 'Food "out"' })]);
    const csv = await buildReportCsv(db, [group('g1', 'Trip')], MONTH);
    const cells = splitCsvLine(csv.split('\n')[1]);
    expect(cells).toHaveLength(6);
    expect(cells[2]).toBe('Food "out"');
  });

  it('keeps columns aligned when fields contain commas', async () => {
    mockRange.mockResolvedValue([txn({ category: 'Food, Drink', note: 'a, b' })]);
    const csv = await buildReportCsv(db, [group('g1', 'Trip, 2026')], MONTH);
    expect(splitCsvLine(csv.split('\n')[1])).toHaveLength(6);
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
    mockRange.mockResolvedValueOnce([]).mockResolvedValueOnce([txn()]);
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
    expect(html).toMatch(/>-₹/);
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
});
