import fs from 'fs';
import { createTestDb } from './helpers/testDb';
import { loadDemoPersona } from '../db/demoPersonas';
import { loadReportsData } from '../lib/reportsData';
import { getAllGroups } from '../db/queries/groups';

jest.setTimeout(60_000);

// U-88: Reports opened from a group covers that group, everywhere on the page.
describe('one group\'s report', () => {
  it('holds only that group, and adds up to less than everything', async () => {
    const db = createTestDb() as never;
    await loadDemoPersona(db, 'established');
    const shared = (await getAllGroups(db)).find(g => g.is_personal !== 1)!;
    // Last month: the demo has spending there on any day this runs.
    const month = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 15);
    const all = await loadReportsData(db, month);
    const one = await loadReportsData(db, month, undefined, shared.id);

    expect(one.scopeGroup?.id).toBe(shared.id);
    expect(one.summaries.map(s => s.group.id)).toEqual([shared.id]);
    expect(all.summaries.length).toBeGreaterThan(1);
    expect(all.scopeGroup).toBeNull();
    // The year's figure is scoped too, not only the cards: it used to read every group.
    expect(one.yearExpense).toBeLessThan(all.yearExpense);
    // My Budget spans every group, so it is not shown on one group's report.
    expect(one.myBudget).toBeNull();
  });

  it('is what a group\'s row opens, on the dates the row covers, and the drill-down keeps the group', () => {
    const { reportsHref, totalsRowLabel } = jest.requireActual('../lib/txnFilter') as typeof import('../lib/txnFilter');
    const sep = { from: new Date(2026, 8, 1).getTime(), to: new Date(2026, 8, 30, 23, 59, 59, 999).getTime() };
    // No date: this month, in this group. A whole month: that month. Anything else: exactly those dates.
    expect(reportsHref({ from: null, to: null, range: 'any' }, 'g1')).toBe('/reports?group=g1');
    expect(reportsHref({ ...sep, range: 'lastMonth' }, 'g1')).toBe('/reports?group=g1&month=2026-09');
    expect(reportsHref({ from: 100, to: 200, range: 'custom' }, 'g1')).toBe('/reports?group=g1&from=100&to=200');
    expect(reportsHref({ from: 100, to: null, range: '7d' }, undefined, 999)).toBe('/reports?from=100&to=999');
    expect(reportsHref({ from: null, to: null, range: 'any' })).toBe('/reports');
    // The row said "Last month" and its button opened this month: the group's link carried no dates.
    expect(fs.readFileSync('app/(people)/group/[id].tsx', 'utf8')).toMatch(/filter\.reportsHref\(id\)/);
    expect(fs.readFileSync('app/(people)/personal.tsx', 'utf8')).toMatch(/txnFilter\.reportsHref\(\)/);
    expect(fs.readFileSync('app/(money)/reports.tsx', 'utf8')).toMatch(/\$\{groupId \? `&group=\$\{groupId\}` : ''\}&category=/);
    expect(fs.readFileSync('app/(money)/report-transactions.tsx', 'utf8')).toMatch(/loadReportTransactions\(db, month, range, groupParam\)/);

    // ...and the label says only what changed it; this month and no filter go unsaid.
    expect(totalsRowLabel({ from: null, to: null, range: 'any' }, 0)).toBeNull();
    expect(totalsRowLabel({ ...sep, range: 'lastMonth' }, 2)).toBe('Last month · 2 filters');
    expect(totalsRowLabel({ from: 1, to: 2, range: 'custom' }, 1)).toBe('Chosen dates · 1 filter');
  });

  it('the row says nothing about the period while it is simply this month', () => {
    expect(fs.readFileSync('src/components/finance/LedgerTotalsRow.tsx', 'utf8')).toMatch(/\{!!label && <Text style=\{styles\.period\}>/);
  });
});
