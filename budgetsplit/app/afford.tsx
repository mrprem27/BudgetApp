import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useScreenData } from '../src/hooks/useScreenData';
import { Feather } from '@expo/vector-icons';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, radius, layout, shadow } from '../src/constants/layout';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { SecondaryButton } from '../src/components/ui/SecondaryButton';
import { ErrorState } from '../src/components/ui/ErrorState';
import { CategoryChip } from '../src/components/finance/CategoryChip';
import { getAffordSnapshot, type AffordSnapshot } from '../src/db/queries/savings';
import {
  evaluateAfford, AffordVerdict, AffordReason, AffordNecessity, incomeSharePct,
  type AffordContext, type AffordResult,
} from '../src/lib/afford';
import { parseToPaise, formatRupees, formatCompact } from '../src/lib/money';
import { alpha } from '../src/theme';

const NECESSITY_OPTS: { key: AffordNecessity; label: string; color: string }[] = [
  { key: AffordNecessity.Need,  label: 'Need it',  color: colors.income },
  { key: AffordNecessity.Want,  label: 'Want it',  color: colors.accent },
  { key: AffordNecessity.Later, label: 'Can wait', color: colors.healthAmber },
];

/** Months → the coarsest unit that still reads as a real delay. */
function delayLabel(months: number): string {
  if (months >= 12) { const y = months / 12; return `${y.toFixed(y >= 10 ? 0 : 1)} years`; }
  if (months >= 1.5) return `${Math.round(months)} months`;
  const weeks = Math.round(months * 4.345);
  return weeks <= 1 ? 'about a week' : `${weeks} weeks`;
}

