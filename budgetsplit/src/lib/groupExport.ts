import type * as SQLite from 'expo-sqlite';
import { format } from 'date-fns';
import { getTransactionsForGroup, type TxnWithSplits } from '../db/queries/transactions';
import type { BudgetGroup } from '../db/queries/groups';
import { GROUP_EXPORT_HEADER } from './importParse';

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

/** Wrap a field in double quotes, escaping embedded quotes. */
const quote = (s: string | null | undefined) => `"${(s ?? '').replace(/"/g, '""')}"`;

/** Row total in paise: income sits on the payment side, else on shares (fall back
 *  to payments when a row has no shares). */
function rowTotalPaise(t: TxnWithSplits): number {
  const pay = t.payments.reduce((s, p) => s + p.amount, 0);
  if (t.kind === 'income') return pay;
  const share = t.shares.reduce((s, sh) => s + sh.amount, 0);
  return share || pay;
}

function rowLine(groupName: string, t: TxnWithSplits): string {
  const date = format(new Date(t.date), 'yyyy-MM-dd HH:mm');
  const amount = (rowTotalPaise(t) / 100).toFixed(2);
  return `${date},${quote(groupName)},${quote(t.category)},${t.kind},${amount},${quote(t.note)}`;
}

/** Export one group's logged transactions. */
export async function buildGroupExportCsv(
  db: SQLite.SQLiteDatabase,
  group: BudgetGroup,
): Promise<GroupExportResult> {
  const txns = await getTransactionsForGroup(db, group.id);
  const lines = [GROUP_EXPORT_HEADER, ...txns.map(t => rowLine(group.name, t))];
  return { csv: lines.join('\n'), rowCount: txns.length };
}

/** Export every group's logged transactions into one CSV (Group column distinguishes them). */
export async function buildAllGroupsExportCsv(
  db: SQLite.SQLiteDatabase,
  groups: BudgetGroup[],
): Promise<GroupExportResult> {
  const lines = [GROUP_EXPORT_HEADER];
  let rowCount = 0;
  for (const g of groups) {
    const txns = await getTransactionsForGroup(db, g.id);
    for (const t of txns) { lines.push(rowLine(g.name, t)); rowCount += 1; }
  }
  return { csv: lines.join('\n'), rowCount };
}
