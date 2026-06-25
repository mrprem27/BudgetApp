import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import {
  startOfMonth, endOfMonth, addMonths, subMonths, format,
  startOfYear, endOfYear, getDate, getDaysInMonth, addDays,
} from 'date-fns';
import { Feather } from '@expo/vector-icons';
import { BarChart, LineChart } from 'react-native-gifted-charts';
import { CategoryDonut, type DonutSeg } from '../src/components/finance/CategoryDonut';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, radius, layout } from '../src/constants/layout';
import { getAllGroups } from '../src/db/queries/groups';
import { getTransactionsInRange } from '../src/db/queries/transactions';
import { getBudgetAnalytics } from '../src/lib/analytics';
import type { BudgetAnalytics } from '../src/lib/analytics';
import { utilLabel, budgetHealth } from '../src/lib/budget';
import { forecastMonthEnd, projectedAtDay, FORECAST_MIN_DAYS } from '../src/lib/forecast';
import { formatCompact, formatCompactMajor } from '../src/lib/money';
import { buildReportCsv, buildReportHtml } from '../src/lib/reportExport';
import { Badge } from '../src/components/ui/Badge';
import { useFeatureFlags } from '../src/components/system/FeatureFlagsProvider';
import { AmountText } from '../src/components/ui/AmountText';
import { BudgetBar } from '../src/components/finance/BudgetBar';
import { SkeletonCard } from '../src/components/ui/Skeleton';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ErrorState } from '../src/components/ui/ErrorState';
import { categoryVisual } from '../src/constants/categories';
import { CHART_COLORS } from '../src/constants/palette';
import type { BudgetGroup } from '../src/db/queries/groups';
import type { TxnWithSplits } from '../src/db/queries/transactions';

