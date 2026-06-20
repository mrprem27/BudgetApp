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
import { AmountText } from '../../src/components/ui/AmountText';
import { BudgetBar } from '../../src/components/finance/BudgetBar';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { PressableScale } from '../../src/components/ui/PressableScale';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { formatRupees, formatCompact, parseToPaise } from '../../src/lib/money';
import { goalProgress } from '../../src/lib/savings';
import { haptic } from '../../src/lib/haptics';
import {
  getGoals, getGoalSavedMap, getPoolSummary, getCashPosition, addToPool, withdrawFromPool, insertGoal, runSavingsMaintenance, buildSavingsInsights,
  type SavingsGoal, type PoolSummary, type Priority, type SavingsFrequency,
} from '../../src/db/queries/savings';
import { getAllGroups } from '../../src/db/queries/groups';
import type { Insight } from '../../src/lib/savingsInsights';
import type { CashPosition } from '../../src/lib/cash';
import { useFeatureFlags } from '../../src/components/system/FeatureFlagsProvider';

const GOAL_ICONS = ['smartphone', 'monitor', 'map', 'navigation', 'home', 'gift', 'umbrella', 'shield', 'headphones', 'watch', 'camera', 'book', 'star', 'heart', 'award', 'target'];
const GOAL_COLORS = ['#20C4B8', '#F0A500', '#7C6AF7', '#3ECF8E', '#F472B6', '#FB923C', '#60A5FA', '#F06060'];

