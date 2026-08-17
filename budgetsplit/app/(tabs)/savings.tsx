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
import { TabPills } from '../../src/components/ui/TabPills';

import { ComingUpList } from '../../src/components/finance/home/ComingUpList';
import { GoalCard } from '../../src/components/finance/plan/GoalCard';
import { TotalMoneyCard } from '../../src/components/finance/plan/TotalMoneyCard';
import { MoneyEditorSheet } from '../../src/components/finance/plan/MoneyEditorSheet';
import { PayCardBillSheet } from '../../src/components/finance/plan/PayCardBillSheet';
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
import { PRIORITY, PRIORITY_LABEL } from '../../src/constants/enums';

// Order matches funding/raid weight: Emergency funds first & is never raided;
// Want funds last & is raided first. See src/lib/savingsEngine.ts.
const PRIORITY_TABS = PRIORITY.map(p => ({ key: p, label: PRIORITY_LABEL[p] }));
const PRIORITY_HINT: Record<Priority, string> = {
  emergency: 'Never dipped into if an overspend has to cover itself from goals.',
  need: 'Dipped into only after every Want goal is used up.',
  want: 'The first goals an overspend dips into, if any.',
};

import type { MoneyProfile } from '../../src/lib/cash';
import { useFeatureFlags } from '../../src/components/system/FeatureFlagsProvider';

