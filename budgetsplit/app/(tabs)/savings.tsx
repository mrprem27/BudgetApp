import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';

import { useRouter, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, layout, alpha } from '../../src/theme';
import { asFeather, GOAL_COLORS, GOAL_ICONS } from '../../src/constants/palette';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { PrimaryButton } from '../../src/components/ui/PrimaryButton';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { DraggableList } from '../../src/components/ui/DraggableList';
import { Input } from '../../src/components/ui/Input';
import { AppRefreshControl } from '../../src/components/ui/AppRefreshControl';
import { TabPills } from '../../src/components/ui/TabPills';

import { GoalCard } from '../../src/components/finance/plan/GoalCard';
import { TotalMoneyCard } from '../../src/components/finance/plan/TotalMoneyCard';
import { MoneyEditorSheet } from '../../src/components/finance/plan/MoneyEditorSheet';
import { PayCardBillSheet } from '../../src/components/finance/plan/PayCardBillSheet';
import { MoveMoneySheet } from '../../src/components/finance/plan/MoveMoneySheet';
import { AmountRow } from '../../src/components/ui/AmountRow';
import { useAssets } from '../../src/hooks/useAssets';
import { AssetsSection } from '../../src/components/finance/plan/AssetsSection';
import { AffordHeroCard } from '../../src/components/finance/plan/AffordHeroCard';
import { HeaderIconButton } from '../../src/components/ui/HeaderIconButton';
import { Card } from '../../src/components/ui/Card';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { formatCompact, parseToPaise, paiseToInput } from '../../src/lib/money';

import { addMonths, differenceInCalendarMonths } from 'date-fns';
import { monthLabel } from '../../src/lib/dateFormat';

