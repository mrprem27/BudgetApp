import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useScreenData } from '../../src/hooks/useScreenData';
import { Feather } from '@expo/vector-icons';
import {
  startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear,
  getDaysInMonth, getDaysInYear,
} from 'date-fns';
import { colors, type, space, radius, layout, alpha } from '../../src/theme';
import { BudgetBar } from '../../src/components/finance/BudgetBar';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { TransactionRow } from '../../src/components/finance/TransactionRow';
import { TxnCell } from '../../src/components/finance/TxnCell';
import { type TxnWithSplits } from '../../src/db/queries/transactions';
import { type Period as BudgetPeriod } from '../../src/lib/budget';
import { loadCategoryDetail, categoryPeriodBudget } from '../../src/lib/categoryDetailData';
import { categoryVisual } from '../../src/constants/categories';
import { matchesCategory } from '../../src/lib/categoryFold';
import { recurringMonthlyEquivalent } from '../../src/lib/recurrence';
import { formatRupees, formatCompact } from '../../src/lib/money';
import { myShareOf, myShareOrTotal } from '../../src/lib/splitMath';
import { AppRefreshControl } from '../../src/components/ui/AppRefreshControl';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { IconCircle } from '../../src/components/ui/IconCircle';
import { Card } from '../../src/components/ui/Card';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { Divider } from '../../src/components/ui/Divider';
import { TabPills } from '../../src/components/ui/TabPills';
import { useContentInset } from '../../src/hooks/useContentInset';

type Period = 'day' | 'month' | 'year';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'day', label: 'Today' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
];
const PERIOD_NOUN: Record<Period, string> = { day: 'today', month: 'this month', year: 'this year' };
// Dashboard uses 'today' for the day tab — accept it (and a couple of aliases) from the deep link.
function paramToPeriod(p?: string): Period {
  if (p === 'today' || p === 'day') return 'day';
  if (p === 'year') return 'year';
  return 'month';
}

// My share of each expense (personal entries: full; group entries: my split).
const sumMyShare = (arr: TxnWithSplits[], myId: string) =>
  arr.reduce((s, t) => s + myShareOf(t, myId), 0);

// Stable identity so the `view` memo doesn't recompute on every render while loading.
const EMPTY_KNOWN: Set<string> = new Set();

