import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { useScreenData } from '../src/hooks/useScreenData';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import {
  startOfMonth, endOfMonth, addMonths, subMonths, format,
  startOfYear, endOfYear,
} from 'date-fns';
import { Feather } from '@expo/vector-icons';
import { CategoryDonut, type DonutSeg } from '../src/components/finance/CategoryDonut';
import { CategoryRankList } from '../src/components/finance/home/CategoryRankList';
import { TrendBars } from '../src/components/finance/TrendBars';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, radius, layout } from '../src/constants/layout';
import { getAllGroups } from '../src/db/queries/groups';
import { getCategories } from '../src/db/queries/categories';
import { getTransactionsInRange } from '../src/db/queries/transactions';
import { foldUncategorized } from '../src/lib/categoryFold';
import { getBudgetAnalytics } from '../src/lib/analytics';
import type { BudgetAnalytics } from '../src/lib/analytics';
import { utilLabel, budgetHealth } from '../src/lib/budget';
import { formatCompact } from '../src/lib/money';
import { buildReportCsv, buildReportHtml } from '../src/lib/reportExport';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { AmountText } from '../src/components/ui/AmountText';
import { BudgetBar } from '../src/components/finance/BudgetBar';
import { SkeletonCard } from '../src/components/ui/Skeleton';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ErrorState } from '../src/components/ui/ErrorState';
import { categoryVisual } from '../src/constants/categories';
import { CHART_COLORS } from '../src/constants/palette';
import type { BudgetGroup } from '../src/db/queries/groups';
import type { TxnWithSplits } from '../src/db/queries/transactions';

type GroupSummary = {
  group: BudgetGroup;
  income: number;
  expense: number;
  topCats: Array<{ name: string; amount: number }>;
};

