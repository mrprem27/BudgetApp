import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, radius, layout, shadow } from '../src/constants/layout';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { SecondaryButton } from '../src/components/ui/SecondaryButton';
import { CategoryChip } from '../src/components/finance/CategoryChip';
import { getAffordSnapshot, type AffordSnapshot } from '../src/db/queries/savings';
import {
  evaluateAfford, AffordVerdict, AffordReason,
  type AffordContext, type AffordResult,
} from '../src/lib/afford';
import { parseToPaise, formatRupees, formatCompact } from '../src/lib/money';

export default function AffordScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [amountText, setAmountText] = useState('');
  const [snap, setSnap] = useState<AffordSnapshot | null>(null);
  const [categoryName, setCategoryName] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try { setSnap(await getAffordSnapshot(db)); }
      catch { setSnap({ available: 0, upcomingBills: 0, monthlyIncome: 0, categories: [], byCategory: {} }); }
    })();
  }, []);

  const amount = parseToPaise(amountText);
  const available = snap?.available ?? 0;
  const upcoming = snap?.upcomingBills ?? 0;
  const monthlyIncome = snap?.monthlyIncome ?? 0;
  const catStat = categoryName ? snap?.byCategory[categoryName] : undefined;

  const result: AffordResult = useMemo(() => {
    const ctx: AffordContext = {
      amount, available, upcomingBills: upcoming,
      monthlyIncome: monthlyIncome > 0 ? monthlyIncome : undefined,
      category: categoryName && catStat
        ? { name: categoryName, spentThisMonth: catStat.spentThisMonth, norm: catStat.norm, budget: catStat.budget }
        : undefined,
    };
    return evaluateAfford(ctx);
  }, [amount, available, upcoming, monthlyIncome, categoryName, catStat]);

  const showResult = amount > 0 && snap !== null;
  const { verdict, freeToSpend, remaining, reasons, categoryAfter, categoryCap, incomeShare } = result;

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
      case AffordReason.LargeIncomeShare:
        return `It's ${Math.round((incomeShare ?? 0) * 100)}% of a month's income in one go.`;
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

          <View style={styles.breakdownCard}>
            <View style={styles.cashRow}>
              <Text style={styles.cashLabel}>Spendable cash now</Text>
              <Text style={[styles.cashVal, { color: available >= 0 ? colors.textPrimary : colors.expense }]}>{snap === null ? '—' : formatRupees(available)}</Text>
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
                  <Text style={styles.cashLabel}>Share of monthly income</Text>
                  <Text style={[styles.cashVal, { color: incomeShare > 0.1 ? colors.healthAmber : colors.textPrimary }]}>{Math.round(incomeShare * 100)}%</Text>
                </View>
              </>
            )}
            {showResult && (
              <>
                <View style={styles.breakdownDivider} />
                <View style={[styles.cashRow, styles.leftAfterRow, { backgroundColor: V.color + '14' }]}>
                  <Text style={[styles.cashLabel, { color: V.color, fontFamily: 'Inter_600SemiBold' }]}>Left after purchase</Text>
                  <Text style={[styles.cashVal, { color: V.color, fontFamily: 'Inter_600SemiBold' }]}>{formatRupees(remaining)}</Text>
                </View>
              </>
            )}
          </View>

          {showResult && (
            <View style={[styles.resultCard, { borderColor: V.color + '55' }]}>
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
