import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { format, addMonths } from 'date-fns';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../../src/constants/colors';
import { asFeather } from '../../src/constants/palette';
import { type } from '../../src/constants/typography';
import { space, radius, layout, shadow } from '../../src/constants/layout';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { PrimaryButton } from '../../src/components/ui/PrimaryButton';
import { GoalCelebration } from '../../src/components/finance/GoalCelebration';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { formatRupees, formatCompact, parseToPaise } from '../../src/lib/money';
import { goalProgress, estimatedCompletion, monthlyContribution, monthsUntil, neededPerMonth } from '../../src/lib/savings';
import { haptic } from '../../src/lib/haptics';
import {
  getGoalById, getGoalSavedMap, getTotalMoney, getGoalHistory,
  fundGoal, withdrawFromGoal, setGoalLocked, deleteGoal, restoreGoal, updateGoal,
  type SavingsTxn, type SavingsFrequency,
} from '../../src/db/queries/savings';
import { useUndo } from '../../src/components/system/UndoToast';
import { useDataRefresh } from '../../src/components/system/DataRefreshProvider';
import { useScreenData } from '../../src/hooks/useScreenData';

// Goal deadline as quick durations (no fragile date-picker modal-in-modal).
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

const KIND_META: Record<SavingsTxn['kind'], { icon: keyof typeof Feather.glyphMap; label: string; color: string }> = {
  allocate: { icon: 'arrow-down-circle', label: 'Added', color: colors.income },
  withdraw: { icon: 'arrow-up-circle', label: 'Withdrawn', color: colors.expense },
  deposit:  { icon: 'plus-circle', label: 'Deposited', color: colors.accent },
};