import { useScreenData } from '../../src/hooks/useScreenData';
import { useContentInset } from '../../src/hooks/useContentInset';
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
  // `useContentInset`, not a hand-rolled sum. The previous expression cleared the
  // tab bar but not the "New" FAB floating above it, so the last goal card sat
  // underneath the button — the exact failure `useContentInset` was written for.
  const contentInset = useContentInset({ fab: true, tabBar: true });
  const { flags } = useFeatureFlags();
  // All state, reads and write-handlers live in the hook; this screen renders.
  const {
    goals, saved, money, profile, forecastMonthEnd, forecastBudget, upcoming,
    loading, error, refreshing, onRefresh, reload,
    overspend, applied, handleApproveOverspend, handleUndoOverspend, handleDismissOverspend,
    showMoneyEditor, setShowMoneyEditor, handleSaveMoney,
    showPayCardBill, setShowPayCardBill, handlePayCardBill,
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
              { key: 'insights', icon: 'bar-chart-2' as const, label: 'Insights', show: flags.insights, to: '/insights' as Href },
              // V2-08: Reports was reachable only from Settings › Data & Help, which is
              // where you look for an export, not for last month's numbers.
              { key: 'reports', icon: 'pie-chart' as const, label: 'Reports', show: flags.reports, to: '/reports' as Href },
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
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: contentInset }]} refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {/* Total Money — cash + investments + available credit, with breakdown */}
        {money && <TotalMoneyCard money={money} updatedAt={profile.updatedAt} onEdit={() => setShowMoneyEditor(true)} onPayCardBill={() => setShowPayCardBill(true)} />}

        {/* Overspend — ASKS before pulling from goals (`V2-10`). It used to move the
            money during app boot and tell you afterwards. */}
        {overspend && overspend.total > 0 && (
          <View style={styles.overspendCard}>
            <View style={styles.overspendIcon}>
              <Feather name="alert-triangle" size={16} color={colors.expense} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.overspendTitle}>You’re {formatCompact(overspend.total)} short this month</Text>
              {/* Per-goal ₹, not just names. `withdrawals` has carried `amount`
                  all along; listing names alone asked the user to approve a raid
                  on their savings without showing how much came out of which goal. */}
              <Text style={styles.overspendBody}>
                Cover it from {overspend.withdrawals.map(w => `${w.name} ${formatCompact(w.amount)}`).join(', ')}? Nothing moves unless you say so.
              </Text>
              <View style={styles.overspendBtnRow}>
                <TouchableOpacity style={styles.overspendPrimary} onPress={handleApproveOverspend} accessibilityRole="button" accessibilityLabel={`Use savings to cover ${formatCompact(overspend.total)}`}>
                  <Text style={styles.overspendPrimaryText}>Use savings</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.overspendGhost} onPress={handleDismissOverspend} accessibilityRole="button" accessibilityLabel="Keep my goals untouched">
                  <Text style={styles.overspendGhostText}>Keep goals</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Confirmation of a raid the user just approved, with Undo. */}
        {applied && applied.total > 0 && (
          <View style={styles.overspendCard}>
            <View style={styles.overspendIcon}>
              <Feather name="check" size={16} color={colors.expense} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.overspendTitle}>Covered {formatCompact(applied.total)} from savings</Text>
              <Text style={styles.overspendBody} numberOfLines={2}>
                Taken from {applied.withdrawals.map(w => w.name).join(', ')}.
              </Text>
            </View>
            <View style={styles.overspendActions}>
              <TouchableOpacity onPress={handleUndoOverspend} hitSlop={8} accessibilityRole="button" accessibilityLabel="Undo">
                <Text style={styles.overspendUndo}>Undo</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Savings insights moved to the global Insights screen (header link above). */}

        {/* Goals — three sections by priority tag (Emergency/Need/Want), each its
            own drag-rankable list for funding order within that tag; completed
            sink to the bottom, unsectioned. See src/lib/savingsEngine.ts for why
            the tag is the coarse order and drag is only the fine one. */}
        {flags.savingsGoals && (goals.length > 0 ? (() => {
          const activeGoals = goals.filter(g => (saved[g.id] ?? 0) < g.target);
          const completedGoals = goals.filter(g => (saved[g.id] ?? 0) >= g.target);
          const byTag = (tag: Priority) => activeGoals.filter(g => g.priority === tag);
          return (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Goals</Text>
              <TouchableOpacity style={styles.newPill} onPress={() => { resetNew(); setShowNew(true); }} accessibilityRole="button">
                <Feather name="plus" size={13} color={colors.accent} />
                <Text style={styles.newPillText}>New</Text>
              </TouchableOpacity>
            </View>
            {PRIORITY.map(tag => {
              const tagGoals = byTag(tag);
              if (tagGoals.length === 0) return null;
              return (
                <View key={tag} style={styles.tagSection}>
                  <Text style={styles.tagLabel}>
                    {PRIORITY_LABEL[tag].toUpperCase()}
                    {tagGoals.length > 1 ? ' · HOLD & DRAG TO REORDER' : ''}
                  </Text>
                  <DraggableList
                    data={tagGoals}
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
                </View>
              );
            })}
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

        {/* Recurring CHARGES due soon — one row per occurrence. Deliberately not the
            same list as /plan/recurring, which shows one row per rule: a yearly rule
            due in 11 months, or a paused/fully-skipped one, is a rule with no upcoming
            charge. Titled by its window so it can't read as the inventory, with an
            explicit link to the place that manages them. */}
        {upcoming.length > 0 && (
          // No "Manage" link: this screen's header already has a Recurring shortcut, so a
          // second entry point was pure clutter on a block whose job is to be glanced at.
          // The title does the work the link was hedging — "Due this month" is a window,
          // "Recurring" is the inventory.
          <ComingUpList items={upcoming} title="Due this month" showIcon />
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
        // The DERIVED credit-used, not the stored one: the card behind this sheet shows
        // stated-balance + card spend since the baseline, and a field that disagreed with
        // the number above it is how you talk someone into saving a stale figure.
        initial={{ ...profile, creditUsed: money?.creditUsed ?? profile.creditUsed }}
        onSave={handleSaveMoney}
      />

      <PayCardBillSheet
        visible={showPayCardBill}
        onClose={() => setShowPayCardBill(false)}
        creditUsed={money?.creditUsed ?? 0}
        onPay={handlePayCardBill}
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

          {/* Protect-from-raid tag, not the funding order — that's still drag
              order within the section this goal lands in. */}
          <Text style={styles.fieldLabel}>Priority</Text>
          <TabPills
            tabs={PRIORITY_TABS}
            active={priority}
            onChange={(k) => setPriority(k as Priority)}
            size="sm"
          />
          <Text style={styles.deadlineHint}>{PRIORITY_HINT[priority]}</Text>

          <Text style={[styles.fieldLabel, { marginTop: space.md }]}>Icon</Text>
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

  overspendBtnRow: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  overspendPrimary: { backgroundColor: colors.expense, borderRadius: radius.md, paddingHorizontal: space.md, height: 36, alignItems: 'center', justifyContent: 'center' },
  overspendPrimaryText: { ...type.caption, color: colors.onAccent, fontFamily: 'Inter_600SemiBold' },
  overspendGhost: { borderRadius: radius.md, paddingHorizontal: space.md, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: alpha(colors.expense, 33) },
  overspendGhostText: { ...type.caption, color: colors.expense, fontFamily: 'Inter_600SemiBold' },
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
  tagSection: { gap: space.sm },
  tagLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Inter_600SemiBold', marginLeft: space.xs },
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
