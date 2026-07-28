import type { TxnWithSplits } from '../db/queries/transactions';
import type { BudgetGroup } from '../db/queries/groups';

// The only DB touchpoint — stubbed so the pure CSV assembly can be tested.
jest.mock('../db/queries/transactions', () => ({
  getTransactionsForGroup: jest.fn(),
}));

import { getTransactionsForGroup } from '../db/queries/transactions';
import { buildGroupExportCsv, buildAllGroupsExportCsv } from '../lib/groupExport';
import {
  GROUP_EXPORT_HEADER,
  isBudgetSplitExport,
  parseBudgetSplitExport,
  splitCsvLine,
} from '../lib/importParse';

const mockGet = getTransactionsForGroup as jest.MockedFunction<typeof getTransactionsForGroup>;
const db = {} as never;

const group = (id: string, name: string): BudgetGroup => ({ id, name } as BudgetGroup);

const txn = (over: Partial<TxnWithSplits> = {}): TxnWithSplits => ({
  id: 't1',
  date: new Date(2026, 0, 15, 14, 30).getTime(),
  category: 'Food',
  kind: 'expense',
  note: 'lunch',
  payments: [{ personId: 'p1', amount: 25000 }],
  shares: [{ personId: 'p1', amount: 25000 }],
  ...over,
} as TxnWithSplits);

beforeEach(() => mockGet.mockReset());

describe('buildGroupExportCsv', () => {
  it('emits the header even with no transactions', async () => {
    mockGet.mockResolvedValue([]);
    const { csv, rowCount } = await buildGroupExportCsv(db, group('g1', 'Trip'));
    expect(csv).toBe(GROUP_EXPORT_HEADER);
    expect(rowCount).toBe(0);
  });

  it('writes one line per transaction plus the header', async () => {
    mockGet.mockResolvedValue([txn(), txn({ id: 't2' })]);
    const { csv, rowCount } = await buildGroupExportCsv(db, group('g1', 'Trip'));
    expect(csv.split('\n')).toHaveLength(3);
    expect(rowCount).toBe(2);
  });

  it('converts paise to a 2-decimal rupee amount', async () => {
    mockGet.mockResolvedValue([txn({ shares: [{ personId: 'p1', amount: 25000 }] })]);
    const { csv } = await buildGroupExportCsv(db, group('g1', 'Trip'));
    expect(splitCsvLine(csv.split('\n')[1])[4]).toBe('250.00');
  });

  it('totals an expense from its shares, not its payments', async () => {
    mockGet.mockResolvedValue([txn({
      kind: 'expense',
      payments: [{ personId: 'p1', amount: 90000 }], // one person fronted it
      shares: [{ personId: 'p1', amount: 30000 }, { personId: 'p2', amount: 60000 }],
    })]);
    const { csv } = await buildGroupExportCsv(db, group('g1', 'Trip'));
    expect(splitCsvLine(csv.split('\n')[1])[4]).toBe('900.00');
  });

  it('totals income from the payment side', async () => {
    mockGet.mockResolvedValue([txn({ kind: 'income', payments: [{ personId: 'p1', amount: 500000 }], shares: [] })]);
    const { csv } = await buildGroupExportCsv(db, group('g1', 'Trip'));
    expect(splitCsvLine(csv.split('\n')[1])[4]).toBe('5000.00');
  });

  it('falls back to payments when an expense has no shares', async () => {
    mockGet.mockResolvedValue([txn({ kind: 'expense', payments: [{ personId: 'p1', amount: 12300 }], shares: [] })]);
    const { csv } = await buildGroupExportCsv(db, group('g1', 'Trip'));
    expect(splitCsvLine(csv.split('\n')[1])[4]).toBe('123.00');
  });

  it('handles a zero-amount row', async () => {
    mockGet.mockResolvedValue([txn({ payments: [], shares: [] })]);
    const { csv } = await buildGroupExportCsv(db, group('g1', 'Trip'));
    expect(splitCsvLine(csv.split('\n')[1])[4]).toBe('0.00');
  });

  it('escapes embedded double quotes in the note', async () => {
    mockGet.mockResolvedValue([txn({ note: 'the "good" cafe' })]);
    const { csv } = await buildGroupExportCsv(db, group('g1', 'Trip'));
    expect(csv.split('\n')[1]).toContain('"the ""good"" cafe"');
    expect(splitCsvLine(csv.split('\n')[1])[5]).toBe('the "good" cafe');
  });

  it('quotes a comma-containing group, category and note so columns do not shift', async () => {
    mockGet.mockResolvedValue([txn({ category: 'Food, Drink', note: 'a, b, c' })]);
    const { csv } = await buildGroupExportCsv(db, group('g1', 'Trip, 2026'));
    const cells = splitCsvLine(csv.split('\n')[1]);
    expect(cells).toHaveLength(6);
    expect(cells[1]).toBe('Trip, 2026');
    expect(cells[2]).toBe('Food, Drink');
    expect(cells[5]).toBe('a, b, c');
  });

  it('renders a null note as an empty field', async () => {
    mockGet.mockResolvedValue([txn({ note: null as unknown as string })]);
    const { csv } = await buildGroupExportCsv(db, group('g1', 'Trip'));
    expect(splitCsvLine(csv.split('\n')[1])[5]).toBe('');
  });

  it('formats the date as yyyy-MM-dd HH:mm', async () => {
    mockGet.mockResolvedValue([txn({ date: new Date(2026, 0, 5, 9, 7).getTime() })]);
    const { csv } = await buildGroupExportCsv(db, group('g1', 'Trip'));
    expect(splitCsvLine(csv.split('\n')[1])[0]).toBe('2026-01-05 09:07');
  });
});