// Goal deadline as quick durations (avoids a fragile date-picker modal-in-modal).
const DEADLINE_OPTS: { label: string; months: number | null }[] = [
  { label: 'None', months: null },
  { label: '3 mo', months: 3 },
  { label: '6 mo', months: 6 },
  { label: '1 yr', months: 12 },
  { label: '2 yr', months: 24 },
];
/** The option a date was picked from — the nearest one, so a month turning over while the sheet is open still highlights it. */
function nearestDeadline(dateMs: number | null): number | null {
  if (dateMs === null) return null;
  const months = differenceInCalendarMonths(dateMs, new Date());
  const picks = DEADLINE_OPTS.flatMap(o => (o.months === null ? [] : [o.months]));
  return picks.reduce((best, m) => (Math.abs(m - months) < Math.abs(best - months) ? m : best));
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

import { useFeatureFlags } from '../../src/components/system/FeatureFlagsProvider';

import { useContentInset } from '../../src/hooks/useContentInset';
import { useSavingsTab } from '../../src/hooks/useSavingsTab';

// Plan screen (design Screen 3) = Pool + Goals + Upcoming + Forecast only.
// Everything else the app had is hidden behind this toggle for now — handle later.

const FREQS: { key: SavingsFrequency; label: string }[] = [
  { key: 'none', label: 'None' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];

type MoneyTab = 'overview' | 'assets' | 'goals';

export default function SavingsScreen() {
  const router = useRouter();
  // `useContentInset`, not a hand-rolled sum. The previous expression cleared the
  // tab bar but not the "New" FAB floating above it, so the last goal card sat
  // underneath the button — the exact failure `useContentInset` was written for.
  // No `fab`: this tab's + is the tab bar's, which `tabBar` already clears.
  const contentInset = useContentInset({ tabBar: true });
  const { flags } = useFeatureFlags();
  const [tab, setTab] = useState<MoneyTab>('overview');
  // Move money opened from the "Paid from not set" line, so it opens on that money.
  const [moveUnset, setMoveUnset] = useState(false);
  const assetsData = useAssets();
  // A link can open a section (`/savings?tab=goals`) — "Save toward it in a goal" must land on goals.
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  useEffect(() => {
    if (tabParam === 'overview' || tabParam === 'assets' || tabParam === 'goals') setTab(tabParam);
  }, [tabParam]);
  // Turning goals off while on that section must not leave a blank screen.
  useEffect(() => { if (!flags.savingsGoals && tab === 'goals') setTab('overview'); }, [flags.savingsGoals, tab]);
  // All state, reads and write-handlers live in the hook; this screen renders.
  const {
    goals, saved, money, profile, assets, byBucket, unattributed, inGoals,
    loading, error, refreshing, onRefresh, reload,
    overspend, applied, handleApproveOverspend, handleUndoOverspend, handleDismissOverspend,
    showMoneyEditor, setShowMoneyEditor, handleSaveMoney,
    showPayCardBill, setShowPayCardBill, handlePayCardBill, cardBillAccounts,
    showMoveInvest, setShowMoveInvest, handleMoveMoney,
    fundGoalId, setFundGoalId, fundGoalObj, fundAmt, setFundAmt, handleFundGoal,
    showNew, setShowNew, name, setName, target, setTarget,
    priority, setPriority, icon, setIcon, color, setColor,
    allocation, setAllocation, frequency, setFrequency, newDate, setNewDate,
    resetNew, handleCreate, handleReorder, showReorderHint,
  } = useSavingsTab();
  const notSet = unattributed ?? 0;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Money"
        large
        right={(
          <>
            {/* One door each (`U-12`): Recurring here, Afford as the card in the body (Overview and Goals, `U-46`). */}
            {flags.recurring && <HeaderIconButton icon="refresh-cw" color={colors.accent} label="Recurring" showLabel onPress={() => router.push('/plan/recurring')} />}
          </>
        )}
      />
      {/* Three sections, one thing each: what you can spend, what you own, what you're saving for. */}
      <View style={styles.tabsWrap}>
        <TabPills
          tabs={[
            { key: 'overview', label: 'Overview' },
            { key: 'assets', label: 'Assets' },
            ...(flags.savingsGoals ? [{ key: 'goals', label: 'Goals' }] : []),
          ]}
          active={tab}
          onChange={k => setTab(k as MoneyTab)}
        />
      </View>
      {error ? (
        <ErrorState onRetry={() => reload()} />
      ) : (
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: contentInset }]} refreshControl={tab === 'assets'
        ? <AppRefreshControl refreshing={assetsData.refreshing} onRefresh={assetsData.onRefresh} />
        : <AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {tab === 'overview' && (
          <>

        {/* Total Money — cash + assets + available credit, with breakdown */}
        {money && (
          <TotalMoneyCard
            money={money}
            byBucket={byBucket}
            unattributed={unattributed}
            inGoals={inGoals}
            updatedAt={profile.updatedAt}
            assets={assets}
            onEdit={() => setShowMoneyEditor(true)}
            onPayCardBill={() => setShowPayCardBill(true)}
            onMoveToInvestments={() => { setMoveUnset(false); setShowMoveInvest(true); }}
            onManageAssets={() => setTab('assets')}
            onManageAccounts={() => router.push('/accounts')}
            onSetUnattributed={() => { setMoveUnset(true); setShowMoveInvest(true); }}
          />
        )}

        {/* Directly under your money, the question you ask of it (`U-46`). The same card leads
            Goals, where the answer is often "save toward it". */}
        {flags.affordCheck && <AffordHeroCard onPress={() => router.push('/afford')} />}

        {/* The charges due this month were listed under here as well; they are the Upcoming screen's
            (the bell on Home), so the list is gone and the heading stays for the shortfall (`U-96`). */}
        {(overspend?.total ?? 0) > 0 && <SectionHeader title="This month" />}

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
                <TouchableOpacity hitSlop={8} style={styles.overspendPrimary} onPress={handleApproveOverspend} accessibilityRole="button" accessibilityLabel={`Use savings to cover ${formatCompact(overspend.total)}`}>
                  <Text style={styles.overspendPrimaryText}>Use savings</Text>
                </TouchableOpacity>
                <TouchableOpacity hitSlop={8} style={styles.overspendGhost} onPress={handleDismissOverspend} accessibilityRole="button" accessibilityLabel="Keep my goals untouched">
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

          </>
        )}

        {tab === 'assets' && <AssetsSection assets={assetsData} />}

        {tab === 'goals' && (
          <>
        {/* "Can I afford this?" leads Goals: it is the question you ask before a purchase, and
            the answer is often "save toward it" (`U-29`). */}
        {flags.affordCheck && <AffordHeroCard onPress={() => router.push('/afford')} />}
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
            {/* Said once, quietly, and only until the first drag lands. It used to be
                appended to every section header with >1 goal — up to three shouts of
                the same sentence — alongside a drag handle on every card. The handle
                is gone too, so this is now the affordance. */}
            {showReorderHint && activeGoals.length > 1 && (
              <Text style={styles.sectionHint}>Hold and drag a goal to change its funding order</Text>
            )}
            {PRIORITY.map(tag => {
              const tagGoals = byTag(tag);
              if (tagGoals.length === 0) return null;
              return (
                <View key={tag} style={styles.tagSection}>
                  <Text style={styles.tagLabel}>{PRIORITY_LABEL[tag].toUpperCase()}</Text>
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
            body="Turn unused money into something you want, a phone, a trip, an emergency fund. Create your first goal."
            actionLabel="New goal"
            onAction={() => { resetNew(); setShowNew(true); }}
          />
        ))}

          </>
        )}

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
        // Today's balances, so the editor's sum reads exactly like the card behind it.
        current={byBucket}
        unattributed={unattributed}
        inGoals={inGoals}
        onSave={handleSaveMoney}
        onManageAssets={() => { setShowMoneyEditor(false); setTab('assets'); }}
        onManageAccounts={() => { setShowMoneyEditor(false); router.push('/accounts'); }}
      />

      {/* Opens as bank → your first asset (the common "I bought an investment" case); ⇅ flips it,
          and any place can be either end. From the "Paid from not set" line it opens on that money
          instead (`U-99`): out of Not set when it holds some, into it from the bank when it is
          spending with no source, the whole amount filled in and yours to lower. */}
      <MoveMoneySheet
        visible={showMoveInvest}
        onClose={() => setShowMoveInvest(false)}
        assets={assets}
        bucketBalances={byBucket}
        unset={notSet}
        from={moveUnset && notSet >= 0 ? { kind: 'unset' } : { kind: 'bucket', bucket: 'bank' }}
        to={moveUnset ? (notSet >= 0 ? { kind: 'bucket', bucket: 'bank' } : { kind: 'unset' })
          : assets[0] ? { kind: 'asset', id: assets[0].id } : { kind: 'bucket', bucket: 'cash' }}
        amount={moveUnset && notSet !== 0 ? paiseToInput(Math.abs(notSet)) : ''}
        onMove={handleMoveMoney}
      />

      <PayCardBillSheet
        visible={showPayCardBill}
        onClose={() => setShowPayCardBill(false)}
        creditUsed={money?.creditUsed ?? 0}
        accounts={cardBillAccounts}
        onPay={handlePayCardBill}
      />

      {/* Fund a goal directly from cash */}
      <SheetModal visible={fundGoalId !== null} onClose={() => setFundGoalId(null)} title={fundGoalObj ? `Add to ${fundGoalObj.name}` : 'Add to goal'}>
        <Card clip style={styles.amountCard}>
          <AmountRow icon="plus-circle" label="Amount" value={fundAmt} onChangeText={setFundAmt} autoFocus />
        </Card>
        <Text style={styles.hint}>
          {money ? `${formatCompact(money.cashAvailable)} cash available · ` : ''}comes out of your Cash available.
        </Text>
        <PrimaryButton label="Add to goal" onPress={handleFundGoal} disabled={parseToPaise(fundAmt) <= 0} />
      </SheetModal>

      {/* New goal sheet */}
      {/* No KeyboardAvoidingView: `DraggableSheet` already wraps every sheet in one.
          A second one double-pads inside an 88%-max-height sheet. */}
      <SheetModal visible={showNew} onClose={() => setShowNew(false)} title="New goal">
        <>
          <Input value={name} onChangeText={setName} placeholder="Goal name (e.g. New Phone)" autoCapitalize="words" maxLength={40} style={styles.inputGap} />

          <Card clip style={styles.amountCard}>
            <AmountRow icon="flag" label="Target" value={target} onChangeText={setTarget} />
          </Card>

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
              <TouchableOpacity hitSlop={8} key={ic} style={[styles.iconOpt, icon === ic && { backgroundColor: color }]} accessibilityState={{ selected: icon === ic }} onPress={() => setIcon(ic)} accessibilityRole="button" accessibilityLabel={ic}>
                <Feather name={asFeather(ic, 'tag')} size={18} color={icon === ic ? colors.bg : colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.colorRow}>
            {GOAL_COLORS.map(c => (
              <TouchableOpacity hitSlop={8} key={c} style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]} onPress={() => setColor(c)} accessibilityRole="button" accessibilityLabel={c} accessibilityState={{ selected: color === c }} />
            ))}
          </View>

          <Card clip style={styles.amountCard}>
            <AmountRow icon="repeat" label="Set aside each period" value={allocation} onChangeText={setAllocation} />
          </Card>
          {/* Pick-one choices are TabPills, like Priority above (AGENTS.md §9). */}
          <TabPills tabs={FREQS} active={frequency} onChange={k => setFrequency(k as SavingsFrequency)} size="sm" />

          <Text style={styles.fieldLabel}>Target date (optional)</Text>
          <TabPills
            tabs={DEADLINE_OPTS.map(o => ({ key: String(o.months), label: o.label }))}
            active={String(nearestDeadline(newDate))}
            onChange={k => setNewDate(k === 'null' ? null : addMonths(new Date(), Number(k)).getTime())}
            size="sm"
          />
          {newDate != null && <Text style={styles.deadlineHint}>Target: {monthLabel(newDate)}</Text>}

          <PrimaryButton label="Create goal" onPress={handleCreate} disabled={!name.trim() || parseToPaise(target) <= 0} style={{ marginTop: space.md }} />
        </>
      </SheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  amountCard: { marginBottom: space.md },
  tabsWrap: { paddingHorizontal: layout.screenPaddingH, paddingBottom: space.sm },
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

  // `flexShrink` on both this and the buttons, because Yoga defaults it to 0 (RN
  // does not use the web default) — and `ScreenHeader` gives its title `flex: 1`,
  // i.e. the only shrinkable thing in the row. At the default text size the four
  // labelled columns leave ~16pt of slack, but `type.caption` scales with Dynamic
  // Type, and without this the title collapsed to "…" first and then the rightmost
  // button ran off the screen edge, since the row does not clip.
  // A labelled column, not a disc: the tinted circle was carrying the whole burden
  // of "this is tappable", which is why four of them read as decoration. The label
  // does that job now, so the button is the icon over its name — and `touchMin`
  // keeps the target at §6's floor even though the painted glyph is 18pt.
  hint: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginBottom: space.md },
  inputGap: { marginBottom: space.sm },
  fieldLabel: { ...type.label, color: colors.textSecondary, marginTop: space.sm, marginBottom: space.xs },
  deadlineHint: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginBottom: space.sm },
  iconOpt: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.bgMuted, alignItems: 'center', justifyContent: 'center' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  swatch: { width: 28, height: 28, borderRadius: 14 },
  swatchActive: { borderWidth: 3, borderColor: colors.textPrimary },
});