export default function GoalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const { showUndo } = useUndo();
  const { refresh } = useDataRefresh();

  const [showAdd, setShowAdd] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustName, setAdjustName] = useState('');
  const [adjustTarget, setAdjustTarget] = useState('');
  const [adjustAlloc, setAdjustAlloc] = useState('');
  const [adjustFreq, setAdjustFreq] = useState<SavingsFrequency>('monthly');
  const [adjustDate, setAdjustDate] = useState<number | null>(null);
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [amt, setAmt] = useState('');

  const { data, loading, error, reload } = useScreenData(async (loadDb) => {
    const [g, savedMap, money, hist] = await Promise.all([
      getGoalById(loadDb, id), getGoalSavedMap(loadDb), getTotalMoney(loadDb), getGoalHistory(loadDb, id),
    ]);
    return {
      goal: g,
      saved: savedMap[id] ?? 0,
      cashAvailable: money.cashAvailable,
      history: hist,
    };
  }, [id]);

  const goal = data?.goal ?? null;
  const saved = data?.saved ?? 0;
  const cashAvailable = data?.cashAvailable ?? 0;
  const history: SavingsTxn[] = data?.history ?? [];

  // Guard: bail back out if we somehow landed here without an id.
  useEffect(() => { if (!id) router.back(); }, [id]);

  if (!id) return null;

  if (error) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Goal" onBack={() => router.back()} />
        <ErrorState onRetry={reload} />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Goal" onBack={() => router.back()} />
        <View style={styles.scroll}>
          <SkeletonCard height={180} />
          <SkeletonCard height={120} />
        </View>
      </View>
    );
  }

  // Not found: reached only after the error/loading guards above, so this is a
  // clean load (!error && !loading) where the goal simply doesn't exist.
  if (goal == null) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Goal" onBack={() => router.back()} />
        <EmptyState icon="target" title="Goal not found" body="This savings goal may have been deleted." tint={colors.textSecondary} />
      </View>
    );
  }

  const p = goalProgress(saved, goal.target);
  const est = estimatedCompletion(p.remaining, goal.allocation, goal.frequency);
  const monthly = monthlyContribution(goal.allocation, goal.frequency);
  const isOverfunded = saved > goal.target;
  const surplus = isOverfunded ? saved - goal.target : 0;
  const hasDate = goal.target_date != null;
  const monthsLeft = hasDate ? monthsUntil(goal.target_date!) : 0;
  const needed = hasDate ? neededPerMonth(p.remaining, goal.target_date!) : 0;
  const shortfall = Math.max(0, needed - monthly);
  const RING_CIRC = 2 * Math.PI * 50;

  async function handleAdd() {
    const a = parseToPaise(amt);
    if (a <= 0) return;
    try {
      // Fund the goal directly from Cash available.
      const justCompleted = goal !== null && saved < goal.target && saved + a >= goal.target;
      await fundGoal(db, id, a);
      haptic.success();
      setAmt(''); setShowAdd(false);
      await reload();
      if (justCompleted) setCelebrate(true);
    } catch {
      haptic.error();
      Alert.alert('Something went wrong', 'Please try again.');
    }
  }

  async function handleWithdraw() {
    const a = parseToPaise(amt);
    if (a <= 0) return;
    try {
      await withdrawFromGoal(db, id, Math.min(a, saved));
      haptic.warning();
      setAmt(''); setShowWithdraw(false);
      await reload();
    } catch {
      haptic.error();
      Alert.alert('Something went wrong', 'Please try again.');
    }
  }

  function openAdjust() {
    if (!goal) return;
    setAdjustName(goal.name);
    setAdjustTarget((goal.target / 100).toString());
    setAdjustAlloc(goal.allocation > 0 ? (goal.allocation / 100).toString() : '');
    setAdjustFreq(goal.frequency ?? 'monthly');
    setAdjustDate(goal.target_date ?? null);
    setShowAdjust(true);
  }

  async function handleAdjust() {
    if (!goal || adjustSaving) return;
    const newTarget = parseToPaise(adjustTarget);
    if (!adjustName.trim() || newTarget <= 0) return;
    setAdjustSaving(true);
    try {
      await updateGoal(db, id, {
        name: adjustName.trim(),
        target: newTarget,
        priority: goal.priority,
        category: goal.category,
        icon: goal.icon,
        color: goal.color,
        allocation: adjustAlloc.trim() ? parseToPaise(adjustAlloc) : 0,
        frequency: adjustFreq,
        locked: goal.locked === 1,
        target_date: adjustDate,
      });
      haptic.success();
      setShowAdjust(false);
      await reload();
    } catch {
      haptic.error();
      Alert.alert('Something went wrong', 'Could not save changes.');
    } finally {
      setAdjustSaving(false);
    }
  }

  async function toggleLock() {
    await setGoalLocked(db, id, goal!.locked !== 1);
    haptic.selection();
    await reload();
  }

  function confirmDelete() {
    Alert.alert('Delete goal?', `“${goal!.name}” will be removed and its ${formatRupees(saved)} returns to your Cash available.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          // Capture the goal + its ledger so the delete can be undone.
          const snapshot = goal!;
          const ledger = await getGoalHistory(db, id);
          await deleteGoal(db, id);
          haptic.warning();
          router.back();
          showUndo({
            message: `Deleted “${snapshot.name}”`,
            onUndo: async () => { try { await restoreGoal(db, snapshot, ledger); refresh(); } catch { /* ignore */ } },
          });
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={goal.name} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Hero — progress ring + amounts */}
        <View style={styles.heroCard}>
          <View style={styles.ringWrap}>
            <Svg width={120} height={120} viewBox="0 0 120 120" style={styles.ring}>
              <Circle cx={60} cy={60} r={50} stroke={colors.border} strokeWidth={8} fill="none" />
              <Circle
                cx={60} cy={60} r={50}
                stroke={isOverfunded ? colors.healthAmber : colors.income}
                strokeWidth={8} strokeLinecap="round" fill="none"
                strokeDasharray={`${RING_CIRC} ${RING_CIRC}`}
                strokeDashoffset={RING_CIRC * (1 - Math.min(p.pct, 100) / 100)}
              />
            </Svg>
            <View style={styles.ringCenter}>
              <Text style={styles.ringPct}>{p.pct}%</Text>
              <Text style={styles.ringLabel}>saved</Text>
            </View>
          </View>

          <View style={[styles.heroIcon, { backgroundColor: (goal.color ?? colors.accent) + '22' }]}>
            <Feather name={asFeather(goal.icon, 'target')} size={20} color={goal.color ?? colors.accent} />
          </View>
          <Text style={styles.heroName}>{goal.name}</Text>
          <Text style={styles.heroDate}>
            {hasDate
              ? `${format(goal.target_date!, 'MMM yyyy')} · ${monthsLeft <= 0 ? 'due now' : `${monthsLeft} ${monthsLeft === 1 ? 'month' : 'months'} away`}`
              : (isOverfunded ? 'Overfunded' : 'No deadline set')}
          </Text>

          <View style={styles.amountsRow}>
            <AmountTile label="Saved" value={formatCompact(p.saved)} tint={isOverfunded ? colors.healthAmber : colors.income} />
            <AmountTile label="Remaining" value={formatCompact(p.remaining)} tint={colors.textSecondary} />
            <AmountTile label="Goal" value={formatCompact(p.target)} tint={colors.textPrimary} />
          </View>
        </View>

        {/* Monthly contribution */}
        <View style={styles.monthlyCard}>
          <Text style={styles.sectionLabel}>MONTHLY CONTRIBUTION</Text>
          <View style={styles.monthlyRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.monthlySub}>Auto-sweep</Text>
              <Text style={[styles.monthlyAmt, { color: colors.accent }]}>{monthly > 0 ? formatCompact(monthly) : '—'}</Text>
            </View>
            {hasDate && (
              <>
                <View style={styles.monthlyDivider} />
                <View style={{ flex: 1, paddingLeft: space.sm }}>
                  <Text style={styles.monthlySub}>Needed to hit goal</Text>
                  <Text style={[styles.monthlyAmt, { color: shortfall > 0 ? colors.healthAmber : colors.income }]}>
                    {needed > 0 ? formatCompact(needed) : '—'}
                  </Text>
                </View>
              </>
            )}
          </View>
          {hasDate ? (
            shortfall > 0 ? (
              <View style={styles.monthlyNudge}>
                <View style={styles.nudgeDot} />
                <Text style={styles.nudgeText}>Increase by {formatCompact(shortfall)}/mo to stay on track</Text>
              </View>
            ) : (
              <View style={[styles.monthlyNudge, { borderColor: colors.income + '44' }]}>
                <View style={[styles.nudgeDot, { backgroundColor: colors.income }]} />
                <Text style={[styles.nudgeText, { color: colors.income }]}>On track to finish by {format(goal.target_date!, 'MMM yyyy')}</Text>
              </View>
            )
          ) : (
            <Text style={styles.monthlyHint}>Set a target date in Adjust to see how much to save each month.</Text>
          )}
        </View>

        {/* Overfunded nudge */}
        {isOverfunded && (
          <View style={styles.surplusBanner}>
            <Feather name="trending-up" size={16} color={colors.healthAmber} />
            <Text style={styles.surplusText}>
              {formatCompact(surplus)} over target — well done!
            </Text>
            <View style={styles.surplusActions}>
              <TouchableOpacity style={styles.surplusBtn} onPress={() => router.push('/savings' as any)} accessibilityRole="button">
                <Text style={styles.surplusBtnText}>New goal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.surplusBtn} onPress={() => { setAmt((surplus / 100).toString()); setShowWithdraw(true); }} accessibilityRole="button">
                <Text style={styles.surplusBtnText}>Withdraw {formatCompact(surplus)}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* History */}
        <Text style={styles.sectionTitle}>Recent</Text>
        {history.length > 0 ? (
          <View style={styles.histCard}>
            {history.map((h, i) => {
              const m = KIND_META[h.kind];
              return (
                <View key={h.id} style={[styles.histRow, i < history.length - 1 && styles.histBorder]}>
                  <View style={[styles.histIcon, { backgroundColor: m.color + '22' }]}>
                    <Feather name={m.icon} size={15} color={m.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.histLabel}>{m.label}{h.source === 'auto' ? ' · auto' : ''}</Text>
                    <Text style={styles.histDate}>{format(new Date(h.date), 'dd MMM yyyy')}</Text>
                  </View>
                  <Text style={[styles.histAmt, { color: h.kind === 'withdraw' ? colors.expense : colors.income }]}>
                    {h.kind === 'withdraw' ? '−' : '+'}{formatRupees(h.amount)}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : (
          <EmptyState icon="inbox" title="No contributions yet" body="Add funds to start filling this goal." tint={colors.textSecondary} />
        )}

        {/* Actions — Add to goal (primary) + Adjust, with secondary withdraw/lock */}
        <View style={styles.actionRow}>
          <PrimaryButton label="Add to goal" onPress={() => { setAmt(''); setShowAdd(true); }} style={{ flex: 2 }} />
          <TouchableOpacity style={styles.adjustBtn} onPress={openAdjust} accessibilityRole="button" accessibilityLabel="Adjust goal">
            <Text style={styles.adjustText}>Adjust</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.secondaryRow}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => { setAmt(''); setShowWithdraw(true); }} accessibilityRole="button" accessibilityLabel="Withdraw">
            <Feather name="arrow-up-circle" size={16} color={colors.textSecondary} />
            <Text style={styles.secondaryText}>Withdraw</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={toggleLock} accessibilityRole="button" accessibilityLabel={goal.locked ? 'Unlock goal' : 'Lock goal'}>
            <Feather name={goal.locked ? 'lock' : 'unlock'} size={16} color={goal.locked ? colors.accent : colors.textSecondary} />
            <Text style={[styles.secondaryText, !!goal.locked && { color: colors.accent }]}>{goal.locked ? 'Locked' : 'Lock'}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete} accessibilityRole="button">
          <Feather name="trash-2" size={16} color={colors.expense} />
          <Text style={styles.deleteText}>Delete goal</Text>
        </TouchableOpacity>
      </ScrollView>

      <SheetModal visible={showAdd} onClose={() => setShowAdd(false)} title="Add funds">
        <TextInput style={styles.amountInput} value={amt} onChangeText={setAmt} keyboardType="decimal-pad" placeholder="₹0" placeholderTextColor={colors.textMuted} autoFocus accessibilityLabel="Amount" />
        <Text style={styles.hint}>{formatCompact(cashAvailable)} cash available · comes out of your Cash available.</Text>
        <PrimaryButton label="Add to goal" onPress={handleAdd} disabled={parseToPaise(amt) <= 0} />
      </SheetModal>

      <SheetModal visible={showWithdraw} onClose={() => setShowWithdraw(false)} title="Withdraw to cash">
        <TextInput style={styles.amountInput} value={amt} onChangeText={setAmt} keyboardType="decimal-pad" placeholder="₹0" placeholderTextColor={colors.textMuted} autoFocus accessibilityLabel="Amount" />
        <Text style={styles.hint}>{formatCompact(saved)} saved · returns to your Cash available.</Text>
        <PrimaryButton label="Withdraw" onPress={handleWithdraw} disabled={parseToPaise(amt) <= 0} />
      </SheetModal>

      {/* Adjust goal sheet */}
      <SheetModal visible={showAdjust} onClose={() => setShowAdjust(false)} title="Adjust goal">
        <Text style={styles.adjLabel}>Goal name</Text>
        <TextInput
          style={styles.adjInput}
          value={adjustName}
          onChangeText={setAdjustName}
          placeholder="e.g. Emergency fund"
          placeholderTextColor={colors.textMuted}
          maxLength={40}
          accessibilityLabel="Goal name"
        />
        <Text style={styles.adjLabel}>Target amount</Text>
        <TextInput
          style={styles.adjInput}
          value={adjustTarget}
          onChangeText={setAdjustTarget}
          keyboardType="decimal-pad"
          placeholder="₹0"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Target amount"
        />
        <Text style={styles.adjLabel}>Auto-save per period (optional)</Text>
        <TextInput
          style={styles.adjInput}
          value={adjustAlloc}
          onChangeText={setAdjustAlloc}
          keyboardType="decimal-pad"
          placeholder="₹0"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Allocation amount"
        />
        <Text style={styles.adjLabel}>Frequency</Text>
        <View style={styles.freqRow}>
          {(['none', 'daily', 'monthly', 'yearly'] as SavingsFrequency[]).map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.freqChip, adjustFreq === f && styles.freqChipActive]}
              onPress={() => setAdjustFreq(f)}
              accessibilityRole="button"
              accessibilityState={{ selected: adjustFreq === f }}
            >
              <Text style={[styles.freqChipText, adjustFreq === f && styles.freqChipTextActive]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.adjLabel}>Target date (optional)</Text>
        <View style={styles.freqRow}>
          {DEADLINE_OPTS.map(o => {
            const on = deadlineOn(adjustDate, o.months);
            return (
              <TouchableOpacity
                key={o.label}
                style={[styles.freqChip, on && styles.freqChipActive]}
                onPress={() => setAdjustDate(o.months === null ? null : addMonths(new Date(), o.months).getTime())}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.freqChipText, on && styles.freqChipTextActive]}>{o.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {adjustDate != null && <Text style={styles.deadlineHint}>Target: {format(adjustDate, 'MMMM yyyy')}</Text>}

        <PrimaryButton
          label="Save changes"
          onPress={handleAdjust}
          disabled={!adjustName.trim() || parseToPaise(adjustTarget) <= 0}
          loading={adjustSaving}
        />
      </SheetModal>

      <GoalCelebration visible={celebrate} goalName={goal.name} onDone={() => setCelebrate(false)} />
    </View>
  );
}

function AmountTile({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <View style={styles.amtTile}>
      <Text style={[styles.amtTileValue, { color: tint }]} numberOfLines={1}>{value}</Text>
      <Text style={styles.amtTileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.md, paddingBottom: space.lg },

  heroCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, alignItems: 'center', ...shadow.md },
  ringWrap: { width: 120, height: 120, marginBottom: space.md, alignItems: 'center', justifyContent: 'center' },
  ring: { transform: [{ rotate: '-90deg' }] },
  ringCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  ringPct: { fontFamily: 'SpaceMono_400Regular', fontSize: 24, color: colors.textPrimary, letterSpacing: -1 },
  ringLabel: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  heroIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  heroName: { ...type.subheading, color: colors.textPrimary },
  heroDate: { ...type.label, color: colors.textSecondary, marginTop: 2, marginBottom: space.md, textTransform: 'capitalize' },
  amountsRow: { flexDirection: 'row', gap: space.sm, alignSelf: 'stretch' },
  amtTile: { flex: 1, backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: 10, paddingHorizontal: space.sm, alignItems: 'center' },
  amtTileValue: { fontFamily: 'SpaceMono_400Regular', fontSize: 16, letterSpacing: -0.5, marginBottom: 2 },
  amtTileLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 10 },

  monthlyCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, ...shadow.sm },
  sectionLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Inter_600SemiBold', marginBottom: space.sm },
  monthlyRow: { flexDirection: 'row', alignItems: 'flex-start' },
  monthlySub: { ...type.caption, color: colors.textMuted, marginBottom: space.xs },
  monthlyAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 18, letterSpacing: -0.5 },
  monthlyDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border },
  monthlyNudge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm, backgroundColor: colors.bg, borderRadius: radius.sm, paddingVertical: space.sm, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.healthAmber + '44' },
  nudgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.healthAmber },
  nudgeText: { ...type.caption, color: colors.healthAmber, flex: 1 },
  monthlyHint: { ...type.caption, color: colors.textMuted, marginTop: space.sm, lineHeight: 16 },

  actionRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  adjustBtn: { flex: 1, height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  adjustText: { ...type.button, color: colors.accent },
  secondaryRow: { flexDirection: 'row', gap: space.sm },
  secondaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingVertical: space.sm + 2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard },
  secondaryText: { ...type.label, color: colors.textSecondary },
  deadlineHint: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  dateBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bgInput, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm + 2, borderWidth: 1, borderColor: colors.border },
  dateBtnText: { ...type.body, color: colors.textMuted },
  dateClear: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },

  sectionTitle: { ...type.label, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: space.sm },
  histCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, ...shadow.sm },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  histBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  histIcon: { width: 32, height: 32, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  histLabel: { ...type.body, color: colors.textPrimary },
  histDate: { ...type.caption, color: colors.textMuted, marginTop: 1 },
  histAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 14 },

  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: space.md, marginTop: space.sm },
  deleteText: { ...type.body, color: colors.expense, fontFamily: 'Inter_600SemiBold' },

  amountInput: { fontFamily: 'SpaceMono_400Regular', fontSize: 32, color: colors.textPrimary, textAlign: 'center', paddingVertical: space.md },
  hint: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginBottom: space.md },

  surplusBanner: {
    backgroundColor: colors.healthAmber + '18',
    borderWidth: 1,
    borderColor: colors.healthAmber + '55',
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  surplusText: { ...type.body, color: colors.healthAmber, flex: 1, fontFamily: 'Inter_600SemiBold', flexShrink: 1 },
  surplusActions: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  surplusBtn: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.healthAmber + '66', backgroundColor: colors.healthAmber + '22' },
  surplusBtnText: { ...type.caption, color: colors.healthAmber, fontFamily: 'Inter_600SemiBold' },

  adjLabel: { ...type.caption, color: colors.textSecondary, marginBottom: space.xs, marginTop: space.sm },
  adjInput: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, borderWidth: 1, borderColor: colors.border },
  freqRow: { flexDirection: 'row', gap: space.xs, marginBottom: space.sm, flexWrap: 'wrap' },
  freqChip: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: colors.bgMuted, borderWidth: 1, borderColor: colors.border },
  freqChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  freqChipText: { ...type.label, color: colors.textSecondary },
  freqChipTextActive: { color: colors.bg, fontFamily: 'Inter_600SemiBold' },
});