describe('buildAllGroupsExportCsv', () => {
  it('emits a single header for all groups', async () => {
    mockGet.mockResolvedValue([txn()]);
    const { csv } = await buildAllGroupsExportCsv(db, [group('g1', 'A'), group('g2', 'B')]);
    expect(csv.split('\n').filter(l => l === GROUP_EXPORT_HEADER)).toHaveLength(1);
  });

  it('counts rows across every group', async () => {
    mockGet.mockResolvedValue([txn(), txn({ id: 't2' })]);
    const { rowCount } = await buildAllGroupsExportCsv(db, [group('g1', 'A'), group('g2', 'B')]);
    expect(rowCount).toBe(4);
  });

  it('labels each row with its own group name', async () => {
    mockGet.mockResolvedValue([txn()]);
    const { csv } = await buildAllGroupsExportCsv(db, [group('g1', 'Alpha'), group('g2', 'Beta')]);
    const names = csv.split('\n').slice(1).map(l => splitCsvLine(l)[1]);
    expect(names).toEqual(['Alpha', 'Beta']);
  });

  it('handles an empty group list and groups with no transactions', async () => {
    mockGet.mockResolvedValue([]);
    await expect(buildAllGroupsExportCsv(db, [])).resolves.toEqual({ csv: GROUP_EXPORT_HEADER, rowCount: 0 });
    await expect(buildAllGroupsExportCsv(db, [group('g1', 'A')])).resolves.toEqual({ csv: GROUP_EXPORT_HEADER, rowCount: 0 });
  });
});

// The export exists to be re-importable — these guard that contract end-to-end.
describe('round-trip through the import parser', () => {
  it('is recognised as a BudgetSplit export', async () => {
    mockGet.mockResolvedValue([txn()]);
    const { csv } = await buildGroupExportCsv(db, group('g1', 'Trip'));
    expect(isBudgetSplitExport(csv)).toBe(true);
  });

  it('parses back the same number of rows', async () => {
    mockGet.mockResolvedValue([txn(), txn({ id: 't2', kind: 'income', payments: [{ personId: 'p1', amount: 1000 }], shares: [] })]);
    const { csv, rowCount } = await buildGroupExportCsv(db, group('g1', 'Trip'));
    expect(parseBudgetSplitExport(csv).rows).toHaveLength(rowCount);
  });

  it('preserves the category through the round-trip', async () => {
    mockGet.mockResolvedValue([txn({ category: 'Groceries', note: 'weekly shop' })]);
    const { csv } = await buildGroupExportCsv(db, group('g1', 'Trip'));
    expect(parseBudgetSplitExport(csv).rows[0].category).toBe('Groceries');
  });

  // ParsedRow has no `note` field — the note becomes the row's `description`.
  it('carries the note back as the description, commas and quotes intact', async () => {
    mockGet.mockResolvedValue([txn({ category: 'Groceries', note: 'weekly, big "shop"' })]);
    const { csv } = await buildGroupExportCsv(db, group('g1', 'Trip'));
    expect(parseBudgetSplitExport(csv).rows[0].description).toBe('weekly, big "shop"');
  });

  it('falls back to the category as description when the note is empty', async () => {
    mockGet.mockResolvedValue([txn({ category: 'Groceries', note: '' })]);
    const { csv } = await buildGroupExportCsv(db, group('g1', 'Trip'));
    expect(parseBudgetSplitExport(csv).rows[0].description).toBe('Groceries');
  });

  it('preserves the kind through the round-trip', async () => {
    mockGet.mockResolvedValue([
      txn({ kind: 'expense' }),
      txn({ id: 't2', kind: 'income', payments: [{ personId: 'p1', amount: 1000 }], shares: [] }),
    ]);
    const { csv } = await buildGroupExportCsv(db, group('g1', 'Trip'));
    expect(parseBudgetSplitExport(csv).rows.map(r => r.kind)).toEqual(['expense', 'income']);
  });

  it('preserves the amount through the round-trip', async () => {
    mockGet.mockResolvedValue([txn({ shares: [{ personId: 'p1', amount: 123456 }] })]);
    const { csv } = await buildGroupExportCsv(db, group('g1', 'Trip'));
    const [row] = parseBudgetSplitExport(csv).rows;
    expect(row.amount).toBe(123456);
  });
});
