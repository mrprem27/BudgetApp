import type * as SQLite from 'expo-sqlite';
import { format } from 'date-fns';
import { getTransactionsForGroup, type TxnWithSplits } from '../db/queries/transactions';
import type { BudgetGroup } from '../db/queries/groups';
import { getMe } from '../db/queries/persons';
import { GROUP_EXPORT_HEADER, csvQuote } from './importParse';
import { txnTotal, cashDirectionOf } from './splitMath';

/**
 * CSV export of logged transactions — a human-readable, re-importable dump that
 * round-trips through the Import screen (which detects the header and restores
 * Category + Kind). Scope: logged rows only (`getTransactionsForGroup` already
 * excludes soft-deleted rows and recurring-rule templates).
 *
 * Pure string assembly — file/share IO stays in the screen (mirrors reportExport.ts).
 */

export type GroupExportResult = {
  csv: string;
  rowCount: number;
};

/**
 * `meId` is what makes the Direction column answerable: a settlement is two-sided,
 * and which way it moved is a fact about *me*, not about the row's kind. Without
 * it the round trip turned money received into money paid.
 */
export function rowLine(groupName: string, t: TxnWithSplits, meId: string): string {
  const date = format(new Date(t.date), 'yyyy-MM-dd HH:mm');
  const amount = (txnTotal(t) / 100).toFixed(2);
  const dir = cashDirectionOf(t, meId);
  return `${date},${csvQuote(groupName)},${csvQuote(t.category)},${t.kind},${dir},${amount},${csvQuote(t.note)}`;
}

/** Export one group's logged transactions. */
export async function buildGroupExportCsv(
  db: SQLite.SQLiteDatabase,
  group: BudgetGroup,
): Promise<GroupExportResult> {
  const [txns, me] = await Promise.all([getTransactionsForGroup(db, group.id), getMe(db)]);
  const meId = me?.id ?? '';
  const lines = [GROUP_EXPORT_HEADER, ...txns.map(t => rowLine(group.name, t, meId))];
  return { csv: lines.join('\n'), rowCount: txns.length };
}

/** Export every group's logged transactions into one CSV (Group column distinguishes them). */
export async function buildAllGroupsExportCsv(
  db: SQLite.SQLiteDatabase,
  groups: BudgetGroup[],
): Promise<GroupExportResult> {
  const me = await getMe(db);
  const meId = me?.id ?? '';
  const lines = [GROUP_EXPORT_HEADER];
  let rowCount = 0;
  for (const g of groups) {
    const txns = await getTransactionsForGroup(db, g.id);
    for (const t of txns) { lines.push(rowLine(g.name, t, meId)); rowCount += 1; }
  }
  return { csv: lines.join('\n'), rowCount };
}