/** Y-axis label: always whole numbers, no decimal K/L/Cr values. */
function fmtY(v: string): string {
  const n = Math.round(Number(v));
  if (!isFinite(n)) return '₹0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs < 1000) return sign + '₹' + abs;
  if (abs < 100000) return sign + '₹' + Math.round(abs / 1000) + 'K';
  if (abs < 10000000) return sign + '₹' + Math.round(abs / 100000) + 'L';
  return sign + '₹' + Math.round(abs / 10000000) + 'Cr';
}

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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { flags } = useFeatureFlags();
  const [month, setMonth] = useState(() => new Date());
  const [groups, setGroups] = useState<BudgetGroup[]>([]);
  const [summaries, setSummaries] = useState<GroupSummary[]>([]);
  const [analyticsByGroup, setAnalyticsByGroup] = useState<Record<string, BudgetAnalytics>>({});
  const [yearIncome, setYearIncome] = useState(0);
  const [yearExpense, setYearExpense] = useState(0);
  const [yearTopCat, setYearTopCat] = useState('—');
  const [biggestTxn, setBiggestTxn] = useState(0);
  const [monthSpent, setMonthSpent] = useState(0);
  const [monthEarned, setMonthEarned] = useState(0);
  const [prevSpent, setPrevSpent] = useState(0);
  const [prevEarned, setPrevEarned] = useState(0);
  const [pieData, setPieData] = useState<DonutSeg[]>([]);
  const [pieTotal, setPieTotal] = useState(0);
  type TrendBar = { value: number; label: string; frontColor: string; labelTextStyle?: object };
  const [trendData, setTrendData] = useState<TrendBar[]>([]);
  const [monthlyData, setMonthlyData] = useState<Array<{ label: string; total: number; byCat: Record<string, number> }>>([]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  type LinePoint = { value: number; label?: string; hideDataPoint?: boolean; dataPointColor?: string; dataPointRadius?: number };
  const [forecastActual, setForecastActual] = useState<LinePoint[]>([]);
  const [forecastProjected, setForecastProjected] = useState<LinePoint[]>([]);
  const [projectedTotal, setProjectedTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const startedAt = Date.now();
    try {
      setLoadError(false);
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
        if (t.kind === 'expense') { // getTransactionsInRange already excludes soft-deleted
          const amt = t.shares.reduce((s2, sh) => s2 + sh.amount, 0);
          fullCatMap[t.category] = (fullCatMap[t.category] ?? 0) + amt;
        }
      }
      // Month totals (Spent/Earned) + prior month, for the summary cards.
      let mSpent = 0, mEarned = 0;
      for (const t of allMonthTxns) {
        if (t.kind === 'expense') mSpent += t.shares.reduce((s2, sh) => s2 + sh.amount, 0);
        else if (t.kind === 'income') mEarned += t.payments.reduce((s2, p) => s2 + p.amount, 0);
      }
      setMonthSpent(mSpent);
      setMonthEarned(mEarned);
      const pStart = startOfMonth(subMonths(month, 1)).getTime();
      const pEnd = endOfMonth(subMonths(month, 1)).getTime();
      const pTxns = await getTransactionsInRange(db, null, pStart, pEnd);
      let pSpent = 0, pEarned = 0;
      for (const t of pTxns) {
        if (t.kind === 'expense') pSpent += t.shares.reduce((s2, sh) => s2 + sh.amount, 0);
        else if (t.kind === 'income') pEarned += t.payments.reduce((s2, p) => s2 + p.amount, 0);
      }
      setPrevSpent(pSpent);
      setPrevEarned(pEarned);

      const sortedCats = Object.entries(fullCatMap).sort((a, b) => b[1] - a[1]);
      setPieData(sortedCats.slice(0, 8).map(([name, val], i) => ({
        name,
        paise: val,
        color: categoryVisual(name).color || CHART_COLORS[i % CHART_COLORS.length],
      })));
      setPieTotal(sortedCats.reduce((s, [, v]) => s + v, 0));

      // Build 6-month spending trend — overall totals + a per-category breakdown
      // so tapping a donut wedge can re-draw the same chart for that category.
      const months: Array<{ label: string; total: number; byCat: Record<string, number> }> = [];
      for (let i = 5; i >= 0; i--) {
        const m = subMonths(month, i);
        const mFrom = startOfMonth(m).getTime();
        const mTo = endOfMonth(m).getTime();
        const mTxns = await getTransactionsInRange(db, null, mFrom, mTo);
        let mSpend = 0;
        const byCat: Record<string, number> = {};
        for (const t of mTxns) {
          if (t.kind === 'expense') { // getTransactionsInRange already excludes soft-deleted
            const amt = t.shares.reduce((s2, sh) => s2 + sh.amount, 0);
            mSpend += amt;
            byCat[t.category] = (byCat[t.category] ?? 0) + amt;
          }
        }
        months.push({ label: format(m, 'MMM'), total: mSpend, byCat });
      }
      setMonthlyData(months);
      setSelectedCat(null);
      setTrendData(months.map((mm, i) => ({
        value: Math.round(mm.total / 100),
        label: mm.label,
        frontColor: i === months.length - 1 ? colors.accent : colors.accentDeep,
        labelTextStyle: i === months.length - 1 ? { color: colors.accent, fontFamily: 'Inter_600SemiBold' } : { color: colors.textMuted },
      })));

      // Build daily cumulative spending forecast (current month only)
      const now = new Date();
      const monthStart = startOfMonth(month);
      const daysInMonth = getDaysInMonth(month);
      const dayOfMonth = getDate(now);
      const isCurrentMonth = format(month, 'yyyy-MM') === format(now, 'yyyy-MM');

      // Forecast needs a few days of signal — see forecast.ts (FORECAST_MIN_DAYS).
      if (isCurrentMonth && dayOfMonth >= FORECAST_MIN_DAYS) {
        // Daily cumulative spending up to today (the "actual" line).
        const dailyCumulative: Array<{ value: number; label?: string }> = [];
        let runningTotal = 0;
        const allMonthExpenses = (await getTransactionsInRange(db, null, monthStart.getTime(), endOfMonth(month).getTime()))
          .filter(t => t.kind === 'expense'); // soft-deleted already excluded by the query

        for (let d = 1; d <= dayOfMonth; d++) {
          const dayStart = addDays(monthStart, d - 1).getTime();
          const dayEnd = addDays(monthStart, d).getTime() - 1;
          const daySpend = allMonthExpenses
            .filter(t => t.date >= dayStart && t.date <= dayEnd)
            .reduce((s, t) => s + t.shares.reduce((x, sh) => x + sh.amount, 0), 0);
          runningTotal += daySpend;
          dailyCumulative.push({ value: Math.round(runningTotal / 100), label: d % 2 === 1 ? `${d}` : '' });
        }

        // Prior-month actual total anchors the projection so an early spike doesn't
        // explode the forecast (blended model — see forecast.ts).
        const prevStart = startOfMonth(subMonths(month, 1)).getTime();
        const prevEnd = endOfMonth(subMonths(month, 1)).getTime();
        const priorMonthTotal = (await getTransactionsInRange(db, null, prevStart, prevEnd))
          .filter(t => t.kind === 'expense')
          .reduce((s, t) => s + t.shares.reduce((x, sh) => x + sh.amount, 0), 0);

        const fc = forecastMonthEnd(runningTotal, dayOfMonth, daysInMonth, priorMonthTotal);
        if (fc.ready) {
          // X-axis: every odd day (1, 3, 5, … 31) so all alternate days are visible.
          const labelForDay = (d: number) => (d % 2 === 1) ? `${d}` : '';

          // The PROJECTED line spans the full month (days 1..month-end) and is the
          // chart's primary series, so it owns the x-axis labels — that's what
          // makes the axis run the complete month. Days 1..today trace the real
          // cumulative spend; today..month-end is the forecast.
          const projectedLine = Array.from({ length: daysInMonth }, (_, i) => {
            const d = i + 1;
            const value = d <= dayOfMonth
              ? dailyCumulative[d - 1].value
              : Math.round(projectedAtDay(runningTotal, dayOfMonth, daysInMonth, fc.projected, d) / 100);
            return { value, label: labelForDay(d), hideDataPoint: true };
          });

          // The ACTUAL line (days 1..today) is overlaid solid on top, marking
          // "today". Labels live on the projected series, so this carries none.
          const actualLine = dailyCumulative.map((p, i) => ({
            value: p.value,
            label: '',
            hideDataPoint: i !== dayOfMonth - 1, // only mark "today"
            dataPointColor: colors.expense,
            dataPointRadius: 5,
          }));

          setForecastActual(actualLine);
          setForecastProjected(projectedLine);
          setProjectedTotal(Math.round(fc.projected / 100));
        } else {
          setForecastActual([]);
          setForecastProjected([]);
          setProjectedTotal(0);
        }
      } else {
        setForecastActual([]);
        setForecastProjected([]);
        setProjectedTotal(0);
      }
    } catch {
      setLoadError(true);
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
      const csv = await buildReportCsv(db, groups, month);
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
      const html = await buildReportHtml(db, summaries, month);
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Export PDF' });
    } catch {
      Alert.alert('Export failed', 'Could not export PDF.');
    } finally {
      setPdfExporting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + space.lg }]}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={{ marginRight: space.xs, marginLeft: -6 }}>
          <Feather name="chevron-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { flex: 1 }]}>Reports</Text>
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
      ) : loadError ? (
        <ErrorState onRetry={() => { setLoadError(false); load(); }} />
      ) : (
        <>
          {/* Summary totals — Spent / Earned with vs-last-month deltas (design Screen 7) */}
          {(() => {
            const prevLabel = format(subMonths(month, 1), 'MMM');
            const delta = (cur: number, prev: number): { text: string; color: string; dir: 'up' | 'down' | 'flat' } => {
              if (prev <= 0) return { text: 'new', color: colors.textMuted, dir: 'flat' };
              const pct = Math.round(((cur - prev) / prev) * 100);
              if (Math.abs(pct) < 2) return { text: `same as ${prevLabel}`, color: colors.textMuted, dir: 'flat' };
              return { text: `${pct > 0 ? '+' : ''}${pct}% vs ${prevLabel}`, color: pct > 0 ? colors.expense : colors.income, dir: pct > 0 ? 'up' : 'down' };
            };
            const earnedDelta = (cur: number, prev: number): { text: string; color: string; dir: 'up' | 'down' | 'flat' } => {
              if (prev <= 0) return { text: 'new', color: colors.textMuted, dir: 'flat' };
              const pct = Math.round(((cur - prev) / prev) * 100);
              if (Math.abs(pct) < 2) return { text: `same as ${prevLabel}`, color: colors.income, dir: 'flat' };
              return { text: `${pct > 0 ? '+' : ''}${pct}% vs ${prevLabel}`, color: pct > 0 ? colors.income : colors.expense, dir: pct > 0 ? 'up' : 'down' };
            };
            const ds = delta(monthSpent, prevSpent);
            const de = earnedDelta(monthEarned, prevEarned);
            return (
              <View style={styles.summaryRow}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>SPENT</Text>
                  <Text style={styles.summaryValue}>{formatCompact(monthSpent)}</Text>
                  <View style={styles.summaryDeltaRow}>
                    {ds.dir !== 'flat' && <Feather name={ds.dir === 'up' ? 'arrow-up' : 'arrow-down'} size={10} color={ds.color} />}
                    <Text style={[styles.summaryDelta, { color: ds.color }]}>{ds.text}</Text>
                  </View>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>EARNED</Text>
                  <Text style={[styles.summaryValue, { color: colors.income }]}>{formatCompact(monthEarned)}</Text>
                  <View style={styles.summaryDeltaRow}>
                    {de.dir !== 'flat' && <Feather name={de.dir === 'up' ? 'arrow-up' : 'arrow-down'} size={10} color={de.color} />}
                    <Text style={[styles.summaryDelta, { color: de.color }]}>{de.text}</Text>
                  </View>
                </View>
              </View>
            );
          })()}

          {/* By category — stacked proportional bar + legend with % (design Screen 7) */}
          {pieData.length > 0 && pieTotal > 0 && (
            <View style={styles.card}>
              <Text style={styles.sectionTitleSm}>BY CATEGORY</Text>
              <View style={styles.stackBar}>
                {pieData.map((seg, i) => (
                  <View key={seg.name} style={{ flex: seg.paise, backgroundColor: seg.color, height: '100%' }} />
                ))}
              </View>
              <View style={{ gap: 9 }}>
                {pieData.slice(0, 5).map(seg => (
                  <View key={seg.name} style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: seg.color }]} />
                    <Text style={styles.legendName} numberOfLines={1}>{seg.name}</Text>
                    <Text style={styles.legendAmt}>{formatCompact(seg.paise)}</Text>
                    <Text style={styles.legendPct}>{Math.round((seg.paise / pieTotal) * 100)}%</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Spending by category — selected month, ALL groups (the dashboard
              donut is current-period & personal; this is the cross-group analysis). */}
          {flags.reportsDonut && pieData.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.chartTitle}>Spending by category</Text>
              <Text style={styles.chartSub}>{format(month, 'MMMM yyyy')} · all groups</Text>
              <CategoryDonut
                data={pieData}
                total={pieTotal}
                onSelect={(seg) => setSelectedCat(seg?.name ?? null)}
                onOpen={(seg) => router.push(`/category/${encodeURIComponent(seg.name)}` as any)}
              />
              {selectedCat && <Text style={styles.donutHint}>Tap the wedge again to clear · trend below shows {selectedCat}</Text>}
            </View>
          )}

          {/* 6-month Spending Trend — overall, or the tapped category */}
          {flags.reportsTrend && trendData.length > 0 && trendData.some(b => b.value > 0) && (() => {
            const bars: TrendBar[] = selectedCat
              ? monthlyData.map((mm, i) => ({
                  value: Math.round((mm.byCat[selectedCat] ?? 0) / 100),
                  label: mm.label,
                  frontColor: i === monthlyData.length - 1 ? colors.accent : colors.accentDeep,
                  labelTextStyle: i === monthlyData.length - 1 ? { color: colors.accent, fontFamily: 'Inter_600SemiBold' } : { color: colors.textMuted },
                }))
              : trendData;
            return (
            <View style={styles.card}>
              <View style={styles.trendHeader}>
                <Text style={styles.chartTitle}>{selectedCat ? `${selectedCat} · 6 months` : '6-month spending trend'}</Text>
                {selectedCat && (
                  <TouchableOpacity onPress={() => setSelectedCat(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Show all categories">
                    <Text style={styles.trendClear}>Show all</Text>
                  </TouchableOpacity>
                )}
              </View>
              <BarChart
                data={bars}
                barWidth={28}
                barBorderRadius={4}
                noOfSections={4}
                spacing={20}
                xAxisThickness={0}
                yAxisThickness={0}
                yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
                formatYLabel={fmtY}
                xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 10 }}
                hideRules
                isAnimated
                disableScroll
              />
            </View>
            );
          })()}

          {/* Spending Forecast (current month only) */}
          {flags.forecast && forecastActual.length >= 2 && forecastProjected.length >= 1 && (
            <View style={styles.card}>
              <View style={styles.forecastHeader}>
                <Text style={styles.chartTitle}>Month-end forecast</Text>
                <Badge label={formatCompactMajor(projectedTotal)} tone="accent" icon="trending-up" />
              </View>
              <Text style={styles.forecastSub}>Solid = spent so far · dashed = projected to month-end</Text>
              <LineChart
                data={forecastProjected}
                data2={forecastActual}
                color1={colors.accent}
                color2={colors.expense}
                thickness1={2}
                thickness2={2.5}
                strokeDashArray1={[5, 5]}
                noOfSections={4}
                maxValue={Math.ceil((Math.max(...forecastActual.map(d => d.value), ...forecastProjected.map(d => d.value), 1)) * 1.1)}
                spacing={Math.max(8, 300 / Math.max(forecastProjected.length, 1))}
                initialSpacing={8}
                endSpacing={8}
                xAxisThickness={0}
                yAxisThickness={0}
                yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
                formatYLabel={fmtY}
                xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 9 }}
                hideRules
                isAnimated
                disableScroll
                pointerConfig={{
                  pointerStripUptoDataPoint: true,
                  pointerStripColor: colors.textMuted + '60',
                  pointerStripWidth: 1,
                  pointerColor: colors.accent,
                  radius: 5,
                  pointerLabelWidth: 76,
                  pointerLabelHeight: 32,
                  activatePointersOnLongPress: false,
                  autoAdjustPointerLabelPosition: true,
                  pointerLabelComponent: (items: Array<{ value: number }>) => {
                    const val = items[0]?.value ?? 0;
                    return (
                      <View style={{ backgroundColor: colors.bgCard, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}>
                        <Text style={{ color: colors.textPrimary, fontFamily: 'SpaceMono_400Regular', fontSize: 11 }}>
                          {fmtY(String(val))}
                        </Text>
                      </View>
                    );
                  },
                }}
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
                  <AmountText paise={s.income} size="sm" forceColor={colors.income} compact />
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>Expense</Text>
                  <AmountText paise={s.expense} size="sm" forceColor={colors.expense} compact />
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>Net</Text>
                  <AmountText paise={s.income - s.expense} size="sm" compact />
                </View>
              </View>

              {s.topCats.length > 0 && (
                <>
                  <View style={styles.sep} />
                  <Text style={styles.catTitle}>Top categories</Text>
                  {s.topCats.map(c => (
                    <View key={c.name} style={styles.catRow}>
                      <Text style={styles.catName}>{c.name}</Text>
                      <Text style={styles.catAmt}>{formatCompact(c.amount)}</Text>
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
                      <Text style={[styles.utilPct, (an.utilizationPct ?? 0) > 100 && { color: colors.expense }]}>
                        {utilLabel(an.utilizationPct ?? 0)}
                      </Text>
                    </View>
                    <BudgetBar
                      pct={an.utilizationPct}
                      health={budgetHealth(an.utilizationPct)}
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
                <AmountText paise={yearIncome} size="sm" forceColor={colors.income} compact />
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metric}>
                <Text style={styles.metricLabel}>Spent</Text>
                <AmountText paise={yearExpense} size="sm" forceColor={colors.expense} compact />
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metric}>
                <Text style={styles.metricLabel}>Saved</Text>
                <AmountText paise={yearIncome - yearExpense} size="sm" compact />
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
                {formatCompact(biggestTxn)}
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
  sectionTitleSm: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Inter_600SemiBold', marginBottom: space.sm },
  summaryRow: { flexDirection: 'row', gap: space.sm },
  summaryCard: { flex: 1, backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.md },
  summaryLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Inter_600SemiBold', marginBottom: 6 },
  summaryValue: { fontFamily: 'SpaceMono_400Regular', fontSize: 22, color: colors.textPrimary, letterSpacing: -1, marginBottom: 3 },
  summaryDeltaRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  summaryDelta: { ...type.caption, fontFamily: 'Inter_600SemiBold' },
  stackBar: { height: 10, borderRadius: 5, overflow: 'hidden', flexDirection: 'row', marginBottom: space.md, backgroundColor: colors.bgElevated },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  legendDot: { width: 10, height: 10, borderRadius: 2, flexShrink: 0 },
  legendName: { flex: 1, ...type.label, color: colors.textPrimary },
  legendAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 12, color: colors.textSecondary },
  legendPct: { ...type.caption, color: colors.textMuted, width: 30, textAlign: 'right' },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm },
  chartTitle: { ...type.label, color: colors.textSecondary, marginBottom: space.sm },
  chartSub: { ...type.caption, color: colors.textMuted, marginTop: -space.sm + 2, marginBottom: space.md },
  donutHint: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.sm },
  trendHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
  trendClear: { ...type.caption, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  whatifLead: { ...type.body, color: colors.textSecondary },
  whatifChips: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  whatifChip: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: colors.bgMuted },
  whatifChipActive: { backgroundColor: colors.accent },
  whatifChipText: { ...type.label, color: colors.textSecondary },
  whatifResult: { marginTop: space.md },
  whatifSave: { ...type.subheading, color: colors.textPrimary },
  whatifYear: { ...type.caption, color: colors.textMuted, marginTop: 2 },
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
  forecastSub: { ...type.caption, color: colors.textMuted },
  forecastLegend: { flexDirection: 'row', gap: space.lg, marginTop: space.sm },
  forecastLegendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  forecastLegendLine: { width: 16, height: 3, borderRadius: 2 },
  forecastLegendText: { ...type.caption, color: colors.textMuted },
});
