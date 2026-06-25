import type * as SQLite from 'expo-sqlite';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { getTransactionsInRange } from '../db/queries/transactions';
import { formatRupees } from './money';
import type { BudgetGroup } from '../db/queries/groups';

/**
 * Report export builders — pure string assembly extracted from reports.tsx
 * (which was an 870-line screen). These produce the CSV / PDF-HTML payloads;
 * the screen keeps the file/print/share IO. The HTML is a deliberately light
 * (dark-on-white) document so it prints and renders correctly in PDF viewers.
 */

/** The subset of a group summary the PDF needs. */
export type PdfSummary = { group: BudgetGroup; income: number; expense: number };

/** Month transactions as a CSV string (one row per transaction). */
export async function buildReportCsv(
  db: SQLite.SQLiteDatabase,
  groups: BudgetGroup[],
  month: Date,
): Promise<string> {
  const fromMs = startOfMonth(month).getTime();
  const toMs = endOfMonth(month).getTime();

  const lines = ['Date,Group,Category,Kind,Amount (Rs),Note'];
  for (const g of groups) {
    const txns = await getTransactionsInRange(db, g.id, fromMs, toMs);
    for (const t of txns) {
      const date = format(new Date(t.date), 'yyyy-MM-dd');
      // Income has no shares — its amount lives on the payment side.
      const paise = t.kind === 'income'
        ? t.payments.reduce((s, p) => s + p.amount, 0)
        : t.shares.reduce((s, sh) => s + sh.amount, 0);
      const amt = (paise / 100).toFixed(2);
      const note = (t.note ?? '').replace(/"/g, '""');
      lines.push(`${date},"${g.name}","${t.category}",${t.kind},${amt},"${note}"`);
    }
  }
  return lines.join('\n');
}

/** A printable month report as a self-contained light-themed HTML document. */
export async function buildReportHtml(
  db: SQLite.SQLiteDatabase,
  summaries: PdfSummary[],
  month: Date,
): Promise<string> {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const monthLabel = format(month, 'MMMM yyyy');
  const fromMs = startOfMonth(month).getTime();
  const toMs = endOfMonth(month).getTime();

  let body = '';
  for (const s of summaries) {
    const txns = await getTransactionsInRange(db, s.group.id, fromMs, toMs);
    if (txns.length === 0) continue;

    const rows = txns
      .sort((a, b) => b.date - a.date)
      .map(t => {
        const amt = t.kind === 'income'
          ? t.payments.reduce((x, p) => x + p.amount, 0)
          : t.shares.reduce((x, sh) => x + sh.amount, 0);
        // Print-safe (dark-on-white) amount colors — the PDF is a light document.
        const color = t.kind === 'income' ? '#0E7C5A' : '#C0392B';
        return `<tr>
              <td>${format(new Date(t.date), 'dd MMM')}</td>
              <td>${esc(t.category)}</td>
              <td class="note">${esc(t.note ?? '')}</td>
              <td style="text-align:right;color:${color};font-family:'SF Mono',monospace;font-weight:600">${t.kind === 'income' ? '+' : '-'}${formatRupees(amt)}</td>
            </tr>`;
      })
      .join('');

    body += `
          <h2>${esc(s.group.name)}</h2>
          <div class="totals">
            <div class="total-card income"><span class="total-label">Income</span><span class="total-value">${formatRupees(s.income)}</span></div>
            <div class="total-card expense"><span class="total-label">Expense</span><span class="total-value">${formatRupees(s.expense)}</span></div>
            <div class="total-card net"><span class="total-label">Net</span><span class="total-value">${formatRupees(s.income - s.expense)}</span></div>
          </div>
          <table>
            <thead><tr><th>Date</th><th>Category</th><th>Note</th><th style="text-align:right">Amount</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>`;
  }

  if (!body) body = '<p class="empty">No transactions this month.</p>';

  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
        <style>
          /* Light document — readable on white paper and when printed (dark page
             backgrounds are commonly dropped by PDF viewers/printers). */
          * { box-sizing: border-box; }
          body { font-family: -apple-system, 'Inter', Helvetica, sans-serif; background: #FFFFFF; color: #1A1A1A; padding: 40px 36px; margin: 0; }
          h1 { font-size: 26px; margin: 0; color: #0A0F11; font-weight: 700; letter-spacing: -0.5px; }
          .sub { color: #0E7C5A; font-size: 14px; margin: 4px 0 32px; font-weight: 600; }
          h2 { font-size: 16px; margin: 36px 0 12px; padding-bottom: 8px; border-bottom: 2px solid #2A3433; color: #0A0F11; font-weight: 700; }
          .totals { display: flex; gap: 12px; margin-bottom: 16px; }
          .total-card { flex: 1; background: #F2F5F4; border: 1px solid #6E7A78; border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }
          .total-card.income { border-left: 4px solid #0E7C5A; }
          .total-card.expense { border-left: 4px solid #C0392B; }
          .total-card.net { border-left: 4px solid #0E6E66; }
          .total-label { font-size: 11px; color: #2A3433; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; }
          .total-value { font-size: 16px; font-weight: 700; color: #111111; font-family: 'SF Mono', monospace; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; background: #FFFFFF; border: 2px solid #2A3433; }
          th { text-align: left; color: #111111; font-weight: 700; padding: 10px 12px; background: #E3E8E7; border: 1px solid #6E7A78; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; }
          td { padding: 10px 12px; border: 1px solid #6E7A78; color: #1A1A1A; }
          td.note { color: #2A3433; }
          .empty { color: #2A3433; text-align: center; padding: 40px; }
          .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #2A3433; border-top: 2px solid #2A3433; padding-top: 16px; }
        </style></head>
        <body>
          <h1>BudgetSplit Report</h1>
          <div class="sub">${monthLabel}</div>
          ${body}
          <div class="footer">Generated by BudgetSplit &middot; ${format(new Date(), 'dd MMM yyyy')}</div>
        </body></html>`;
}
