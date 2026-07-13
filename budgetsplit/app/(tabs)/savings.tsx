import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../src/constants/colors';
import { asFeather } from '../../src/constants/palette';
import { type } from '../../src/constants/typography';
import { space, radius, layout, shadow } from '../../src/constants/layout';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { PrimaryButton } from '../../src/components/ui/PrimaryButton';
import { BudgetBar } from '../../src/components/finance/BudgetBar';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { PressableScale } from '../../src/components/ui/PressableScale';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { DraggableList } from '../../src/components/ui/DraggableList';
import { Input } from '../../src/components/ui/Input';
import { InsightText } from '../../src/components/finance/InsightText';
import { AppRefreshControl, useRefresh } from '../../src/components/ui/AppRefreshControl';
import { getTransactionsInRange, getRecurringForGroup } from '../../src/db/queries/transactions';
import { buildUpcoming, type UpcomingItem } from '../../src/lib/upcoming';
import { ComingUpList } from '../../src/components/finance/home/ComingUpList';
import { GoalCard } from '../../src/components/finance/plan/GoalCard';
import { TotalMoneyCard } from '../../src/components/finance/plan/TotalMoneyCard';
import { MoneyEditorSheet } from '../../src/components/finance/plan/MoneyEditorSheet';
import { ForecastCard } from '../../src/components/finance/plan/ForecastCard';
import { formatCompact, parseToPaise } from '../../src/lib/money';
import { getBudgetAnalytics } from '../../src/lib/analytics';
import { getMe } from '../../src/db/queries/persons';
import { getDate, getDaysInMonth, format, addMonths, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { forecastMonthEnd as computeForecastMonthEnd } from '../../src/lib/forecast';

// Goal deadline as quick durations (avoids a fragile date-picker modal-in-modal).
const DEADLINE_OPTS: { label: string; months: number | null }[] = [
  { label: 'None', months: null },
  { label: '3 mo', months: 3 },
  { label: '6 mo', months: 6 },
  { label: '1 yr', months: 12 },
  { label: '2 yr', months: 24 },
];
function deadlineOn(dateMs: number | null, months: number | null): boolean {
  if (months === null) return dateMs === null;
  if (dateMs === null) return false;
  const t = addMonths(new Date(), months);
  const d = new Date(dateMs);
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth();
}
import { haptic } from '../../src/lib/haptics';
import {
  getGoals, getGoalSavedMap, getTotalMoney, fundGoal, insertGoal, reorderGoals,
  runSavingsMaintenance, undoOverspendRaid, buildSavingsInsights,
  type SavingsGoal, type Priority, type SavingsFrequency, type OverspendRaid,
} from '../../src/db/queries/savings';
import { getMoneyProfile, setMoneyProfile } from '../../src/db/queries/moneyProfile';
import { getAllGroups } from '../../src/db/queries/groups';
import type { Insight } from '../../src/lib/savingsInsights';
import type { TotalMoney, MoneyProfile } from '../../src/lib/cash';
import { useFeatureFlags } from '../../src/components/system/FeatureFlagsProvider';
import { useDataRefresh } from '../../src/components/system/DataRefreshProvider';
import { useReloadOnDataChange } from '../../src/hooks/useReloadOnDataChange';

const GOAL_ICONS = ['smartphone', 'monitor', 'map', 'navigation', 'home', 'gift', 'umbrella', 'shield', 'headphones', 'watch', 'camera', 'book', 'star', 'heart', 'award', 'target'];
const GOAL_COLORS = ['#20C4B8', '#F0A500', '#7C6AF7', '#3ECF8E', '#F472B6', '#FB923C', '#60A5FA', '#F06060'];

// Plan screen (design Screen 3) = Pool + Goals + Upcoming + Forecast only.
// Everything else the app had is hidden behind this toggle for now — handle later.

const FREQS: { key: SavingsFrequency; label: string }[] = [
  { key: 'none', label: 'None' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];

function insightTint(tone: Insight['tone']): string {
  switch (tone) {
    case 'achieve': return colors.income;
    case 'warn': return colors.healthAmber;
    case 'progress': return colors.income;
    default: return colors.accent; // motivate, compare
  }
}

export default function SavingsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { flags } = useFeatureFlags();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [saved, setSaved] = useState<Record<string, number>>({});
  const [money, setMoney] = useState<TotalMoney | null>(null);
  const [profile, setProfile] = useState<MoneyProfile>({ openingCash: 0, investments: 0, creditLimit: 0, creditUsed: 0 });
  const [insights, setInsights] = useState<Insight[]>([]);
  const [forecastMonthEnd, setForecastMonthEnd] = useState<number | null>(null);
  const [forecastBudget, setForecastBudget] = useState(0);
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [overspend, setOverspend] = useState<OverspendRaid | null>(null);

  const [showMoneyEditor, setShowMoneyEditor] = useState(false);
  const [fundGoalId, setFundGoalId] = useState<string | null>(null);
  const [fundAmt, setFundAmt] = useState('');

  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [icon, setIcon] = useState(GOAL_ICONS[0]);
  const [color, setColor] = useState(GOAL_COLORS[0]);
  const [allocation, setAllocation] = useState('');
  const [frequency, setFrequency] = useState<SavingsFrequency>('none');
  const [newDate, setNewDate] = useState<number | null>(null);

  const [loadError, setLoadError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(useCallback(() => { load(); }, []));
  useReloadOnDataChange(load);
  const { refresh } = useDataRefresh();
  const { refreshing, onRefresh } = useRefresh(() => load());

  async function load() {
    try {
    // Scheduled goal funding + overspend auto-raid. Surface a notice if a raid happened.
    const raid = await runSavingsMaintenance(db);
    if (raid.total > 0) setOverspend(raid);
    const [g, s, tm, mp, ins] = await Promise.all([getGoals(db), getGoalSavedMap(db), getTotalMoney(db), getMoneyProfile(db), buildSavingsInsights(db)]);
    setGoals(g);
    setSaved(s);
    setMoney(tm);
    setProfile(mp);
    setInsights(ins);
    const grps = await getAllGroups(db);

    // Current month's category spend — feeds the month-end forecast + what-if simulator.
    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const monthTxns = await getTransactionsInRange(db, null, monthStart.getTime(), Date.now());
    const catMap: Record<string, number> = {};
    for (const t of monthTxns) {
      if (t.kind === 'expense') {
        const amt = t.shares.reduce((s: number, sh: { amount: number }) => s + sh.amount, 0);
        catMap[t.category] = (catMap[t.category] ?? 0) + amt;
      }
    }
    // Month-end spend forecast — same credibility-weighted model as Reports
    // (lib/forecast), blended with last month's actual. Hidden until day 3.
    const today2 = new Date();
    const dayOfMonth = getDate(today2);
    const daysInMonth = getDaysInMonth(today2);
    const totalMonthSpend = Object.values(catMap).reduce((s, v) => s + v, 0);
    const prevTxns = await getTransactionsInRange(db, null, startOfMonth(subMonths(today2, 1)).getTime(), endOfMonth(subMonths(today2, 1)).getTime());
    let priorMonthTotal = 0;
    for (const t of prevTxns) {
      if (t.kind === 'expense') priorMonthTotal += t.shares.reduce((s: number, sh: { amount: number }) => s + sh.amount, 0);
    }
    const f = computeForecastMonthEnd(totalMonthSpend, dayOfMonth, daysInMonth, priorMonthTotal);
    setForecastMonthEnd(f.ready ? f.projected : null);

    // Budget total across all groups for the forecast over/under line.
    const analyticsAll = await Promise.all(grps.map(g => getBudgetAnalytics(db, g)));
    let bTotal = 0;
    for (const a of analyticsAll) bTotal += a.totalAllocated;
    setForecastBudget(bTotal);

    // Compute net across all non-personal groups (for ACROSS ALL GROUPS section).
    const me2 = await getMe(db);
    if (me2) {
      // Upcoming recurring bills across all groups (design Screen 3).
      const recurringByGroup = await Promise.all(grps.map(g => getRecurringForGroup(db, g.id)));
      setUpcoming(buildUpcoming(recurringByGroup.flat(), me2.id, Date.now(), 5));
    }
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoaded(true);
    }
  }

  async function handleSaveMoney(p: MoneyProfile) {
    await setMoneyProfile(db, p);
    haptic.success();
    setShowMoneyEditor(false);
    await load();
    refresh();
  }

  const fundGoalObj = goals.find(g => g.id === fundGoalId) ?? null;

  async function handleFundGoal() {
    const amt = parseToPaise(fundAmt);
    if (!fundGoalId || amt <= 0) return;
    await fundGoal(db, fundGoalId, amt);
    haptic.success();
    setFundAmt('');
    setFundGoalId(null);
    await load();
    refresh();
  }

  async function handleUndoOverspend() {
    if (!overspend) return;
    await undoOverspendRaid(db, overspend.withdrawals);
    haptic.success();
    setOverspend(null);
    await load();
    refresh();
  }

  function resetNew() {
    setName(''); setTarget(''); setPriority('medium'); setIcon(GOAL_ICONS[0]);
    setColor(GOAL_COLORS[0]); setAllocation(''); setFrequency('none'); setNewDate(null);
  }

  // Persist a drag reorder → new funding priority. Reorder local state to match
  // so the screen doesn't need a full reload.
  async function handleReorder(ids: string[]) {
    // Only the active goals are draggable; preserve any goals not in `ids` (completed).
    setGoals(prev => {
      const reordered = ids.map(id => prev.find(g => g.id === id)).filter((g): g is SavingsGoal => !!g);
      const rest = prev.filter(g => !ids.includes(g.id));
      return [...reordered, ...rest];
    });
    await reorderGoals(db, ids);
  }

  async function handleCreate() {
    const t = parseToPaise(target);
    if (!name.trim() || t <= 0) return;
    await insertGoal(db, {
      name: name.trim(), target: t, priority, icon, color, category: name.trim(),
      allocation: parseToPaise(allocation), frequency, target_date: newDate,
    });
    haptic.success();
    setShowNew(false);
    resetNew();
    await load();
    refresh();
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Plan"
        large
        right={
          <View style={styles.headerRight}>
            {[
              { key: 'insights', icon: 'bar-chart-2' as const, label: 'Insights', show: true, to: '/insights' },
              { key: 'subs', icon: 'refresh-cw' as const, label: 'Recurring', show: flags.recurring, to: '/plan/recurring' },
              // Reminders is notification config — lives in Settings › Notifications & Reminders, not here.
              { key: 'afford', icon: 'help-circle' as const, label: 'Can I afford?', show: flags.affordCheck, to: '/afford' },
            ].filter(m => m.show).map(m => (
              <TouchableOpacity key={m.key} style={styles.headerIconBtn} onPress={() => router.push(m.to as any)} accessibilityRole="button" accessibilityLabel={m.label}>
                <Feather name={m.icon} size={18} color={colors.accent} />
              </TouchableOpacity>
            ))}
          </View>
        }
      />
      {loadError ? (
        <ErrorState onRetry={() => { setLoadError(false); load(); }} />
      ) : (
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + layout.tabBarHeight + space.lg }]} refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {/* Total Money — cash + investments + available credit, with breakdown */}
        {money && <TotalMoneyCard money={money} onEdit={() => setShowMoneyEditor(true)} />}

        {/* Overspend notice — money auto-pulled from lowest-priority goals to cover a deficit */}
        {overspend && overspend.total > 0 && (
          <View style={styles.overspendCard}>
            <View style={styles.overspendIcon}>
              <Feather name="alert-triangle" size={16} color={colors.expense} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.overspendTitle}>Covered {formatCompact(overspend.total)} overspend</Text>
              <Text style={styles.overspendBody} numberOfLines={2}>
                Pulled from {overspend.withdrawals.map(w => w.name).join(', ')} (lowest priority).
              </Text>
            </View>
            <View style={styles.overspendActions}>
              <TouchableOpacity onPress={handleUndoOverspend} hitSlop={8} accessibilityRole="button" accessibilityLabel="Undo">
                <Text style={styles.overspendUndo}>Undo</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setOverspend(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss">
                <Feather name="x" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Savings insights — opportunity-cost / habit nudges */}
        {flags.savingsInsights && insights.length > 0 && (
          <View style={styles.insightsCard}>
            <Text style={styles.insightsTitle}>Insights</Text>
            {insights.map((ins, i) => {
              const tint = insightTint(ins.tone);
              return (
                <View key={ins.text} style={[styles.insightRow, i > 0 && styles.insightBorder]}>
                  <View style={[styles.insightIcon, { backgroundColor: tint + '22' }]}>
                    <Feather name={asFeather(ins.icon, 'info')} size={14} color={tint} />
                  </View>
                  <InsightText text={ins.text} color={tint} style={styles.insightText} />
                </View>
              );
            })}
          </View>
        )}

        {/* Goals — active are drag-rankable for funding priority; completed sink to the bottom */}
        {flags.savingsGoals && (goals.length > 0 ? (() => {
          const activeGoals = goals.filter(g => (saved[g.id] ?? 0) < g.target);
          const completedGoals = goals.filter(g => (saved[g.id] ?? 0) >= g.target);
          return (
          <>
            <View style={styles.sectionHead}>
              <View>
                <Text style={styles.sectionTitle}>Goals</Text>
                {activeGoals.length > 1 && <Text style={styles.sectionHint}>Hold &amp; drag to set funding priority</Text>}
              </View>
              <TouchableOpacity style={styles.newPill} onPress={() => { resetNew(); setShowNew(true); }} accessibilityRole="button">
                <Feather name="plus" size={13} color={colors.accent} />
                <Text style={styles.newPillText}>New</Text>
              </TouchableOpacity>
            </View>
            {activeGoals.length > 0 && (
              <DraggableList
                data={activeGoals}
                keyExtractor={(g) => g.id}
                onReorder={handleReorder}
                renderItem={(g, isActive) => (
                  <GoalCard
                    goal={g}
                    saved={saved[g.id] ?? 0}
                    isActive={isActive}
                    onPress={() => router.push(`/savings/${g.id}` as any)}
                    onAdd={() => { setFundAmt(''); setFundGoalId(g.id); }}
                  />
                )}
              />
            )}
            {completedGoals.length > 0 && (
              <View style={styles.completedSection}>
                <Text style={styles.completedLabel}>COMPLETED · {completedGoals.length}</Text>
                <View style={{ gap: space.sm }}>
                  {completedGoals.map(g => (
                    <GoalCard key={g.id} goal={g} saved={saved[g.id] ?? 0} isActive={false} completed onPress={() => router.push(`/savings/${g.id}` as any)} />
                  ))}
                </View>
              </View>
            )}
          </>
          );
        })() : !loaded ? null : (
          <EmptyState
            icon="target"
            title="No savings goals yet"
            body="Turn unused money into something you want — a phone, a trip, an emergency fund. Create your first goal."
            actionLabel="New goal"
            onAction={() => { resetNew(); setShowNew(true); }}
          />
        ))}


        {/* Upcoming this month — recurring bills (design Screen 3) */}
        {upcoming.length > 0 && (
          <ComingUpList items={upcoming} title="UPCOMING THIS MONTH" showIcon />
        )}

        {/* Month-end spend forecast */}
        {forecastMonthEnd !== null && (
          <ForecastCard forecastMonthEnd={forecastMonthEnd} forecastBudget={forecastBudget} />
        )}

        <View style={{ height: space.lg }} />
      </ScrollView>
      )}

      {/* Edit Total Money inputs (cash / investments / credit) */}
      <MoneyEditorSheet
        visible={showMoneyEditor}
        onClose={() => setShowMoneyEditor(false)}
        initial={profile}
        onSave={handleSaveMoney}
      />

      {/* Fund a goal directly from cash */}
      <SheetModal visible={fundGoalId !== null} onClose={() => setFundGoalId(null)} title={fundGoalObj ? `Add to ${fundGoalObj.name}` : 'Add to goal'}>
        <TextInput
          style={styles.amountInput}
          value={fundAmt}
          onChangeText={setFundAmt}
          keyboardType="decimal-pad"
          placeholder="₹0"
          placeholderTextColor={colors.textMuted}
          autoFocus
          accessibilityLabel="Amount"
        />
        <Text style={styles.hint}>
          {money ? `${formatCompact(money.cashAvailable)} cash available · ` : ''}comes out of your Cash available.
        </Text>
        <PrimaryButton label="Add to goal" onPress={handleFundGoal} disabled={parseToPaise(fundAmt) <= 0} />
      </SheetModal>

      {/* New goal sheet */}
      <SheetModal visible={showNew} onClose={() => setShowNew(false)} title="New goal">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Input value={name} onChangeText={setName} placeholder="Goal name (e.g. New Phone)" autoCapitalize="words" maxLength={40} style={styles.inputGap} />

          <Text style={styles.fieldLabel}>Target amount</Text>
          <Input value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder="₹0" style={styles.inputGap} />
          {/* Priority is set by drag order in the Goals list — no bucket picker here. */}

          <Text style={styles.fieldLabel}>Icon</Text>
          <View style={styles.iconGrid}>
            {GOAL_ICONS.map(ic => (
              <TouchableOpacity key={ic} style={[styles.iconOpt, icon === ic && { backgroundColor: color }]} onPress={() => setIcon(ic)} accessibilityRole="button" accessibilityLabel={ic}>
                <Feather name={asFeather(ic, 'tag')} size={18} color={icon === ic ? colors.bg : colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.colorRow}>
            {GOAL_COLORS.map(c => (
              <TouchableOpacity key={c} style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]} onPress={() => setColor(c)} accessibilityRole="button" accessibilityLabel={c} />
            ))}
          </View>

          <Text style={styles.fieldLabel}>Fixed allocation (optional)</Text>
          <Input value={allocation} onChangeText={setAllocation} keyboardType="decimal-pad" placeholder="₹0 per period" style={styles.inputGap} />
          <View style={styles.segRow}>
            {FREQS.map(f => (
              <TouchableOpacity key={f.key} style={[styles.segSm, frequency === f.key && { backgroundColor: colors.accentMuted, borderColor: colors.accent }]} onPress={() => setFrequency(f.key)} accessibilityRole="button">
                <Text style={[styles.segText, frequency === f.key && { color: colors.accent, fontFamily: 'Inter_600SemiBold' }]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Target date (optional)</Text>
          <View style={styles.segRow}>
            {DEADLINE_OPTS.map(o => {
              const on = deadlineOn(newDate, o.months);
              return (
                <TouchableOpacity
                  key={o.label}
                  style={[styles.segSm, on && { backgroundColor: colors.accentMuted, borderColor: colors.accent }]}
                  onPress={() => setNewDate(o.months === null ? null : addMonths(new Date(), o.months).getTime())}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.segText, on && { color: colors.accent, fontFamily: 'Inter_600SemiBold' }]}>{o.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {newDate != null && <Text style={styles.deadlineHint}>Target: {format(newDate, 'MMMM yyyy')}</Text>}

          <PrimaryButton label="Create goal" onPress={handleCreate} disabled={!name.trim() || parseToPaise(target) <= 0} style={{ marginTop: space.md }} />
        </KeyboardAvoidingView>
      </SheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.md },

  overspendCard: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.expense + '14', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.expense + '40', padding: space.md },
  overspendIcon: { width: 32, height: 32, borderRadius: radius.lg, backgroundColor: colors.expense + '22', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  overspendTitle: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  overspendBody: { ...type.caption, color: colors.textSecondary, marginTop: 1 },
  overspendActions: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexShrink: 0 },
  overspendUndo: { ...type.body, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  // Teal gradient pool card with accent label (design Screen 3). Gradient supplies the fill.
  poolCard: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.accent + '33', padding: space.lg, ...shadow.md },
  poolLabel: { ...type.caption, color: colors.accent, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Inter_600SemiBold', marginBottom: space.sm },
  poolMainRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md },
  poolSub: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
  poolActions: { flexDirection: 'row', gap: space.sm },
  poolActionBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg + '66' },
  addPoolBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: space.sm + 2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.accent },
  addPoolText: { ...type.button, color: colors.accent },
  withdrawPoolBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: space.sm + 2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  withdrawPoolText: { ...type.button, color: colors.textSecondary },

  insightsCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: space.sm, ...shadow.sm },
  insightsTitle: { ...type.label, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: space.xs, marginBottom: space.xs },
  insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingVertical: space.sm },
  insightBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  insightIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  insightText: { ...type.body, color: colors.textSecondary, flex: 1, lineHeight: 20 },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xs },
  sectionTitle: { ...type.subheading, color: colors.textPrimary },
  sectionHint: { ...type.caption, color: colors.textMuted, marginTop: 1 },
  completedSection: { marginTop: space.md, gap: space.sm },
  completedLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Inter_600SemiBold', marginLeft: space.xs },
  dragHandle: { marginLeft: space.xs },
  subsCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, ...shadow.sm, gap: space.sm },
  subsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subsTotal: { ...type.label, color: colors.expense, fontFamily: 'Inter_600SemiBold' },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 36 },
  subDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  subName: { ...type.body, color: colors.textPrimary, flex: 1 },
  subCadence: { ...type.caption, color: colors.textMuted, textTransform: 'capitalize' },
  subAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 13, color: colors.textPrimary, minWidth: 56, textAlign: 'right' },
  subsHint: { ...type.caption, color: colors.textMuted, lineHeight: 16 },
  // Insights sections
  velocityCard: { backgroundColor: '#1A1014', borderRadius: 18, padding: 18, marginBottom: 10, borderWidth: 1.5, borderColor: colors.expenseTintStrong },
  velocityHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: 10 },
  velocityDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.expense },
  velocityLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: colors.expense, textTransform: 'uppercase', letterSpacing: 0.8 },
  velocityMsg: { fontSize: 17, fontFamily: 'Inter_600SemiBold', color: colors.textPrimary, letterSpacing: -0.3, marginBottom: 6, lineHeight: 23 },
  velocityBarRow: { marginBottom: 12 },
  velocityBarTrack: { height: 6, backgroundColor: colors.bgMuted, borderRadius: 3, overflow: 'hidden' },
  velocityBarFill: { height: 6, borderRadius: 3, backgroundColor: colors.expense },
  velocityCta: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.bgCard, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.border },
  velocityCtaText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.textPrimary },
  insightSecLabel: { fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Inter_600SemiBold', marginBottom: space.sm, marginTop: space.xs },
  insightSecCard: { backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: space.md, marginBottom: 10, ...shadow.sm },
  shiftRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: space.md, paddingVertical: 11 },
  shiftEmoji: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  shiftCat: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.textPrimary },
  shiftAmt: { fontSize: 11, color: colors.textMuted },
  shiftBadge: { flexDirection: 'row', alignItems: 'center', gap: space.xs, borderRadius: 6, paddingHorizontal: space.sm, paddingVertical: 3 },
  shiftBadgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  groupNetAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 18, letterSpacing: -0.5 },
  groupNetTile: { flex: 1, backgroundColor: colors.incomeTint, borderRadius: radius.sm, padding: 10, borderWidth: 1, borderColor: colors.incomeTintStrong },
  groupNetTileLabel: { fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 3 },
  groupNetTileAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 15, letterSpacing: -0.5 },
  subsNudgeCard: { backgroundColor: colors.settleTint, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1.5, borderColor: colors.settle },
  subsNudgeDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.settle, flexShrink: 0 },
  subsNudgeLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: colors.settle, textTransform: 'uppercase', letterSpacing: 0.8 },
  subsNudgeTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.textPrimary, marginBottom: space.xs },
  subsNudgeSub: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
  subsReviewBtn: { flex: 1, backgroundColor: '#13203A', borderRadius: radius.sm, padding: space.sm, alignItems: 'center', borderWidth: 1, borderColor: colors.settleTintStrong },
  subsReviewBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.settle },
  subsDismissBtn: { flex: 1, borderRadius: radius.sm, padding: space.sm, alignItems: 'center' },
  subsDismissBtnText: { fontSize: 12, color: colors.textMuted },
  newPill: { flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: colors.accentMuted, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6 },
  newPillText: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },

  goalCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, ...shadow.sm },
  goalCardActive: { borderColor: colors.accent },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  goalIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  goalNameRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm, marginBottom: 6 },
  goalName: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  goalSub: { ...type.caption, color: colors.textMuted, fontSize: 10, marginTop: 1 },
  goalAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 12, color: colors.textSecondary, letterSpacing: -0.3 },
  goalBarWrap: { marginBottom: 5 },
  goalMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  goalMeta: { ...type.caption, color: colors.textMuted, flexShrink: 1 },
  goalMetaRight: { ...type.caption, fontFamily: 'Inter_600SemiBold' },

  headerRight: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  headerIconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  amountInput: { fontFamily: 'SpaceMono_400Regular', fontSize: 32, color: colors.textPrimary, textAlign: 'center', paddingVertical: space.md },
  hint: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginBottom: space.md },
  inputGap: { marginBottom: space.sm },
  fieldLabel: { ...type.label, color: colors.textSecondary, marginTop: space.sm, marginBottom: space.xs },
  deadlineHint: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dateBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bgInput, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm + 2, borderWidth: 1, borderColor: colors.border },
  dateBtnText: { ...type.body, color: colors.textMuted },
  dateClear: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  segRow: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' },
  seg: { flex: 1, minWidth: 80, paddingVertical: space.sm, alignItems: 'center', borderRadius: radius.md, backgroundColor: colors.bgMuted, borderWidth: 1, borderColor: 'transparent' },
  segSm: { paddingHorizontal: space.md, paddingVertical: space.sm, alignItems: 'center', borderRadius: radius.md, backgroundColor: colors.bgMuted, borderWidth: 1, borderColor: 'transparent' },
  segText: { ...type.label, color: colors.textSecondary },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginBottom: space.sm },
  iconOpt: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.bgMuted, alignItems: 'center', justifyContent: 'center' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  swatch: { width: 28, height: 28, borderRadius: 14 },
  swatchActive: { borderWidth: 3, borderColor: colors.textPrimary },
  forecastCard: { backgroundColor: colors.settle + '1A', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.settle + '44', padding: space.md, flexDirection: 'row', alignItems: 'center', ...shadow.sm },
  forecastLabel: { ...type.body, color: colors.settle, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  forecastSub: { ...type.caption, color: colors.textMuted },
  forecastAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 20, color: colors.textPrimary, letterSpacing: -0.5 },
  forecastDelta: { ...type.caption, fontFamily: 'Inter_600SemiBold', marginTop: 2 },
});
