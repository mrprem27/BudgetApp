import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';

import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../src/constants/colors';
import { asFeather, GOAL_COLORS, GOAL_ICONS } from '../../src/constants/palette';
import { type } from '../../src/constants/typography';
import { space, radius, layout } from '../../src/constants/layout';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { PrimaryButton } from '../../src/components/ui/PrimaryButton';
import { BudgetBar } from '../../src/components/finance/BudgetBar';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { PressableScale } from '../../src/components/ui/PressableScale';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { DraggableList } from '../../src/components/ui/DraggableList';
import { Input } from '../../src/components/ui/Input';
import { AppRefreshControl } from '../../src/components/ui/AppRefreshControl';

import { ComingUpList } from '../../src/components/finance/home/ComingUpList';
import { GoalCard } from '../../src/components/finance/plan/GoalCard';
import { TotalMoneyCard } from '../../src/components/finance/plan/TotalMoneyCard';
import { MoneyEditorSheet } from '../../src/components/finance/plan/MoneyEditorSheet';
import { ForecastCard } from '../../src/components/finance/plan/ForecastCard';
import { formatCompact, parseToPaise } from '../../src/lib/money';

import { format, addMonths } from 'date-fns';

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

import { type Priority, type SavingsFrequency } from '../../src/db/queries/savings';

import type { MoneyProfile } from '../../src/lib/cash';
import { useFeatureFlags } from '../../src/components/system/FeatureFlagsProvider';

import { useScreenData } from '../../src/hooks/useScreenData';
import { useSavingsTab } from '../../src/hooks/useSavingsTab';
import { alpha } from '../../src/theme';

// Plan screen (design Screen 3) = Pool + Goals + Upcoming + Forecast only.
// Everything else the app had is hidden behind this toggle for now — handle later.

const FREQS: { key: SavingsFrequency; label: string }[] = [
  { key: 'none', label: 'None' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];

export default function SavingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { flags } = useFeatureFlags();
  // All state, reads and write-handlers live in the hook; this screen renders.
  const {
    goals, saved, money, profile, forecastMonthEnd, forecastBudget, upcoming,
    loading, error, refreshing, onRefresh, reload,
    overspend, setOverspend, handleUndoOverspend,
    showMoneyEditor, setShowMoneyEditor, handleSaveMoney,
    fundGoalId, setFundGoalId, fundGoalObj, fundAmt, setFundAmt, handleFundGoal,
    showNew, setShowNew, name, setName, target, setTarget,
    priority, setPriority, icon, setIcon, color, setColor,
    allocation, setAllocation, frequency, setFrequency, newDate, setNewDate,
    resetNew, handleCreate, handleReorder,
  } = useSavingsTab();

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Plan"
        large
        right={
          <View style={styles.headerRight}>
            {[
              { key: 'insights', icon: 'bar-chart-2' as const, label: 'Insights', show: true, to: '/insights' as Href },
              { key: 'subs', icon: 'refresh-cw' as const, label: 'Recurring', show: flags.recurring, to: '/plan/recurring' as Href },
              // Reminders is notification config — lives in Settings › Notifications & Reminders, not here.
              { key: 'afford', icon: 'help-circle' as const, label: 'Can I afford?', show: flags.affordCheck, to: '/afford' as Href },
            ].filter(m => m.show).map(m => (
              <TouchableOpacity key={m.key} style={styles.headerIconBtn} onPress={() => router.push(m.to)} accessibilityRole="button" accessibilityLabel={m.label}>
                <Feather name={m.icon} size={18} color={colors.accent} />
              </TouchableOpacity>
            ))}
          </View>
        }
      />
      {error ? (
        <ErrorState onRetry={() => reload()} />
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

        {/* Savings insights moved to the global Insights screen (header link above). */}

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
                    onPress={() => router.push(`/savings/${g.id}`)}
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
                    <GoalCard key={g.id} goal={g} saved={saved[g.id] ?? 0} isActive={false} completed onPress={() => router.push(`/savings/${g.id}`)} />
                  ))}
                </View>
              </View>
            )}
          </>
          );
        })() : loading ? null : (
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
              <TouchableOpacity key={ic} style={[styles.iconOpt, icon === ic && { backgroundColor: color }]} accessibilityState={{ selected: icon === ic }} onPress={() => setIcon(ic)} accessibilityRole="button" accessibilityLabel={ic}>
                <Feather name={asFeather(ic, 'tag')} size={18} color={icon === ic ? colors.bg : colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.colorRow}>
            {GOAL_COLORS.map(c => (
              <TouchableOpacity key={c} style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]} onPress={() => setColor(c)} accessibilityRole="button" accessibilityLabel={c} accessibilityState={{ selected: color === c }} />
            ))}
          </View>

          <Text style={styles.fieldLabel}>Fixed allocation (optional)</Text>
          <Input value={allocation} onChangeText={setAllocation} keyboardType="decimal-pad" placeholder="₹0 per period" style={styles.inputGap} />
          <View style={styles.segRow}>
            {FREQS.map(f => (
              <TouchableOpacity key={f.key} style={[styles.segSm, frequency === f.key && { backgroundColor: colors.accentMuted, borderColor: colors.accent }]} onPress={() => setFrequency(f.key)} accessibilityRole="button" accessibilityState={{ selected: frequency === f.key }}>
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

  overspendCard: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: alpha(colors.expense, 8), borderRadius: radius.lg, borderWidth: 1, borderColor: alpha(colors.expense, 25), padding: space.md },
  overspendIcon: { width: 32, height: 32, borderRadius: radius.lg, backgroundColor: alpha(colors.expense, 13), alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  overspendTitle: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  overspendBody: { ...type.caption, color: colors.textSecondary, marginTop: 1 },
  overspendActions: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexShrink: 0 },
  overspendUndo: { ...type.body, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  // Teal gradient pool card with accent label (design Screen 3). Gradient supplies the fill.

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xs },
  sectionTitle: { ...type.subheading, color: colors.textPrimary },
  sectionHint: { ...type.caption, color: colors.textMuted, marginTop: 1 },
  completedSection: { marginTop: space.md, gap: space.sm },
  completedLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Inter_600SemiBold', marginLeft: space.xs },
  // Insights sections
  newPill: { flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: colors.accentMuted, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6 },
  newPillText: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },

  headerRight: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  headerIconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  amountInput: { fontFamily: 'SpaceMono_400Regular', fontSize: 32, color: colors.textPrimary, textAlign: 'center', paddingVertical: space.md },
  hint: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginBottom: space.md },
  inputGap: { marginBottom: space.sm },
  fieldLabel: { ...type.label, color: colors.textSecondary, marginTop: space.sm, marginBottom: space.xs },
  deadlineHint: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
  segRow: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' },
  segSm: { paddingHorizontal: space.md, paddingVertical: space.sm, alignItems: 'center', borderRadius: radius.md, backgroundColor: colors.bgMuted, borderWidth: 1, borderColor: 'transparent' },
  segText: { ...type.label, color: colors.textSecondary },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginBottom: space.sm },
  iconOpt: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.bgMuted, alignItems: 'center', justifyContent: 'center' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  swatch: { width: 28, height: 28, borderRadius: 14 },
  swatchActive: { borderWidth: 3, borderColor: colors.textPrimary },
});
