import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { colors } from '../../src/constants/colors';
import { type } from '../../src/constants/typography';
import { space, radius, layout, shadow } from '../../src/constants/layout';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { PrimaryButton } from '../../src/components/ui/PrimaryButton';
import { AmountText } from '../../src/components/ui/AmountText';
import { BudgetBar } from '../../src/components/finance/BudgetBar';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { formatRupees, parseToPaise } from '../../src/lib/money';
import { goalProgress, estimatedCompletion, monthlyContribution } from '../../src/lib/savings';
import { haptic } from '../../src/lib/haptics';
import {
  getGoalById, getGoalSavedMap, getPoolSummary, getGoalHistory,
  addToPool, allocateToGoal, withdrawFromGoal, setGoalLocked, deleteGoal,
  type SavingsGoal, type SavingsTxn, type Priority,
} from '../../src/db/queries/savings';

function priorityColor(p: Priority): string {
  return p === 'high' ? colors.coral : p === 'medium' ? colors.healthAmber : colors.textMuted;
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

  const [goal, setGoal] = useState<SavingsGoal | null>(null);
  const [saved, setSaved] = useState(0);
  const [unallocated, setUnallocated] = useState(0);
  const [history, setHistory] = useState<SavingsTxn[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [amt, setAmt] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useFocusEffect(useCallback(() => { load(); }, [id]));

  if (!id) { router.back(); return null; }

  async function load() {
    try {
      const [g, savedMap, pool, hist] = await Promise.all([
        getGoalById(db, id), getGoalSavedMap(db), getPoolSummary(db), getGoalHistory(db, id),
      ]);
      setGoal(g);
      setSaved(savedMap[id] ?? 0);
      setUnallocated(pool.unallocated);
      setHistory(hist);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  if (loadError) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Goal" onBack={() => router.back()} />
        <ErrorState onRetry={() => { setLoadError(false); setLoading(true); load(); }} />
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

  if (!goal) {
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

  async function handleAdd() {
    const a = parseToPaise(amt);
    if (a <= 0) return;
    try {
      // Pull from the unallocated pool; top it up first if there isn't enough.
      const shortfall = Math.max(0, a - unallocated);
      if (shortfall > 0) await addToPool(db, shortfall);
      await allocateToGoal(db, id, a);
      haptic.success();
      setAmt(''); setShowAdd(false);
      await load();
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
      await load();
    } catch {
      haptic.error();
      Alert.alert('Something went wrong', 'Please try again.');
    }
  }

  async function toggleLock() {
    await setGoalLocked(db, id, goal!.locked !== 1);
    haptic.selection();
    await load();
  }

  function confirmDelete() {
    Alert.alert('Delete goal?', `“${goal!.name}” will be removed and its ${formatRupees(saved)} returns to your savings pool.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteGoal(db, id); haptic.warning(); router.back(); } },
    ]);
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={goal.name} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Hero */}
        <View style={styles.heroCard}>
          <View style={[styles.heroIcon, { backgroundColor: (goal.color ?? colors.accent) + '22' }]}>
            <Feather name={(goal.icon ?? 'target') as any} size={24} color={goal.color ?? colors.accent} />
          </View>
          <AmountText paise={p.saved} size="xl" forceColor={colors.textPrimary} compact />
          <Text style={styles.heroSub}>of {formatRupees(p.target)} · {p.pct}%</Text>
          <View style={styles.heroBar}><BudgetBar pct={p.pct} health="green" height={8} /></View>
          <View style={styles.heroStats}>
            <Stat label="Remaining" value={formatRupees(p.remaining)} />
            <View style={styles.heroDivider} />
            <Stat label="Priority" value={goal.priority} tint={priorityColor(goal.priority)} cap />
            <View style={styles.heroDivider} />
            <Stat label={est ? 'Done by' : 'Per month'} value={est ? format(est.date, 'MMM yyyy') : (monthly > 0 ? formatRupees(monthly) : '—')} />
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionRow}>
          <PrimaryButton label="Add funds" onPress={() => { setAmt(''); setShowAdd(true); }} style={{ flex: 1 }} />
          <TouchableOpacity style={styles.iconBtn} onPress={() => { setAmt(''); setShowWithdraw(true); }} accessibilityRole="button" accessibilityLabel="Withdraw">
            <Feather name="arrow-up-circle" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={toggleLock} accessibilityRole="button" accessibilityLabel="Lock goal">
            <Feather name={goal.locked ? 'lock' : 'unlock'} size={20} color={goal.locked ? colors.accent : colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {goal.allocation > 0 && goal.frequency !== 'none' && (
          <Text style={styles.cadenceNote}>
            Auto-saving {formatRupees(goal.allocation)} / {goal.frequency}{est ? ` · ~${est.periods} ${goal.frequency} left` : ''}
          </Text>
        )}

        {/* History */}
        <Text style={styles.sectionTitle}>Contribution history</Text>
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

        <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete} accessibilityRole="button">
          <Feather name="trash-2" size={16} color={colors.expense} />
          <Text style={styles.deleteText}>Delete goal</Text>
        </TouchableOpacity>
      </ScrollView>

      <SheetModal visible={showAdd} onClose={() => setShowAdd(false)} title="Add funds">
        <TextInput style={styles.amountInput} value={amt} onChangeText={setAmt} keyboardType="decimal-pad" placeholder="₹0" placeholderTextColor={colors.textMuted} autoFocus accessibilityLabel="Amount" />
        <Text style={styles.hint}>{formatRupees(unallocated)} available in your pool · extra is added automatically.</Text>
        <PrimaryButton label="Add to goal" onPress={handleAdd} disabled={parseToPaise(amt) <= 0} />
      </SheetModal>

      <SheetModal visible={showWithdraw} onClose={() => setShowWithdraw(false)} title="Withdraw to pool">
        <TextInput style={styles.amountInput} value={amt} onChangeText={setAmt} keyboardType="decimal-pad" placeholder="₹0" placeholderTextColor={colors.textMuted} autoFocus accessibilityLabel="Amount" />
        <Text style={styles.hint}>{formatRupees(saved)} saved · returns to your unallocated pool.</Text>
        <PrimaryButton label="Withdraw" onPress={handleWithdraw} disabled={parseToPaise(amt) <= 0} />
      </SheetModal>
    </View>
  );
}

function Stat({ label, value, tint, cap }: { label: string; value: string; tint?: string; cap?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, tint ? { color: tint } : null, cap ? { textTransform: 'capitalize' } : null]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.md, paddingBottom: space.lg },

  heroCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, alignItems: 'center', ...shadow.md },
  heroIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  heroSub: { ...type.label, color: colors.textSecondary, marginTop: 2 },
  heroBar: { alignSelf: 'stretch', marginTop: space.md },
  heroStats: { flexDirection: 'row', alignItems: 'center', marginTop: space.md, alignSelf: 'stretch' },
  heroDivider: { width: 1, height: 28, backgroundColor: colors.border },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statLabel: { ...type.caption, color: colors.textMuted },
  statValue: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },

  actionRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  iconBtn: { width: 52, height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center' },
  cadenceNote: { ...type.caption, color: colors.textSecondary, textAlign: 'center' },

  sectionTitle: { ...type.label, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: space.sm },
  histCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, ...shadow.sm },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  histBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  histIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  histLabel: { ...type.body, color: colors.textPrimary },
  histDate: { ...type.caption, color: colors.textMuted, marginTop: 1 },
  histAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 14 },

  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: space.md, marginTop: space.sm },
  deleteText: { ...type.body, color: colors.expense, fontFamily: 'Inter_600SemiBold' },

  amountInput: { fontFamily: 'SpaceMono_400Regular', fontSize: 32, color: colors.textPrimary, textAlign: 'center', paddingVertical: space.md },
  hint: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginBottom: space.md },
});
