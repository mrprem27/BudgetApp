import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, radius, layout, shadow } from '../src/constants/layout';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { SecondaryButton } from '../src/components/ui/SecondaryButton';
import { endOfMonth } from 'date-fns';
import { getCashPosition } from '../src/db/queries/savings';
import { getMe } from '../src/db/queries/persons';
import { getTransactionsInRange } from '../src/db/queries/transactions';
import { evaluateAfford } from '../src/lib/afford';
import { parseToPaise, formatRupees, formatCompact } from '../src/lib/money';

export default function AffordScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [amountText, setAmountText] = useState('');
  const [cash, setCash] = useState<number | null>(null);
  const [upcoming, setUpcoming] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const [pos, me] = await Promise.all([getCashPosition(db), getMe(db)]);
        setCash(pos.available);
        // Bills already committed this month: my share of upcoming (incl. recurring)
        // expenses dated from now to month-end.
        const now = Date.now();
        const future = await getTransactionsInRange(db, null, now, endOfMonth(new Date()).getTime());
        const meId = me?.id ?? '';
        const bills = future
          .filter(t => t.kind === 'expense')
          .reduce((s, t) => s + (t.shares.find(sh => sh.personId === meId)?.amount ?? 0), 0);
        setUpcoming(bills);
      } catch { setCash(0); }
    })();
  }, []);

  const amount = parseToPaise(amountText);
  const available = cash ?? 0;
  const { verdict, freeToSpend, remaining } = evaluateAfford(amount, available, upcoming);
  const showResult = amount > 0 && cash !== null;

  const V = {
    comfortable: { color: colors.income, icon: 'check-circle' as const, title: 'Yes — you can afford it', sub: `Leaves ${formatCompact(remaining)} free after this month’s bills.` },
    tight:       { color: colors.healthAmber, icon: 'alert-circle' as const, title: 'Yes, but it’s tight', sub: `Only ${formatCompact(remaining)} would be left once bills are covered.` },
    no:          { color: colors.expense, icon: 'x-circle' as const, title: 'Not right now', sub: `You’d be short by ${formatCompact(-remaining)} after bills. Consider saving toward it.` },
  }[verdict];

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

          <View style={styles.breakdownCard}>
            <View style={styles.cashRow}>
              <Text style={styles.cashLabel}>Spendable cash now</Text>
              <Text style={[styles.cashVal, { color: available >= 0 ? colors.textPrimary : colors.expense }]}>{cash === null ? '—' : formatRupees(available)}</Text>
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
          </View>

          {showResult && (
            <View style={[styles.resultCard, { borderColor: V.color + '55' }]}>
              <View style={[styles.resultIcon, { backgroundColor: V.color + '22' }]}>
                <Feather name={V.icon} size={22} color={V.color} />
              </View>
              <Text style={[styles.resultTitle, { color: V.color }]}>{V.title}</Text>
              <Text style={styles.resultSub}>{V.sub}</Text>
            </View>
          )}

          {showResult && (
            <View style={{ gap: space.sm, marginTop: space.sm }}>
              {verdict !== 'no' && (
                <PrimaryButton label="Looks good — log the expense" onPress={() => router.replace('/add/quick')} />
              )}
              <SecondaryButton label="Save toward it in a goal instead" onPress={() => router.replace('/savings')} />
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
  amountWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingVertical: space.sm, borderBottomWidth: 1, borderColor: colors.border },
  rupee: { fontFamily: 'SpaceMono_400Regular', fontSize: 32, color: colors.textMuted },
  amountInput: { fontFamily: 'SpaceMono_400Regular', fontSize: 40, color: colors.textPrimary, minWidth: 120, textAlign: 'center' },
  breakdownCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, ...shadow.sm },
  breakdownDivider: { height: 1, backgroundColor: colors.border },
  cashRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.md },
  cashLabel: { ...type.body, color: colors.textSecondary },
  cashVal: { fontFamily: 'SpaceMono_400Regular', fontSize: 15 },
  resultCard: { alignItems: 'center', gap: space.xs, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, padding: space.lg, ...shadow.sm },
  resultIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  resultTitle: { ...type.subheading },
  resultSub: { ...type.body, color: colors.textSecondary, textAlign: 'center' },
});
