import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import {
  startOfMonth, endOfMonth, addMonths, subMonths, format,
  startOfYear, endOfYear, getDate, getDaysInMonth, addDays,
} from 'date-fns';
import { Feather } from '@expo/vector-icons';
import { PieChart, BarChart, LineChart } from 'react-native-gifted-charts';
import { colors } from '../../src/constants/colors';
import { type } from '../../src/constants/typography';
import { space, radius, layout } from '../../src/constants/layout';
import { getAllGroups } from '../../src/db/queries/groups';
import { getTransactionsInRange } from '../../src/db/queries/transactions';
import { getBudgetAnalytics } from '../../src/lib/analytics';
import type { BudgetAnalytics } from '../../src/lib/analytics';
import { formatRupees, formatRupeesShort } from '../../src/lib/money';
import { AmountText } from '../../src/components/ui/AmountText';
import { BudgetBar } from '../../src/components/finance/BudgetBar';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { categoryVisual } from '../../src/constants/categories';
import type { BudgetGroup } from '../../src/db/queries/groups';
import type { TxnWithSplits } from '../../src/db/queries/transactions';

type GroupSummary = {
  group: BudgetGroup;
  income: number;
  expense: number;
  topCats: Array<{ name: string; amount: number }>;
};

function buildSummary(group: BudgetGroup, txns: TxnWithSplits[]): GroupSummary {
  let income = 0;
  let expense = 0;
  const catMap: Record<string, number> = {};

  for (const t of txns) {
    if (t.kind === 'income') {
      income += t.payments.reduce((s, p) => s + p.amount, 0);
    } else if (t.kind === 'expense') {
      const amt = t.shares.reduce((s, sh) => s + sh.amount, 0);
      expense += amt;
      catMap[t.category] = (catMap[t.category] ?? 0) + amt;
    }
  }

  const topCats = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, amount]) => ({ name, amount }));

  return { group, income, expense, topCats };
}

