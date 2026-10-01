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

  it('is what a group\'s row opens, and the drill-down keeps the group', () => {
    expect(fs.readFileSync('app/(people)/group/[id].tsx', 'utf8')).toMatch(/router\.push\(`\/reports\?group=\$\{id\}`\)/);
    expect(fs.readFileSync('app/(money)/reports.tsx', 'utf8')).toMatch(/\$\{groupId \? `&group=\$\{groupId\}` : ''\}&category=/);
    expect(fs.readFileSync('app/(money)/report-transactions.tsx', 'utf8')).toMatch(/loadReportTransactions\(db, month, range, groupParam\)/);
  });

  it('the row says nothing about the period while it is simply this month', () => {
    expect(fs.readFileSync('app/(people)/personal.tsx', 'utf8')).toMatch(/const period = from == null && to == null \? null/);
    expect(fs.readFileSync('src/components/finance/LedgerTotalsRow.tsx', 'utf8')).toMatch(/\{!!label && <Text style=\{styles\.period\}>/);
  });
});