export default function AffordScreen() {
  const router = useRouter();
  const [amountText, setAmountText] = useState('');
  const [necessity, setNecessity] = useState<AffordNecessity | null>(null);
  const [categoryName, setCategoryName] = useState<string | null>(null);

  // Refetch on focus (via useScreenData) so the snapshot reflects txns added elsewhere.
  // Errors must NOT be swallowed here: a zeroed snapshot renders as "₹0 available",
  // i.e. a confident wrong answer telling the user they can't afford anything.
  // Let it throw so `loadError` surfaces a retry instead.
  const { data: snap, error: loadError, reload } = useScreenData(
    async (db): Promise<AffordSnapshot> => getAffordSnapshot(db),
    [],
  );

  const amount = parseToPaise(amountText);
  const available = snap?.available ?? 0;
  const upcoming = snap?.upcomingBills ?? 0;
  const monthlyIncome = snap?.monthlyIncome ?? 0;
  // 'none' → no credible denominator, so the income axis is dropped entirely.
  const incomeSource = snap?.incomeSource ?? 'none';
  const catStat = categoryName ? snap?.byCategory[categoryName] : undefined;

  const result: AffordResult = useMemo(() => {
    const ctx: AffordContext = {
      amount, available, upcomingBills: upcoming,
      monthlyIncome: incomeSource !== 'none' && monthlyIncome > 0 ? monthlyIncome : undefined,
      category: categoryName && catStat
        ? {
            name: categoryName, spentThisMonth: catStat.spentThisMonth, norm: catStat.norm,
            budget: catStat.budget, typicalBasket: catStat.typicalBasket,
          }
        : undefined,
      necessity: necessity ?? undefined,
      projection: snap?.projection ?? undefined,
      // Turn "₹X spent" into "the goal you're funding slips by N months".
      goalImpact: snap?.goalPacing && amount > 0
        ? { name: snap.goalPacing.name, monthsDelayed: amount / snap.goalPacing.monthlyRate }
        : undefined,
    };
    return evaluateAfford(ctx);
  }, [amount, available, upcoming, monthlyIncome, incomeSource, categoryName, catStat, necessity, snap]);

  // `snap` is undefined until the first load resolves (never null), so both
  // guards must test truthiness — otherwise the verdict is computed from zeros
  // and the screen confidently answers "no" before it knows anything.
  const showResult = amount > 0 && !!snap;
  const { verdict, freeToSpend, remaining, reasons, categoryAfter, categoryCap, incomeShare, projectedAfter, goalImpact } = result;

  const V = {
    [AffordVerdict.Comfortable]: { color: colors.income, emoji: '🎉', title: 'Yes — you can afford it' },
    [AffordVerdict.Tight]:       { color: colors.healthAmber, emoji: '🤔', title: 'Possible, but tight' },
    [AffordVerdict.No]:          { color: colors.expense, emoji: '🛑', title: 'Not right now' },
  }[verdict];

  // Turn each engine reason into a plain-English line with the real numbers.
  const reasonLine = (r: AffordReason): string | null => {
    switch (r) {
      case AffordReason.CashShort:
        return `You'd be short by ${formatCompact(-remaining)} once this month's bills are covered.`;
      case AffordReason.OverCategoryBudget:
        return `This pushes ${categoryName} to ${formatCompact(categoryAfter ?? 0)} — over your ${formatCompact(categoryCap ?? 0)} monthly budget.`;
      case AffordReason.AboveCategoryNorm:
        return `That's more than you usually spend on ${categoryName} (about ${formatCompact(categoryCap ?? 0)}/month).`;
      case AffordReason.MonthAlreadyOver:
        return `This month is already tracking to ${formatCompact(projectedAfter ?? 0)} against a ${formatCompact(snap?.projection?.budget ?? 0)} budget.`;
      case AffordReason.DelaysGoal:
        return `Saving this instead would reach ${goalImpact?.name} about ${delayLabel(goalImpact?.monthsDelayed ?? 0)} sooner.`;
      case AffordReason.UnusualForCategory:
        return `Bigger than usual for ${categoryName} — you normally spend around ${formatCompact(catStat?.typicalBasket ?? 0)} at a time.`;
      case AffordReason.LargeIncomeShare:
        return `It's ${incomeSharePct(incomeShare)} of ${incomeSource === 'rule' ? 'a month\'s income' : 'what you logged in the last 30 days'} in one go.`;
      case AffordReason.ThinBuffer:
        return `It leaves only ${formatCompact(remaining)} — less than a comfortable cushion.`;
      case AffordReason.Healthy:
        return `Leaves ${formatCompact(remaining)} free, and it fits how you normally spend.`;
      default:
        return null;
    }
  };
  const lines = reasons.map(reasonLine).filter((s): s is string => !!s);

  return (
    <View style={styles.container}>
      <ScreenHeader title="Can I afford this?" onBack={() => router.back()} />
      {loadError ? (
        <ErrorState
          title="Couldn't check your balance"
          body="We couldn't read your available money, so we can't answer this yet. Try again."
          onRetry={reload}
        />
      ) : (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>What does it cost?</Text>
          <View style={styles.amountWrap}>
            <Text style={styles.rupee}>₹</Text>
            <TextInput
              style={styles.amountInput}
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              autoFocus
              accessibilityLabel="Purchase amount"
            />
          </View>

          {/* Category — sharpens the verdict using how you spend on this kind of thing. */}
          {(snap?.categories.length ?? 0) > 0 && (
            <View>
              <Text style={styles.label}>What's it for? <Text style={styles.labelHint}>(optional)</Text></Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} keyboardShouldPersistTaps="handled">
                {snap!.categories.map(c => (
                  <CategoryChip
                    key={c.id}
                    category={c}
                    selected={categoryName === c.name}
                    onPress={() => setCategoryName(categoryName === c.name ? null : c.name)}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {/* Optional: unset means the engine simply ignores this axis, like the
              category and income axes. Nothing is preselected, so the fast path
              stays one field. */}
          <Text style={styles.label}>How much do you need it? <Text style={styles.labelHint}>(optional)</Text></Text>
          <View style={styles.chipRow}>
            {NECESSITY_OPTS.map(o => {
              const on = necessity === o.key;
              return (
                <TouchableOpacity
                  key={o.key}
                  style={[styles.necChip, on && { borderColor: o.color, backgroundColor: alpha(o.color, 10) }]}
                  onPress={() => setNecessity(on ? null : o.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={o.label}
                >
                  <Text style={[styles.necChipText, on && { color: o.color }]}>{o.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.breakdownCard}>
            <View style={styles.cashRow}>
              <Text style={styles.cashLabel}>Spendable cash now</Text>
              <Text style={[styles.cashVal, { color: available >= 0 ? colors.textPrimary : colors.expense }]}>{!snap ? '—' : formatRupees(available)}</Text>
            </View>
            {upcoming > 0 && (
              <>
                <View style={styles.breakdownDivider} />
                <View style={styles.cashRow}>
                  <Text style={styles.cashLabel}>− Upcoming bills this month</Text>
                  <Text style={[styles.cashVal, { color: colors.expense }]}>{formatRupees(upcoming)}</Text>
                </View>
                <View style={styles.breakdownDivider} />
                <View style={styles.cashRow}>
                  <Text style={[styles.cashLabel, { color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' }]}>Free to spend</Text>
                  <Text style={[styles.cashVal, { color: freeToSpend >= 0 ? colors.income : colors.expense }]}>{formatRupees(freeToSpend)}</Text>
                </View>
              </>
            )}
            {catStat && (categoryCap ?? 0) > 0 && (
              <>
                <View style={styles.breakdownDivider} />
                <View style={styles.cashRow}>
                  <Text style={styles.cashLabel}>{categoryName} this month</Text>
                  <Text style={styles.cashVal}>
                    {formatCompact(catStat.spentThisMonth)}
                    <Text style={{ color: colors.textMuted }}> / {formatCompact(categoryCap ?? 0)}{catStat.budget ? '' : ' usual'}</Text>
                  </Text>
                </View>
              </>
            )}
            {showResult && incomeShare !== undefined && (
              <>
                <View style={styles.breakdownDivider} />
                <View style={styles.cashRow}>
                  {/* Label names the actual denominator. */}
                  <Text style={styles.cashLabel}>
                    {incomeSource === 'rule' ? 'Share of monthly income' : 'Share of last 30 days’ income'}
                  </Text>
                  <Text style={[styles.cashVal, { color: incomeShare > 0.1 ? colors.healthAmber : colors.textPrimary }]}>{incomeSharePct(incomeShare)}</Text>
                </View>
              </>
            )}
            {showResult && (
              <>
                <View style={styles.breakdownDivider} />
                <View style={[styles.cashRow, styles.leftAfterRow, { backgroundColor: alpha(V.color, 8) }]}>
                  <Text style={[styles.cashLabel, { color: V.color, fontFamily: 'Inter_600SemiBold' }]}>Left after purchase</Text>
                  <Text style={[styles.cashVal, { color: V.color, fontFamily: 'Inter_600SemiBold' }]}>{formatRupees(remaining)}</Text>
                </View>
              </>
            )}
          </View>

          {/* The trade-off, shown even when no axis trips a warning: the honest
              answer to "what does this cost me" is often not a yes/no. Phrased as
              a delay, never as a transfer — the raid that would actually move the
              money is still silent for unlocked goals (V2-10). */}
          {showResult && (goalImpact || snap?.projection) && (
            <View style={styles.costsCard}>
              <Text style={styles.costsLabel}>WHAT THIS COSTS YOU</Text>
              {goalImpact && (
                <View style={styles.cashRow}>
                  <Text style={styles.cashLabel} numberOfLines={2}>Delays {goalImpact.name}</Text>
                  <Text style={styles.cashVal}>{delayLabel(goalImpact.monthsDelayed)}</Text>
                </View>
              )}
              {snap?.projection && projectedAfter !== undefined && (
                <>
                  {goalImpact && <View style={styles.breakdownDivider} />}
                  <View style={styles.cashRow}>
                    <Text style={styles.cashLabel}>Month-end, with this</Text>
                    <Text style={[styles.cashVal, { color: projectedAfter > snap.projection.budget ? colors.expense : colors.textPrimary }]}>
                      {formatCompact(projectedAfter)} / {formatCompact(snap.projection.budget)}
                    </Text>
                  </View>
                </>
              )}
            </View>
          )}

          {showResult && (
            <View style={[styles.resultCard, { borderColor: alpha(V.color, 33) }]}>
              <Text style={styles.resultEmoji}>{V.emoji}</Text>
              <Text style={[styles.resultTitle, { color: V.color }]}>{V.title}</Text>
              {lines.map((l, i) => (
                <View key={i} style={styles.reasonRow}>
                  <View style={[styles.reasonDot, { backgroundColor: V.color }]} />
                  <Text style={styles.reasonText}>{l}</Text>
                </View>
              ))}
            </View>
          )}

          {showResult && (
            <View style={{ gap: space.sm, marginTop: space.sm }}>
              <SecondaryButton label="Save toward it in a goal" onPress={() => router.replace('/savings')} />
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.ghostBtn} onPress={() => router.replace('/add/quick')} accessibilityRole="button">
                  <Text style={styles.ghostBtnText}>{verdict === AffordVerdict.No ? 'Buy anyway' : 'Log it'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ghostBtn} onPress={() => router.back()} accessibilityRole="button">
                  <Text style={styles.ghostBtnText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.md },
  label: { ...type.label, color: colors.textSecondary },
  labelHint: { ...type.label, color: colors.textMuted },
  amountWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingVertical: space.sm, borderBottomWidth: 1, borderColor: colors.border },
  rupee: { fontFamily: 'SpaceMono_400Regular', fontSize: 32, color: colors.textMuted },
  amountInput: { fontFamily: 'SpaceMono_400Regular', fontSize: 40, color: colors.textPrimary, minWidth: 120, textAlign: 'center' },
  chipRow: { flexDirection: 'row', gap: space.sm, paddingTop: space.sm, paddingRight: space.md },
  costsCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm },
  costsLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.9, fontFamily: 'Inter_600SemiBold' },
  necChip: { paddingHorizontal: space.md, height: 40, justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard },
  necChipText: { ...type.body, color: colors.textSecondary },
  breakdownCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, ...shadow.sm },
  breakdownDivider: { height: 1, backgroundColor: colors.border },
  cashRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.md },
  cashLabel: { ...type.body, color: colors.textSecondary },
  cashVal: { fontFamily: 'SpaceMono_400Regular', fontSize: 15, color: colors.textPrimary },
  resultCard: { alignItems: 'center', gap: space.xs, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, padding: space.lg, ...shadow.sm },
  resultEmoji: { fontSize: 34, marginBottom: 2 },
  resultTitle: { ...type.subheading, marginBottom: space.xs },
  leftAfterRow: { borderRadius: radius.md, paddingHorizontal: space.md, marginVertical: space.xs },
  actionRow: { flexDirection: 'row', gap: space.sm },
  ghostBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard },
  ghostBtnText: { ...type.label, color: colors.textSecondary, fontFamily: 'Inter_600SemiBold' },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, alignSelf: 'stretch' },
  reasonDot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  reasonText: { ...type.body, color: colors.textSecondary, flex: 1 },
});