const PRIORITIES: { key: Priority; label: string }[] = [
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
];
const FREQS: { key: SavingsFrequency; label: string }[] = [
  { key: 'none', label: 'None' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];

export function priorityColor(p: Priority): string {
  return p === 'high' ? colors.coral : p === 'medium' ? colors.healthAmber : colors.textMuted;
}

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
  const [pool, setPool] = useState<PoolSummary>({ total: 0, allocated: 0, unallocated: 0 });
  const [cash, setCash] = useState<CashPosition | null>(null);
  const [personalId, setPersonalId] = useState('');
  const [insights, setInsights] = useState<Insight[]>([]);

  const [showAddPool, setShowAddPool] = useState(false);
  const [showWithdrawPool, setShowWithdrawPool] = useState(false);
  const [poolAmt, setPoolAmt] = useState('');

  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [icon, setIcon] = useState(GOAL_ICONS[0]);
  const [color, setColor] = useState(GOAL_COLORS[0]);
  const [allocation, setAllocation] = useState('');
  const [frequency, setFrequency] = useState<SavingsFrequency>('none');

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    await runSavingsMaintenance(db); // sweep + schedule + reconcile
    const [g, s, p, ins, c] = await Promise.all([getGoals(db), getGoalSavedMap(db), getPoolSummary(db), buildSavingsInsights(db), getCashPosition(db)]);
    setGoals(g);
    setSaved(s);
    setPool(p);
    setInsights(ins);
    setCash(c);
    const grps = await getAllGroups(db);
    setPersonalId(grps.find(g => g.is_personal === 1)?.id ?? '');
  }

  async function handleAddPool() {
    const amt = parseToPaise(poolAmt);
    if (amt <= 0) return;
    await addToPool(db, amt);
    haptic.success();
    setPoolAmt('');
    setShowAddPool(false);
    await load();
  }

  async function handleWithdrawPool() {
    const amt = Math.min(parseToPaise(poolAmt), pool.unallocated);
    if (amt <= 0) return;
    await withdrawFromPool(db, amt);
    haptic.success();
    setPoolAmt('');
    setShowWithdrawPool(false);
    await load();
  }

  function resetNew() {
    setName(''); setTarget(''); setPriority('medium'); setIcon(GOAL_ICONS[0]);
    setColor(GOAL_COLORS[0]); setAllocation(''); setFrequency('none');
  }

  async function handleCreate() {
    const t = parseToPaise(target);
    if (!name.trim() || t <= 0) return;
    await insertGoal(db, {
      name: name.trim(), target: t, priority, icon, color, category: name.trim(),
      allocation: parseToPaise(allocation), frequency,
    });
    haptic.success();
    setShowNew(false);
    resetNew();
    await load();
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Money" large />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + layout.tabBarHeight + space.lg }]}>
        {/* Cash available — your real money */}
        {cash && (
          <View style={styles.cashCard}>
            <Text style={styles.cashLabel}>Cash available</Text>
            <AmountText paise={cash.available} size="xl" forceColor={cash.available >= 0 ? colors.textPrimary : colors.expense} compact />
            <Text style={styles.cashBreak}>
              <Text style={{ color: colors.income }}>{formatCompact(cash.income)} in</Text>
              <Text style={styles.cashBreakSep}> · </Text>
              <Text style={{ color: colors.expense }}>{formatCompact(cash.paidExpenses + cash.settledOut)} out</Text>
              <Text style={styles.cashBreakSep}> · </Text>
              <Text style={{ color: colors.accent }}>{formatCompact(cash.savings)} saved</Text>
            </Text>
          </View>
        )}

        {/* Personal budget & spending (the personal ledger lives here now) */}
        {!!personalId && (
          <>
            <Text style={styles.moneySection}>Spending & budget</Text>
            <TouchableOpacity style={styles.personalCard} onPress={() => router.push(`/group/${personalId}` as any)} accessibilityRole="button" accessibilityLabel="Personal budget and spending">
              <View style={styles.personalIcon}><Feather name="book" size={18} color={colors.accent} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.personalTitle}>Personal budget & spending</Text>
                <Text style={styles.personalSub}>Your ledger, categories & limits</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </>
        )}

        {/* Savings pool */}
        <Text style={styles.moneySection}>Savings</Text>
        <View style={styles.poolCard}>
          <Text style={styles.poolLabel}>Savings Pool</Text>
          <AmountText paise={pool.total} size="xl" forceColor={colors.textPrimary} compact />
          <View style={styles.poolRow}>
            <View style={styles.poolStat}>
              <Text style={styles.poolStatLabel}>Allocated</Text>
              <AmountText paise={pool.allocated} size="sm" forceColor={colors.accent} compact />
            </View>
            <View style={styles.poolDivider} />
            <View style={styles.poolStat}>
              <Text style={styles.poolStatLabel}>Available</Text>
              <AmountText paise={pool.unallocated} size="sm" forceColor={colors.income} compact />
            </View>
          </View>
          <View style={styles.poolActions}>
            <TouchableOpacity style={styles.addPoolBtn} onPress={() => { setPoolAmt(''); setShowAddPool(true); }} accessibilityRole="button">
              <Feather name="plus" size={16} color={colors.accent} />
              <Text style={styles.addPoolText}>Add</Text>
            </TouchableOpacity>
            {pool.unallocated > 0 && (
              <TouchableOpacity style={styles.withdrawPoolBtn} onPress={() => { setPoolAmt(''); setShowWithdrawPool(true); }} accessibilityRole="button">
                <Feather name="arrow-up" size={16} color={colors.textSecondary} />
                <Text style={styles.withdrawPoolText}>Withdraw</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Insights */}
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
                  <Text style={styles.insightText}>{ins.text}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Goals */}
        {goals.length > 0 ? (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Goals</Text>
              <TouchableOpacity style={styles.newPill} onPress={() => { resetNew(); setShowNew(true); }} accessibilityRole="button">
                <Feather name="plus" size={13} color={colors.accent} />
                <Text style={styles.newPillText}>New</Text>
              </TouchableOpacity>
            </View>
            {goals.map(g => {
              const p = goalProgress(saved[g.id] ?? 0, g.target);
              return (
                <PressableScale key={g.id} style={styles.goalCard} onPress={() => router.push(`/savings/${g.id}` as any)} accessibilityLabel={g.name}>
                  <View style={styles.goalTop}>
                    <View style={[styles.goalIcon, { backgroundColor: (g.color ?? colors.accent) + '22' }]}>
                      <Feather name={asFeather(g.icon, 'target')} size={18} color={g.color ?? colors.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.goalName} numberOfLines={1}>{g.name}</Text>
                      <Text style={styles.goalSub}>{formatCompact(p.saved)} <Text style={styles.goalSubMuted}>of {formatCompact(p.target)}</Text></Text>
                    </View>
                    <View style={[styles.prioChip, { backgroundColor: priorityColor(g.priority) + '22' }]}>
                      <Text style={[styles.prioText, { color: priorityColor(g.priority) }]}>{g.priority}</Text>
                    </View>
                  </View>
                  <View style={styles.goalBarRow}>
                    <View style={{ flex: 1 }}>
                      <BudgetBar pct={p.pct} health={p.done ? 'green' : 'green'} height={6} />
                    </View>
                    <Text style={styles.goalPct}>{p.pct}%</Text>
                  </View>
                </PressableScale>
              );
            })}
          </>
        ) : (
          <EmptyState
            icon="target"
            title="No savings goals yet"
            body="Turn unused money into something you want — a phone, a trip, an emergency fund. Create your first goal."
            actionLabel="New goal"
            onAction={() => { resetNew(); setShowNew(true); }}
          />
        )}

        <View style={{ height: space.lg }} />
      </ScrollView>

      {/* Add to pool sheet */}
      <SheetModal visible={showAddPool} onClose={() => setShowAddPool(false)} title="Add to savings">
        <TextInput
          style={styles.amountInput}
          value={poolAmt}
          onChangeText={setPoolAmt}
          keyboardType="decimal-pad"
          placeholder="₹0"
          placeholderTextColor={colors.textMuted}
          autoFocus
          accessibilityLabel="Amount"
        />
        <Text style={styles.hint}>Money goes to your unallocated pool — assign it to goals anytime.</Text>
        <PrimaryButton label="Add" onPress={handleAddPool} disabled={parseToPaise(poolAmt) <= 0} />
      </SheetModal>

      {/* Withdraw from pool sheet */}
      <SheetModal visible={showWithdrawPool} onClose={() => setShowWithdrawPool(false)} title="Withdraw from savings">
        <TextInput
          style={styles.amountInput}
          value={poolAmt}
          onChangeText={setPoolAmt}
          keyboardType="decimal-pad"
          placeholder="₹0"
          placeholderTextColor={colors.textMuted}
          autoFocus
          accessibilityLabel="Amount"
        />
        <Text style={styles.hint}>{formatCompact(pool.unallocated)} available · returns to your spending money.</Text>
        <PrimaryButton label="Withdraw" onPress={handleWithdrawPool} disabled={parseToPaise(poolAmt) <= 0} />
      </SheetModal>

      {/* New goal sheet */}
      <SheetModal visible={showNew} onClose={() => setShowNew(false)} title="New goal">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Goal name (e.g. New Phone)" placeholderTextColor={colors.textMuted} />

          <Text style={styles.fieldLabel}>Target amount</Text>
          <TextInput style={styles.input} value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder="₹0" placeholderTextColor={colors.textMuted} />

          <Text style={styles.fieldLabel}>Priority</Text>
          <View style={styles.segRow}>
            {PRIORITIES.map(p => (
              <TouchableOpacity key={p.key} style={[styles.seg, priority === p.key && { backgroundColor: priorityColor(p.key) + '22', borderColor: priorityColor(p.key) }]} onPress={() => setPriority(p.key)} accessibilityRole="button">
                <Text style={[styles.segText, priority === p.key && { color: priorityColor(p.key), fontFamily: 'Inter_600SemiBold' }]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

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
          <TextInput style={styles.input} value={allocation} onChangeText={setAllocation} keyboardType="decimal-pad" placeholder="₹0 per period" placeholderTextColor={colors.textMuted} />
          <View style={styles.segRow}>
            {FREQS.map(f => (
              <TouchableOpacity key={f.key} style={[styles.segSm, frequency === f.key && { backgroundColor: colors.accentMuted, borderColor: colors.accent }]} onPress={() => setFrequency(f.key)} accessibilityRole="button">
                <Text style={[styles.segText, frequency === f.key && { color: colors.accent, fontFamily: 'Inter_600SemiBold' }]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <PrimaryButton label="Create goal" onPress={handleCreate} disabled={!name.trim() || parseToPaise(target) <= 0} style={{ marginTop: space.md }} />
        </KeyboardAvoidingView>
      </SheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.md },

  personalCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, ...shadow.sm },
  personalIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  personalTitle: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  personalSub: { ...type.caption, color: colors.textMuted, marginTop: 1 },
  cashCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, ...shadow.md },
  cashLabel: { ...type.label, color: colors.textSecondary, marginBottom: space.xs },
  cashBreak: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
  cashBreakSep: { color: colors.textMuted },
  poolCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, ...shadow.md },
  poolLabel: { ...type.label, color: colors.textSecondary, marginBottom: space.xs },
  poolRow: { flexDirection: 'row', alignItems: 'center', marginTop: space.md },
  poolStat: { flex: 1, alignItems: 'center', gap: 2 },
  poolStatLabel: { ...type.caption, color: colors.textMuted },
  poolDivider: { width: 1, height: 28, backgroundColor: colors.border },
  poolActions: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
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
  moneySection: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: space.md, marginBottom: space.xs, marginLeft: space.xs },
  newPill: { flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: colors.accentMuted, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6 },
  newPillText: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },

  goalCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm, ...shadow.sm },
  goalTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  goalIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  goalName: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  goalSub: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  goalSubMuted: { color: colors.textMuted },
  prioChip: { paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill },
  prioText: { ...type.caption, fontFamily: 'Inter_600SemiBold', textTransform: 'capitalize' },
  goalBarRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  goalPct: { ...type.caption, color: colors.textMuted, minWidth: 32, textAlign: 'right' },

  amountInput: { fontFamily: 'SpaceMono_400Regular', fontSize: 32, color: colors.textPrimary, textAlign: 'center', paddingVertical: space.md },
  hint: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginBottom: space.md },
  input: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border, marginBottom: space.sm },
  fieldLabel: { ...type.label, color: colors.textSecondary, marginTop: space.sm, marginBottom: space.xs },
  segRow: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' },
  seg: { flex: 1, minWidth: 80, paddingVertical: space.sm, alignItems: 'center', borderRadius: radius.md, backgroundColor: colors.bgMuted, borderWidth: 1, borderColor: 'transparent' },
  segSm: { paddingHorizontal: space.md, paddingVertical: space.sm, alignItems: 'center', borderRadius: radius.md, backgroundColor: colors.bgMuted, borderWidth: 1, borderColor: 'transparent' },
  segText: { ...type.label, color: colors.textSecondary },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginBottom: space.sm },
  iconOpt: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.bgMuted, alignItems: 'center', justifyContent: 'center' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  swatch: { width: 28, height: 28, borderRadius: 14 },
  swatchActive: { borderWidth: 3, borderColor: colors.textPrimary },
});