type MonthPoint = { label: string; total: number; byCat: Record<string, number> };

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
  const [month, setMonth] = useState(() => new Date());
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [catExpanded, setCatExpanded] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);

  // Re-run on focus (and when the month changes) via useScreenData so returning
  // after adding a transaction shows fresh analytics — keyed on [month].
  const { data, loading, error, reload } = useScreenData(async (db) => {
    const startedAt = Date.now();
    try {
      const grps = await getAllGroups(db);

      const fromMs = startOfMonth(month).getTime();
      const toMs = endOfMonth(month).getTime();
      const yFrom = startOfYear(month).getTime();
      const yTo = endOfYear(month).getTime();
      const pStart = startOfMonth(subMonths(month, 1)).getTime();
      const pEnd = endOfMonth(subMonths(month, 1)).getTime();
      // 6-month trend window (oldest → newest) ending at the selected month.
      const trendMonths = Array.from({ length: 6 }, (_, i) => subMonths(month, 5 - i));

      // Fire every independent read concurrently instead of awaiting each in series
      // (this loader used to do ~12 sequential round-trips). Ranges that were queried
      // more than once (current month, prior month) are fetched here and reused below.
      const [perGroup, yearTxns, allMonthTxns, knownExpenseCats, pTxns, trendTxnsByMonth] =
        await Promise.all([
          Promise.all(grps.map(async (g) => {
            const [gTxns, an] = await Promise.all([
              getTransactionsInRange(db, g.id, fromMs, toMs),
              getBudgetAnalytics(db, g, month),
            ]);
            return { summary: buildSummary(g, gTxns), analytics: an };
          })),
          getTransactionsInRange(db, null, yFrom, yTo),
          getTransactionsInRange(db, null, fromMs, toMs),
          getCategories(db, 'expense'),
          getTransactionsInRange(db, null, pStart, pEnd),
          Promise.all(trendMonths.map((m) =>
            getTransactionsInRange(db, null, startOfMonth(m).getTime(), endOfMonth(m).getTime()))),
        ]);

      const sums: GroupSummary[] = perGroup.map((r) => r.summary);
      const anMap: Record<string, BudgetAnalytics> = {};
      grps.forEach((g, i) => { anMap[g.id] = perGroup[i].analytics; });

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

      const topCat = Object.entries(yCatMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

      // Build spending-by-category pie chart data for the selected month
      const monthCatMap: Record<string, number> = {};
      for (const s of sums) {
        for (const c of s.topCats) {
          monthCatMap[c.name] = (monthCatMap[c.name] ?? 0) + c.amount;
        }
      }
      // Add all categories from all groups (not just top 3). `allMonthTxns` and the
      // adopted expense category names were already fetched above.
      const knownExpense = new Set(knownExpenseCats.map(c => c.name));
      const fullCatMapRaw: Record<string, number> = {};
      for (const t of allMonthTxns) {
        if (t.kind === 'expense') { // getTransactionsInRange already excludes soft-deleted
          const amt = t.shares.reduce((s2, sh) => s2 + sh.amount, 0);
          fullCatMapRaw[t.category] = (fullCatMapRaw[t.category] ?? 0) + amt;
        }
      }
      const fullCatMap = foldUncategorized(fullCatMapRaw, knownExpense);
      // Month totals (Spent/Earned) + prior month, for the summary cards.
      let mSpent = 0, mEarned = 0;
      for (const t of allMonthTxns) {
        if (t.kind === 'expense') mSpent += t.shares.reduce((s2, sh) => s2 + sh.amount, 0);
        else if (t.kind === 'income') mEarned += t.payments.reduce((s2, p) => s2 + p.amount, 0);
      }
      // prior month (`pTxns`) was already fetched above.
      let pSpent = 0, pEarned = 0;
      for (const t of pTxns) {
        if (t.kind === 'expense') pSpent += t.shares.reduce((s2, sh) => s2 + sh.amount, 0);
        else if (t.kind === 'income') pEarned += t.payments.reduce((s2, p) => s2 + p.amount, 0);
      }

      const sortedCats = Object.entries(fullCatMap).sort((a, b) => b[1] - a[1]);
      const pieData: DonutSeg[] = sortedCats.slice(0, 8).map(([name, val], i) => ({
        name,
        paise: val,
        color: categoryVisual(name).color || CHART_COLORS[i % CHART_COLORS.length],
      }));
      const pieTotal = sortedCats.reduce((s, [, v]) => s + v, 0);

      // 6-month spending trend ending at the selected month — overall + per-category,
      // so picking a category in the donut/labels redraws this chart for that category.
      const monthly: MonthPoint[] = trendMonths.map((m, idx) => {
        let mTotal = 0;
        const byCatRaw: Record<string, number> = {};
        for (const t of trendTxnsByMonth[idx]) {
          if (t.kind !== 'expense') continue;
          const amt = t.shares.reduce((s2, sh) => s2 + sh.amount, 0);
          mTotal += amt;
          byCatRaw[t.category] = (byCatRaw[t.category] ?? 0) + amt;
        }
        // Fold unknown names into "Others" so the trend matches the donut/labels
        // (selecting the Others slice shows its 6-month total too).
        return { label: format(m, 'MMM'), total: mTotal, byCat: foldUncategorized(byCatRaw, knownExpense) };
      });

      return {
        groups: grps,
        summaries: sums,
        analyticsByGroup: anMap,
        yearIncome: yIncome,
        yearExpense: yExpense,
        yearTopCat: topCat,
        biggestTxn: biggest,
        monthSpent: mSpent,
        monthEarned: mEarned,
        prevSpent: pSpent,
        prevEarned: pEarned,
        pieData,
        pieTotal,
        monthly,
      };
    } finally {
      // Keep the skeleton visible for a minimum of 450ms so it doesn't flash.
      const elapsed = Date.now() - startedAt;
      if (elapsed < 450) await new Promise(r => setTimeout(r, 450 - elapsed));
    }
  }, [month]);

  const groups = data?.groups ?? [];
  const summaries = data?.summaries ?? [];
  const analyticsByGroup = data?.analyticsByGroup ?? {};
  const yearIncome = data?.yearIncome ?? 0;
  const yearExpense = data?.yearExpense ?? 0;
  const yearTopCat = data?.yearTopCat ?? '—';
  const biggestTxn = data?.biggestTxn ?? 0;
  const monthSpent = data?.monthSpent ?? 0;
  const monthEarned = data?.monthEarned ?? 0;
  const prevSpent = data?.prevSpent ?? 0;
  const prevEarned = data?.prevEarned ?? 0;
  const pieData = data?.pieData ?? [];
  const pieTotal = data?.pieTotal ?? 0;
  const monthly = data?.monthly ?? [];

  // Reports only ever runs up to "now" — the month selector can go back through
  // history but never into a future month.
  const canGoNext = format(month, 'yyyy-MM') !== format(new Date(), 'yyyy-MM');

  async function exportCSV() {
    setExporting(true);
    try {
      const csv = await buildReportCsv(db, groups, month);
      const fileName = `budgetsplit_${format(month, 'yyyy-MM')}.csv`;
      const file = new File(Paths.cache, fileName);
      file.create({ overwrite: true });
      file.write(csv);
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Saved', `Sharing isn’t available here. The CSV was saved to:\n${file.uri}`);
        return;
      }
      await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Export CSV' });
    } catch (e) {
      // Surface the real reason — silent "Export failed" hid genuine bugs before.
      Alert.alert('Export failed', `Could not export CSV.\n\n${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  }

  async function exportPDF() {
    setPdfExporting(true);
    try {
      const html = await buildReportHtml(db, summaries, month);
      const { uri } = await Print.printToFileAsync({ html });
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Saved', `Sharing isn’t available here. The PDF was saved to:\n${uri}`);
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Export PDF' });
    } catch (e) {
      Alert.alert('Export failed', `Could not export PDF.\n\n${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPdfExporting(false);
    }
  }

  const exportButtons = (
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
  );

  // 6-month bars: values for the selected category (or total). Memoized on
  // [monthly, selectedCat] so TrendBars only re-animates when the data actually
  // changes — the bar heights tween while the axes stay put (see TrendBars).
  const trendColor = selectedCat ? (categoryVisual(selectedCat).color || colors.accent) : colors.accent;
  const trendValues = useMemo(
    () => monthly.map(m => Math.round((selectedCat ? (m.byCat[selectedCat] ?? 0) : m.total) / 100)),
    [monthly, selectedCat],
  );
  const trendLabels = useMemo(() => monthly.map(m => m.label), [monthly]);

  return (
    <View style={styles.container}>
      <ScreenHeader title="Reports" onBack={() => router.back()} right={exportButtons} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + space.lg }]}>

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
          onPress={() => canGoNext && setMonth(m => addMonths(m, 1))}
          disabled={!canGoNext}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          accessibilityState={{ disabled: !canGoNext }}
          style={styles.navBtn}
        >
          <Feather name="chevron-right" size={22} color={canGoNext ? colors.textPrimary : colors.textMuted + '55'} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ gap: space.md, marginTop: space.xs }}>
          <SkeletonCard height={120} />
          <SkeletonCard height={120} />
          <SkeletonCard height={150} />
        </View>
      ) : error ? (
        <ErrorState onRetry={() => { reload(); }} />
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

          {/* Spending breakdown — top category labels (colored icons), a popping
              donut, and a 6-month trend. All three stay in sync via `selectedCat`. */}
          {pieData.length > 0 && pieTotal > 0 && (
            <>
              <CategoryRankList
                rows={pieData.map(s => ({ name: s.name, paise: s.paise }))}
                total={pieTotal}
                topN={4}
                expanded={catExpanded}
                onMore={() => setCatExpanded(e => !e)}
                selectedName={selectedCat}
                onPressCategory={(name) => setSelectedCat(c => (c === name ? null : name))}
              />

              <View style={styles.card}>
                <CategoryDonut
                  data={pieData}
                  total={pieTotal}
                  // Center "View →" opens the month-scoped transaction drill-down
                  // for the selected category.
                  onOpen={(seg) => router.push(`/report-transactions?month=${format(month, 'yyyy-MM')}&category=${encodeURIComponent(seg.name)}` as any)}
                  selectedName={selectedCat}
                  onSelect={(seg) => setSelectedCat(seg ? seg.name : null)}
                />

                {trendValues.length > 0 && (
                  <View style={styles.trendBlock}>
                    <View style={styles.trendHeader}>
                      <Text style={styles.chartTitle}>
                        {selectedCat ? `${selectedCat} · last 6 months` : 'Total spend · last 6 months'}
                      </Text>
                      {selectedCat && (
                        <TouchableOpacity onPress={() => setSelectedCat(null)} accessibilityRole="button" accessibilityLabel="Clear category">
                          <Text style={styles.trendClear}>Clear</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <TrendBars values={trendValues} labels={trendLabels} color={trendColor} />
                  </View>
                )}
              </View>
            </>
          )}

          {/* Month-end forecast (a projection into the future) lives on the Insights
              screen now — Reports shows only actual, historical data. */}

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, paddingBottom: space.xl, gap: space.md },
  exportRow: { flexDirection: 'row', gap: space.xs },
  exportBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, minWidth: 56, alignItems: 'center', justifyContent: 'center', height: 36 },
  exportBtnAlt: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  exportBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  exportBtnText: { ...type.label, color: colors.bg, fontFamily: 'Inter_600SemiBold' },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bgCard, borderRadius: radius.md, padding: space.sm, borderWidth: 1, borderColor: colors.border },
  navBtn: { padding: space.xs },
  monthLabel: { ...type.subheading, color: colors.textPrimary },
  sectionTitle: { ...type.label, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: space.sm },
  summaryRow: { flexDirection: 'row', gap: space.sm },
  summaryCard: { flex: 1, backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.md },
  summaryLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Inter_600SemiBold', marginBottom: 6 },
  summaryValue: { fontFamily: 'SpaceMono_400Regular', fontSize: 22, color: colors.textPrimary, letterSpacing: -1, marginBottom: 3 },
  summaryDeltaRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  summaryDelta: { ...type.caption, fontFamily: 'Inter_600SemiBold' },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm },
  chartTitle: { ...type.label, color: colors.textSecondary, marginBottom: space.sm },
  trendBlock: { marginTop: space.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md },
  trendHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
  trendClear: { ...type.caption, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
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
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  reviewLabel: { ...type.body, color: colors.textSecondary },
  reviewValue: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
});