export default function CategoryDetailScreen() {
  const { name, period: periodParam } = useLocalSearchParams<{ name?: string; period?: string }>();
  const router = useRouter();
  const listPad = useContentInset();
  const categoryName = name ? decodeURIComponent(name) : '';

  // Pre-select whatever was active on the Dashboard when a category bar was tapped.
  const [period, setPeriod] = useState<Period>(() => paramToPeriod(periodParam));

  const visual = categoryVisual(categoryName);

  // Period boundaries (week starts Monday — common in India).
  const ranges = useMemo(() => {
    const now = new Date();
    return {
      day: [startOfDay(now).getTime(), endOfDay(now).getTime()] as const,
      month: [startOfMonth(now).getTime(), endOfMonth(now).getTime()] as const,
      year: [startOfYear(now).getTime(), endOfYear(now).getTime()] as const,
    };
  }, []);

  // Refetch on focus (via useScreenData) so returning after adding/editing a txn shows fresh data.
  // All of this year's expenses (every category) are fetched — period subsets are derived
  // client-side so switching tabs is instant and needs no re-query.
  const { data, loading, error: loadError, refreshing, onRefresh, reload } = useScreenData(
    (db) => loadCategoryDetail(db, { category: categoryName, from: ranges.year[0], to: ranges.year[1] }),
    [categoryName, ranges],
  );

  const myId = data?.myId ?? '';
  const personalGroupId = data?.personalGroupId ?? null;
  const groupRefs = data?.groupRefs ?? {};
  const yearExpenses = data?.yearExpenses ?? [];
  const globalLines = data?.globalLines ?? [];
  const groupLimits = data?.groupLimits ?? [];
  const recurRules = data?.recurRules ?? [];
  const goals = data?.goals ?? [];
  const known = data?.known ?? EMPTY_KNOWN;

  const target: BudgetPeriod = period === 'day' ? 'daily' : period === 'month' ? 'monthly' : 'yearly';
  // The hero is MY budget for this category, against my spend on it everywhere —
  // one basis on both sides. A group's limit is a different question, answered in
  // its own card below.
  const periodBudget = useMemo(
    () => categoryPeriodBudget(globalLines, target, new Date()),
    [globalLines, target],
  );

  // Derived view for the selected period — budget is always prorated to it.
  // All money figures are MY share (consistent with the rest of Personal).
  const view = useMemo(() => {
    const now = new Date();
    const [ps, pe] = ranges[period];
    const inPeriod = yearExpenses.filter(t => t.date >= ps && t.date <= pe);
    // Others is a BUCKET, not a category — matching the literal string showed a
    // slice worth thousands and then an empty list here (`matchesCategory`).
    const cat = inPeriod.filter(t => matchesCategory(t.category, categoryName, known))
      .sort((a, b) => b.date - a.date);
    const spent = sumMyShare(cat, myId);
    const totalAll = sumMyShare(inPeriod, myId);
    const budget = periodBudget.amount;

    // Where my spend in this category goes — personal vs each group.
    const byGroup = new Map<string, number>();
    for (const t of cat) {
      const amt = myShareOf(t, myId);
      if (amt > 0) byGroup.set(t.group_id, (byGroup.get(t.group_id) ?? 0) + amt);
    }
    const perGroup = Array.from(byGroup.entries())
      .map(([gid, amt]) => {
        const ref = groupRefs[gid];
        return {
          gid, amt,
          // A group can be deleted while its entries survive — name it rather than
          // dropping the spend, or the slices stop adding up to the total above.
          name: ref?.isPersonal ? 'Personal' : (ref?.name ?? 'Group'),
          color: ref?.color ?? colors.textMuted,
          isPersonal: ref?.isPersonal ?? false,
        };
      })
      .sort((a, b) => b.amt - a.amt);

    // Top places for this category (location-tagged entries).
    const byPlace = new Map<string, { amt: number; count: number }>();
    for (const t of cat) {
      const label = t.place_label?.trim();
      if (!label) continue;
      const cur = byPlace.get(label) ?? { amt: 0, count: 0 };
      byPlace.set(label, { amt: cur.amt + myShareOf(t, myId), count: cur.count + 1 });
    }
    const places = Array.from(byPlace.entries())
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.amt - a.amt)
      .slice(0, 5);

    // Each group's own limit, paired with my spend in THAT group — a self-contained
    // ratio per row, and deliberately no total across them.
    const limits = groupLimits
      .map(gl => ({
        groupId: gl.groupId,
        name: gl.name,
        limit: categoryPeriodBudget(gl.lines, target, now).amount,
        spent: byGroup.get(gl.groupId) ?? 0,
      }))
      .filter(l => l.limit > 0)
      .sort((a, b) => b.limit - a.limit);

    return { txns: cat, spent, totalAll, count: cat.length, budget, perGroup, places, limits };
  }, [ranges, period, yearExpenses, categoryName, known, periodBudget, myId, groupRefs, groupLimits, target]);

  const showBudgetCard = view.budget > 0;
  // No budget set at all → prompt to set one. A budget that exists but is a pool
  // at this period is not "unset" — switching to Year will show it.
  const showSetBudget = !periodBudget.hasAny;

  const txnCount = view.txns.length;
  const renderTxn = useCallback(({ item: txn, index }: { item: typeof view.txns[number]; index: number }) => (
    <TxnCell first={index === 0} last={index === txnCount - 1}>
      <TransactionRow
        txn={txn}
        myId={myId}
        onPress={() => router.push(`/txn/${txn.id}`)}
        groupName={txn.group_id && txn.group_id !== personalGroupId ? groupRefs[txn.group_id]?.name : undefined}
      />
    </TxnCell>
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [myId, personalGroupId, groupRefs, txnCount]);

  // Everything above the transaction list — rendered as the FlatList header so the
  // list itself can virtualize (a heavy category over "year" can have hundreds of rows).
  const listHeader = (
    <View style={styles.headerBlocks}>
        {/* Name + back live in the shared ScreenHeader above the list; this line
            keeps the count, and the budget card below is the screen's hero. */}
        <Text style={styles.headerSub}>
          {view.count} {view.count === 1 ? 'transaction' : 'transactions'} {PERIOD_NOUN[period]}
        </Text>

        {/* Period selector — Today / Month / Year, mirroring the Dashboard */}
        <TabPills tabs={PERIODS.map(p => ({ key: p.key, label: p.label }))} active={period} onChange={(k) => setPeriod(k as Period)} />

        {loading ? (
          <>
            <SkeletonCard height={120} />
            <SkeletonCard height={180} />
          </>
        ) : (
          <>
            {/* Summary: Budget card if a budget exists, else amount (+ set-budget prompt on Month) */}
            {showBudgetCard ? (
              <Card padded>
                <View style={styles.budgetTop}>
                  <Text style={styles.cardLabel}>Your budget</Text>
                  <Text style={[styles.budgetPct, { color: view.spent > view.budget ? colors.expense : colors.healthAmber }]}>
                    {Math.round((view.spent / view.budget) * 100)}% used
                  </Text>
                </View>
                <BudgetBar allocated={view.budget} spent={view.spent} />
                <View style={styles.budgetFooter}>
                  <View>
                    <Text style={styles.budgetAmt}>{formatRupees(view.spent)}</Text>
                    <Text style={styles.budgetCaption}>spent</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.budgetAmt, { color: colors.textSecondary }]}>{formatRupees(view.budget)}</Text>
                    <Text style={styles.budgetCaption}>budget</Text>
                  </View>
                </View>
              </Card>
            ) : (
              <Card padded>
                <Text style={styles.cardLabel}>Spent {PERIOD_NOUN[period]}</Text>
                <Text style={styles.amount}>{formatRupees(view.spent)}</Text>
                <Text style={styles.amountSub}>
                  {view.totalAll > 0 ? `${Math.round((view.spent / view.totalAll) * 100)}% of all spending` : 'No spending yet'}
                  {view.count > 0 ? ` · avg ${formatCompact(Math.round(view.spent / view.count))}` : ''}
                </Text>
              </Card>
            )}

            {/* Set-budget prompt — shown prominently when no monthly budget is set */}
            {showSetBudget && (
              <TouchableOpacity style={styles.setBudget} onPress={() => router.push(`/budget?category=${encodeURIComponent(categoryName)}`)} accessibilityRole="button">
                <IconCircle icon="target" size={36} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.setBudgetTitle}>Set a budget for {categoryName}</Text>
                  <Text style={styles.setBudgetSub}>Track spending against a limit you set</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}

            {/* A group's limit is its own figure, not part of mine above. */}
            {view.limits.length > 0 && (
              <View>
                <SectionHeader title="Group limits" />
                <Card>
                  {view.limits.map((l, i) => (
                    <View key={l.groupId}>
                      {i > 0 && <Divider indent="none" />}
                      <View style={styles.limitRow}>
                        <View style={styles.limitTop}>
                          <Text style={styles.limitName} numberOfLines={1}>{l.name}</Text>
                          <Text style={styles.limitAmt}>
                            {formatCompact(l.spent)} of {formatCompact(l.limit)}
                          </Text>
                        </View>
                        <BudgetBar allocated={l.limit} spent={l.spent} />
                      </View>
                    </View>
                  ))}
                  <Text style={styles.limitNote}>
                    Per person in each group, against your spend there. Not added to your
                    budget above — that already covers this spending.
                  </Text>
                </Card>
              </View>
            )}

            {/* Where it goes — my spend split across personal + groups */}
            {/* Shown for one group too, as long as that group is a shared one —
                "all of this was the flat" is worth saying. A lone Personal row is
                not: it only restates the total above it. */}
            {(view.perGroup.length > 1 || view.perGroup.some(g => !g.isPersonal)) && (
              <Card padded>
                <Text style={styles.cardLabel}>Where it goes</Text>
                {view.perGroup.map(g => {
                  const pct = view.spent > 0 ? Math.round((g.amt / view.spent) * 100) : 0;
                  return (
                    <View key={g.gid} style={styles.insRow}>
                      <View style={[styles.groupDot, { backgroundColor: g.color }]} />
                      <Text style={[styles.insName, { flex: 1 }]} numberOfLines={1}>{g.name}</Text>
                      <Text style={styles.insMeta}>{pct}%</Text>
                      <Text style={styles.insAmt}>{formatRupees(g.amt)}</Text>
                    </View>
                  );
                })}
              </Card>
            )}

            {/* Top places */}
            {view.places.length > 0 && (
              <Card padded>
                <Text style={styles.cardLabel}>Top places</Text>
                {view.places.map(p => (
                  <View key={p.label} style={styles.insRow}>
                    <Feather name="map-pin" size={13} color={colors.textMuted} />
                    <Text style={[styles.insName, { flex: 1 }]} numberOfLines={1}>{p.label}</Text>
                    <Text style={styles.insMeta}>{p.count}×</Text>
                    <Text style={styles.insAmt}>{formatCompact(p.amt)}</Text>
                  </View>
                ))}
              </Card>
            )}

            {/* Recurring in this category */}
            {recurRules.length > 0 && (
              <Card padded>
                <Text style={styles.cardLabel}>Recurring</Text>
                {recurRules.map(r => {
                  const mine = myShareOrTotal(r, myId);
                  const name = (r.note && r.note.trim()) || r.category;
                  return (
                    <TouchableOpacity key={r.id} style={styles.insRow} onPress={() => router.push(`/group/${r.group_id}/recurring?focus=${r.id}`)} accessibilityRole="button">
                      <Feather name="repeat" size={13} color={colors.settle} />
                      <Text style={[styles.insName, { flex: 1 }]} numberOfLines={1}>{name}</Text>
                      <Text style={styles.insMeta}>{r.recur_freq}</Text>
                      <Text style={styles.insAmt}>{formatCompact(mine)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </Card>
            )}

            {/* Savings goals tagged to this category */}
            {goals.length > 0 && (
              <Card padded>
                <Text style={styles.cardLabel}>Goals</Text>
                {goals.map(g => (
                  <TouchableOpacity key={g.id} style={styles.insRow} onPress={() => router.push(`/savings/${g.id}`)} accessibilityRole="button">
                    <Feather name="target" size={13} color={g.color ?? colors.accent} />
                    <Text style={[styles.insName, { flex: 1 }]} numberOfLines={1}>{g.name}</Text>
                    <Text style={styles.insAmt}>{formatCompact(g.target)}</Text>
                    <Feather name="chevron-right" size={14} color={colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </Card>
            )}

            {/* Transactions header — the rows themselves are the FlatList data below */}
            {view.txns.length > 0 && <SectionHeader title="Transactions" right={<Text style={styles.txnCount}>{view.count}</Text>} />}
          </>
        )}
    </View>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={categoryName}
        onBack={() => router.back()}
        right={<IconCircle icon={visual.icon} size={32} iconSize={17} color={visual.color} />}
      />
      <FlatList
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: listPad }]}
        showsVerticalScrollIndicator={false}
        data={loading || loadError ? [] : view.txns}
        keyExtractor={(txn) => txn.id}
        renderItem={renderTxn}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={11}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          // Error goes here rather than replacing the whole list: `listHeader`
          // holds this screen's only back link, so blanking it would trap the user.
          loadError ? (
            <ErrorState onRetry={reload} />
          ) : loading ? null : (
            <EmptyState
              icon="inbox"
              title="No transactions"
              body={`No expenses in this category ${PERIOD_NOUN[period]}.`}
              actionLabel={`Add a ${categoryName} expense`}
              // The screen already knows the category — making the user re-pick it
              // is the same defect as Afford's "Log it".
              onAction={() => router.push({ pathname: '/add/quick', params: { category: categoryName } })}
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  /**
   * NO `gap` here. A FlatList's contentContainerStyle gap applies between *every*
   * child — which includes every transaction row — and `TxnCell` rows are meant to
   * be one contiguous card with dividers between them. A 16px gap sliced that card
   * into separate slabs, which is the spacing that looked wrong on this screen.
   * (The identical bug was fixed on `personal.tsx`; this was the other instance.)
   * The summary cards get their spacing from `headerBlocks` instead.
   */
  scrollContent: { paddingHorizontal: layout.screenPaddingH },
  headerBlocks: { gap: space.md, paddingTop: space.sm },

  headerSub: { ...type.caption, color: colors.textMuted },

  /** One eyebrow style for every card title. There were three on this screen —
   *  `cardLabel` and `sectionLabel` at letterSpacing 1, and `txnLabel` at 0.5 with
   *  no SemiBold — none of them matching `type.sectionLabel` (AGENTS §12). */
  cardLabel: { ...type.sectionLabel, color: colors.textMuted, marginBottom: space.xs },
  txnCount: { ...type.amountSM, color: colors.textSecondary },

  budgetTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space.sm },
  budgetPct: { ...type.captionSemi },
  budgetFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.sm },
  budgetAmt: { ...type.amountLG, color: colors.textPrimary },
  budgetCaption: { ...type.caption, color: colors.textMuted, marginTop: 2 },

  amount: { ...type.amountXL, color: colors.textPrimary, marginTop: space.xs },
  amountSub: { ...type.caption, color: colors.textMuted, marginTop: 2 },

  setBudget: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.accentMuted, borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: alpha(colors.accent, 27) },
  limitRow: { paddingHorizontal: space.md, paddingVertical: space.smd, gap: space.sm },
  limitTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  limitName: { ...type.body, color: colors.textPrimary, flex: 1 },
  limitAmt: { ...type.caption, color: colors.textSecondary },
  limitNote: {
    ...type.caption, color: colors.textMuted,
    paddingHorizontal: space.md, paddingBottom: space.smd, paddingTop: space.xs,
  },
  setBudgetTitle: { ...type.bodySemi, color: colors.textPrimary },
  setBudgetSub: { ...type.caption, color: colors.textSecondary, marginTop: 2 },

  /** `layout.touchMin` because three of these row types are tappable (recurring,
   *  goals) — they were 27pt tall, well under AGENTS §6. */
  groupDot: { width: 8, height: 8, borderRadius: 4, marginRight: space.sm },
  insRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: layout.touchMin },
  insName: { ...type.body, color: colors.textPrimary },
  insMeta: { ...type.caption, color: colors.textMuted, textTransform: 'capitalize' },
  insAmt: { ...type.amountSM, color: colors.textSecondary, minWidth: 52, textAlign: 'right' },
});