export default function ReportsScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState(() => new Date());
  const [groups, setGroups] = useState<BudgetGroup[]>([]);
  const [summaries, setSummaries] = useState<GroupSummary[]>([]);
  const [analyticsByGroup, setAnalyticsByGroup] = useState<Record<string, BudgetAnalytics>>({});
  const [yearIncome, setYearIncome] = useState(0);
  const [yearExpense, setYearExpense] = useState(0);
  const [yearTopCat, setYearTopCat] = useState('—');
  const [biggestTxn, setBiggestTxn] = useState(0);
  const [pieData, setPieData] = useState<Array<{ value: number; color: string; text: string }>>([]);
  const [trendData, setTrendData] = useState<Array<{ value: number; label: string; frontColor: string }>>([]);
  const [forecastActual, setForecastActual] = useState<Array<{ value: number; label?: string }>>([]);
  const [forecastProjected, setForecastProjected] = useState<Array<{ value: number; label?: string }>>([]);
  const [projectedTotal, setProjectedTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const startedAt = Date.now();
    try {
      const grps = await getAllGroups(db);
      setGroups(grps);

      const fromMs = startOfMonth(month).getTime();
      const toMs = endOfMonth(month).getTime();

      const sums: GroupSummary[] = [];
      const anMap: Record<string, BudgetAnalytics> = {};
      for (const g of grps) {
        const txns = await getTransactionsInRange(db, g.id, fromMs, toMs);
        sums.push(buildSummary(g, txns));
        anMap[g.id] = await getBudgetAnalytics(db, g, month);
      }
      setSummaries(sums);
      setAnalyticsByGroup(anMap);

      const yFrom = startOfYear(month).getTime();
      const yTo = endOfYear(month).getTime();
      const yearTxns = await getTransactionsInRange(db, null, yFrom, yTo);

      let yIncome = 0;
      let yExpense = 0;
      let biggest = 0;
      const yCatMap: Record<string, number> = {};

      for (const t of yearTxns) {
        if (t.kind === 'income') {
          yIncome += t.payments.reduce((s, p) => s + p.amount, 0);
        } else if (t.kind === 'expense') {
          const amt = t.shares.reduce((s, sh) => s + sh.amount, 0);
          yExpense += amt;
          yCatMap[t.category] = (yCatMap[t.category] ?? 0) + amt;
          if (amt > biggest) biggest = amt;
        }
      }

      setYearIncome(yIncome);
      setYearExpense(yExpense);
      setBiggestTxn(biggest);
      const topCat = Object.entries(yCatMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
      setYearTopCat(topCat);

      // Build spending-by-category pie chart data for the selected month
      const monthCatMap: Record<string, number> = {};
      for (const s of sums) {
        for (const c of s.topCats) {
          monthCatMap[c.name] = (monthCatMap[c.name] ?? 0) + c.amount;
        }
      }
      // Add all categories from all groups (not just top 3)
      const fromMs2 = startOfMonth(month).getTime();
      const toMs2 = endOfMonth(month).getTime();
      const allMonthTxns = await getTransactionsInRange(db, null, fromMs2, toMs2);
      const fullCatMap: Record<string, number> = {};
      for (const t of allMonthTxns) {
        if (t.kind === 'expense' && !t.is_deleted) {
          const amt = t.shares.reduce((s2, sh) => s2 + sh.amount, 0);
          fullCatMap[t.category] = (fullCatMap[t.category] ?? 0) + amt;
        }
      }
      const CHART_COLORS = ['#20C4B8', '#FF6F61', '#8B7CF8', '#2BD49B', '#F5B301', '#60A5FA', '#FB923C', '#F472B6', '#A78BFA', '#8FA3A0'];
      const sortedCats = Object.entries(fullCatMap).sort((a, b) => b[1] - a[1]);
      setPieData(sortedCats.slice(0, 8).map(([name, val], i) => ({
        value: val,
        color: categoryVisual(name).color || CHART_COLORS[i % CHART_COLORS.length],
        text: name,
      })));

      // Build 6-month spending trend bar chart
      const trendBars: Array<{ value: number; label: string; frontColor: string }> = [];
      for (let i = 5; i >= 0; i--) {
        const m = subMonths(month, i);
        const mFrom = startOfMonth(m).getTime();
        const mTo = endOfMonth(m).getTime();
        const mTxns = await getTransactionsInRange(db, null, mFrom, mTo);
        let mSpend = 0;
        for (const t of mTxns) {
          if (t.kind === 'expense' && !t.is_deleted) {
            mSpend += t.shares.reduce((s2, sh) => s2 + sh.amount, 0);
          }
        }
        trendBars.push({
          value: Math.round(mSpend / 100),
          label: format(m, 'MMM'),
          frontColor: i === 0 ? colors.accent : colors.accentDeep,
        });
      }
      setTrendData(trendBars);

      // Build daily cumulative spending forecast (current month only)
      const now = new Date();
      const monthStart = startOfMonth(month);
      const daysInMonth = getDaysInMonth(month);
      const dayOfMonth = getDate(now);
      const isCurrentMonth = format(month, 'yyyy-MM') === format(now, 'yyyy-MM');

      if (isCurrentMonth) {
        // Compute daily cumulative spending for each day up to today
        const dailyCumulative: Array<{ value: number; label?: string }> = [];
        let runningTotal = 0;
        const allMonthExpenses = (await getTransactionsInRange(db, null, monthStart.getTime(), endOfMonth(month).getTime()))
          .filter(t => t.kind === 'expense' && !t.is_deleted);

        for (let d = 1; d <= dayOfMonth; d++) {
          const dayStart = addDays(monthStart, d - 1).getTime();
          const dayEnd = addDays(monthStart, d).getTime() - 1;
          const daySpend = allMonthExpenses
            .filter(t => t.date >= dayStart && t.date <= dayEnd)
            .reduce((s, t) => s + t.shares.reduce((x, sh) => x + sh.amount, 0), 0);
          runningTotal += daySpend;
          dailyCumulative.push({ value: Math.round(runningTotal / 100), label: d % 5 === 1 ? `${d}` : '' });
        }
        setForecastActual(dailyCumulative);

        // Linear projection for remaining days
        const dailyRate = runningTotal / Math.max(1, dayOfMonth);
        const projectedLine: Array<{ value: number; label?: string }> = [];
        // Start projected line from the last actual point
        projectedLine.push({ value: Math.round(runningTotal / 100), label: '' });
        for (let d = dayOfMonth + 1; d <= daysInMonth; d++) {
          const projected = runningTotal + dailyRate * (d - dayOfMonth);
          projectedLine.push({ value: Math.round(projected / 100), label: d % 5 === 1 ? `${d}` : '' });
        }
        setForecastProjected(projectedLine);
        setProjectedTotal(Math.round((runningTotal + dailyRate * (daysInMonth - dayOfMonth)) / 100));
      } else {
        setForecastActual([]);
        setForecastProjected([]);
        setProjectedTotal(0);
      }
    } finally {
      // Keep the skeleton visible for a minimum of 450ms so it doesn't flash.
      const elapsed = Date.now() - startedAt;
      if (elapsed < 450) await new Promise(r => setTimeout(r, 450 - elapsed));
      setLoading(false);
    }
  }, [db, month]);

  useEffect(() => { load(); }, [load]);

  async function exportCSV() {
    setExporting(true);
    try {
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

      const csv = lines.join('\n');
      const fileName = `budgetsplit_${format(month, 'yyyy-MM')}.csv`;
      const file = new File(Paths.cache, fileName);
      file.create({ overwrite: true });
      file.write(csv);
      await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Export CSV' });
    } catch {
      Alert.alert('Export failed', 'Could not export CSV.');
    } finally {
      setExporting(false);
    }
  }

  async function exportPDF() {
    setPdfExporting(true);
    try {
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const monthLabel = format(month, 'MMMM yyyy');

      let body = '';
      for (const s of summaries) {
        const fromMs = startOfMonth(month).getTime();
        const toMs = endOfMonth(month).getTime();
        const txns = await getTransactionsInRange(db, s.group.id, fromMs, toMs);
        if (txns.length === 0) continue;

        const rows = txns
          .sort((a, b) => b.date - a.date)
          .map(t => {
            const amt = t.kind === 'income'
              ? t.payments.reduce((x, p) => x + p.amount, 0)
              : t.shares.reduce((x, sh) => x + sh.amount, 0);
            const color = t.kind === 'income' ? '#2BD49B' : '#FF6F61';
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

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          body { font-family: -apple-system, 'Inter', Helvetica, sans-serif; background: #0A0F11; color: #ECF3F1; padding: 40px 36px; margin: 0; }
          h1 { font-size: 26px; margin: 0; color: #FFFFFF; font-weight: 700; letter-spacing: -0.5px; }
          .sub { color: #20C4B8; font-size: 14px; margin: 4px 0 32px; font-weight: 500; }
          h2 { font-size: 16px; margin: 36px 0 12px; padding-bottom: 8px; border-bottom: 1px solid #1E2A2E; color: #FFFFFF; font-weight: 600; }
          .totals { display: flex; gap: 12px; margin-bottom: 16px; }
          .total-card { flex: 1; background: #131A1D; border: 1px solid #1E2A2E; border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }
          .total-card.income { border-left: 3px solid #2BD49B; }
          .total-card.expense { border-left: 3px solid #FF6F61; }
          .total-card.net { border-left: 3px solid #20C4B8; }
          .total-label { font-size: 11px; color: #7A8F8C; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500; }
          .total-value { font-size: 16px; font-weight: 700; color: #ECF3F1; font-family: 'SF Mono', monospace; }
          table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; background: #131A1D; border-radius: 10px; overflow: hidden; border: 1px solid #1E2A2E; }
          th { text-align: left; color: #7A8F8C; font-weight: 600; padding: 10px 12px; background: #0E1517; border-bottom: 1px solid #1E2A2E; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; }
          td { padding: 10px 12px; border-bottom: 1px solid #1A2326; color: #ECF3F1; }
          td.note { color: #7A8F8C; }
          tr:last-child td { border-bottom: none; }
          tr:hover { background: #1A2326; }
          .empty { color: #7A8F8C; text-align: center; padding: 40px; }
          .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #4A5E5B; border-top: 1px solid #1E2A2E; padding-top: 16px; }
        </style></head>
        <body>
          <h1>BudgetSplit Report</h1>
          <div class="sub">${monthLabel}</div>
          ${body}
          <div class="footer">Generated by BudgetSplit &middot; ${format(new Date(), 'dd MMM yyyy')}</div>
        </body></html>`;

      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Export PDF' });
    } catch {
      Alert.alert('Export failed', 'Could not export PDF.');
    } finally {
      setPdfExporting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Text style={styles.title}>Reports</Text>
        <View style={styles.exportRow}>
          <TouchableOpacity
            style={styles.exportBtn}
            onPress={exportCSV}
            disabled={exporting}
            accessibilityRole="button"
            accessibilityLabel="Export CSV"
          >
            {exporting ? (
              <ActivityIndicator size="small" color={colors.bg} />
            ) : (
              <View style={styles.exportBtnInner}>
                <Feather name="download" size={13} color={colors.bg} />
                <Text style={styles.exportBtnText}>CSV</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.exportBtn, styles.exportBtnAlt]}
            onPress={exportPDF}
            disabled={pdfExporting}
            accessibilityRole="button"
            accessibilityLabel="Export PDF"
          >
            {pdfExporting ? (
              <ActivityIndicator size="small" color={colors.textPrimary} />
            ) : (
              <View style={styles.exportBtnInner}>
                <Feather name="file-text" size={13} color={colors.textPrimary} />
                <Text style={[styles.exportBtnText, { color: colors.textPrimary }]}>PDF</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.monthNav}>
        <TouchableOpacity
          onPress={() => setMonth(m => subMonths(m, 1))}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          style={styles.navBtn}
        >
          <Feather name="chevron-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{format(month, 'MMMM yyyy')}</Text>
        <TouchableOpacity
          onPress={() => setMonth(m => addMonths(m, 1))}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          style={styles.navBtn}
        >
          <Feather name="chevron-right" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ gap: space.md, marginTop: space.xs }}>
          <SkeletonCard height={120} />
          <SkeletonCard height={120} />
          <SkeletonCard height={150} />
        </View>
      ) : (
        <>
          {/* Spending by Category chart */}
          {pieData.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.chartTitle}>Spending by category</Text>
              <View style={styles.pieRow}>
                <PieChart
                  data={pieData}
                  donut
                  radius={65}
                  innerRadius={42}
                  innerCircleColor={colors.bgCard}
                  focusOnPress
                  centerLabelComponent={() => (
                    <View style={{ alignItems: 'center' }}>
                      <Text style={styles.pieCenterNum}>{pieData.length}</Text>
                      <Text style={styles.pieCenterLabel}>{pieData.length === 1 ? 'category' : 'categories'}</Text>
                    </View>
                  )}
                />
                <View style={styles.legend}>
                  {(() => {
                    const total = pieData.reduce((s, d) => s + d.value, 0) || 1;
                    return pieData.slice(0, 5).map((d, i) => (
                      <View key={i} style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: d.color }]} />
                        <Text style={styles.legendText} numberOfLines={1}>{d.text}</Text>
                        <Text style={styles.legendPct}>{Math.round((d.value / total) * 100)}%</Text>
                        <Text style={styles.legendAmt}>{formatRupeesShort(d.value)}</Text>
                      </View>
                    ));
                  })()}
                </View>
              </View>
            </View>
          )}

          {/* 6-month Spending Trend */}
          {trendData.length > 0 && trendData.some(b => b.value > 0) && (
            <View style={styles.card}>
              <Text style={styles.chartTitle}>6-month spending trend</Text>
              <BarChart
                data={trendData}
                barWidth={28}
                barBorderRadius={4}
                noOfSections={4}
                spacing={20}
                xAxisThickness={0}
                yAxisThickness={0}
                yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
                yAxisLabelPrefix="₹"
                xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 10 }}
                hideRules
                isAnimated
                disableScroll
              />
            </View>
          )}

          {/* Spending Forecast (current month only) */}
          {forecastActual.length > 2 && (
            <View style={styles.card}>
              <View style={styles.forecastHeader}>
                <Text style={styles.chartTitle}>Month-end forecast</Text>
                <View style={styles.forecastBadge}>
                  <Feather name="trending-up" size={12} color={colors.accent} />
                  <Text style={styles.forecastBadgeText}>₹{projectedTotal.toLocaleString('en-IN')}</Text>
                </View>
              </View>
              <Text style={styles.forecastSub}>Projected total spending based on your pace so far</Text>
              <LineChart
                data={forecastActual}
                data2={forecastProjected}
                color1={colors.expense}
                color2={colors.accent}
                dataPointsColor1={colors.expense}
                dataPointsColor2={colors.accent}
                thickness={2}
                thickness2={2}
                dashWidth={6}
                dashGap={4}
                startFillColor1={colors.expense + '22'}
                endFillColor1={colors.expense + '05'}
                areaChart
                noOfSections={4}
                spacing={Math.max(8, 260 / Math.max(forecastActual.length + forecastProjected.length, 1))}
                xAxisThickness={0}
                yAxisThickness={0}
                yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
                yAxisLabelPrefix="₹"
                xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 9 }}
                hideRules
                hideDataPoints
                curved
                isAnimated
                disableScroll
              />
              <View style={styles.forecastLegend}>
                <View style={styles.forecastLegendItem}>
                  <View style={[styles.forecastLegendLine, { backgroundColor: colors.expense }]} />
                  <Text style={styles.forecastLegendText}>Actual</Text>
                </View>
                <View style={styles.forecastLegendItem}>
                  <View style={[styles.forecastLegendLine, { backgroundColor: colors.accent, borderStyle: 'dashed' as any }]} />
                  <Text style={styles.forecastLegendText}>Projected</Text>
                </View>
              </View>
            </View>
          )}

          {summaries.length === 0 && (
            <EmptyState
              icon="bar-chart-2"
              title="Nothing to report yet"
              body="Add some transactions and your monthly income, spending and category breakdowns will appear here."
            />
          )}

          {summaries.map(s => (
            <View key={s.group.id} style={styles.card}>
              <Text style={styles.groupName}>{s.group.name}</Text>

              <View style={styles.metricRow}>
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>Income</Text>
                  <AmountText paise={s.income} size="sm" forceColor={colors.income} rounded />
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>Expense</Text>
                  <AmountText paise={s.expense} size="sm" forceColor={colors.expense} rounded />
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>Net</Text>
                  <AmountText paise={s.income - s.expense} size="sm" rounded />
                </View>
              </View>

              {s.topCats.length > 0 && (
                <>
                  <View style={styles.sep} />
                  <Text style={styles.catTitle}>Top categories</Text>
                  {s.topCats.map(c => (
                    <View key={c.name} style={styles.catRow}>
                      <Text style={styles.catName}>{c.name}</Text>
                      <Text style={styles.catAmt}>{formatRupeesShort(c.amount)}</Text>
                    </View>
                  ))}
                </>
              )}

              {(() => {
                const an = analyticsByGroup[s.group.id];
                if (!an || an.totalAllocated === 0) return null;
                return (
                  <>
                    <View style={styles.sep} />
                    <View style={styles.utilRow}>
                      <Text style={styles.catTitle}>Budget used</Text>
                      <Text style={styles.utilPct}>{an.utilizationPct ?? 0}%</Text>
                    </View>
                    <BudgetBar
                      pct={an.utilizationPct}
                      health={an.utilizationPct === null ? 'none' : an.utilizationPct >= 100 ? 'red' : an.utilizationPct >= 80 ? 'amber' : 'green'}
                      height={6}
                    />
                    {an.recommendations.slice(0, 3).map(r => (
                      <View key={r.id} style={styles.recRow}>
                        <Feather
                          name={r.icon}
                          size={13}
                          color={r.severity === 'warn' ? colors.expense : r.severity === 'good' ? colors.income : colors.textSecondary}
                        />
                        <Text style={styles.recRowText}>{r.text}</Text>
                      </View>
                    ))}
                  </>
                );
              })()}

              {s.income === 0 && s.expense === 0 && (
                <Text style={styles.emptyGroup}>No transactions this month</Text>
              )}
            </View>
          ))}

          <Text style={styles.sectionTitle}>{format(month, 'yyyy')} Year in Review</Text>
          <View style={styles.card}>
            <View style={styles.metricRow}>
              <View style={styles.metric}>
                <Text style={styles.metricLabel}>Income</Text>
                <AmountText paise={yearIncome} size="sm" forceColor={colors.income} rounded />
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metric}>
                <Text style={styles.metricLabel}>Spent</Text>
                <AmountText paise={yearExpense} size="sm" forceColor={colors.expense} rounded />
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metric}>
                <Text style={styles.metricLabel}>Saved</Text>
                <AmountText paise={yearIncome - yearExpense} size="sm" rounded />
              </View>
            </View>

            <View style={styles.sep} />

            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Top category</Text>
              <Text style={styles.reviewValue}>{yearTopCat}</Text>
            </View>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Biggest expense</Text>
              <Text style={[styles.reviewValue, { fontFamily: 'SpaceMono_400Regular' }]}>
                {formatRupeesShort(biggestTxn)}
              </Text>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, paddingBottom: space.xl, gap: space.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: space.sm },
  title: { ...type.heading, color: colors.textPrimary },
  exportRow: { flexDirection: 'row', gap: space.xs },
  exportBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, minWidth: 56, alignItems: 'center', justifyContent: 'center', height: 36 },
  exportBtnAlt: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  exportBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  exportBtnText: { ...type.label, color: colors.bg, fontFamily: 'Inter_600SemiBold' },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bgCard, borderRadius: radius.md, padding: space.sm, borderWidth: 1, borderColor: colors.border },
  navBtn: { padding: space.xs },
  monthLabel: { ...type.subheading, color: colors.textPrimary },
  sectionTitle: { ...type.label, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: space.sm },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm },
  chartTitle: { ...type.label, color: colors.textSecondary, marginBottom: space.sm },
  pieRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  pieCenterNum: { fontFamily: 'Inter_600SemiBold', fontSize: 20, color: colors.textPrimary },
  pieCenterLabel: { ...type.caption, color: colors.textMuted },
  legend: { flex: 1, gap: space.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { ...type.caption, color: colors.textSecondary, flex: 1 },
  legendPct: { ...type.caption, color: colors.textMuted, width: 30, textAlign: 'right' },
  legendAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 11, color: colors.textPrimary, width: 60, textAlign: 'right' },
  groupName: { ...type.subheading, color: colors.textPrimary },
  metricRow: { flexDirection: 'row', alignItems: 'center' },
  metric: { flex: 1, alignItems: 'center', gap: 2 },
  metricDivider: { width: 1, height: 32, backgroundColor: colors.border },
  metricLabel: { ...type.caption, color: colors.textSecondary },
  sep: { height: 1, backgroundColor: colors.border, marginVertical: space.xs },
  catTitle: { ...type.caption, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 },
  catRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  catName: { ...type.body, color: colors.textPrimary },
  catAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 13, color: colors.expense },
  emptyGroup: { ...type.caption, color: colors.textMuted, textAlign: 'center', paddingVertical: space.sm },
  utilRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.xs },
  utilPct: { fontFamily: 'SpaceMono_400Regular', fontSize: 13, color: colors.textPrimary },
  recRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs, marginTop: space.sm },
  recRowText: { ...type.caption, color: colors.textSecondary, flex: 1, lineHeight: 16 },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  reviewLabel: { ...type.body, color: colors.textSecondary },
  reviewValue: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  forecastHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  forecastBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accentMuted, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 4 },
  forecastBadgeText: { fontFamily: 'SpaceMono_400Regular', fontSize: 12, color: colors.accent },
  forecastSub: { ...type.caption, color: colors.textMuted, marginBottom: space.sm },
  forecastLegend: { flexDirection: 'row', gap: space.lg, marginTop: space.sm },
  forecastLegendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  forecastLegendLine: { width: 16, height: 3, borderRadius: 2 },
  forecastLegendText: { ...type.caption, color: colors.textMuted },
});
