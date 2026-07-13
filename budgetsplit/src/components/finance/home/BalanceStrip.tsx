import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, type, space, radius, shadow } from '../../tokens';
import { formatCompact } from '../../../lib/money';

type Props = {
  /** Paise I owe others (>=0). */
  oweTotal: number;
  /** Paise others owe me (>=0). */
  owedTotal: number;
  onSettle: () => void;
};

/**
 * "You owe / Owed to you" strip with a Settle entry point. The caller hides this
 * entirely when both totals are zero (per design — no empty placeholder).
 */
export function BalanceStrip({ oweTotal, owedTotal, onSettle }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.half}>
        <Text style={styles.label}>You owe</Text>
        <Text style={[styles.amount, { color: colors.expense }]}>{formatCompact(oweTotal)}</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.half}>
        <Text style={styles.label}>Owed to you</Text>
        <Text style={[styles.amount, { color: colors.income }]}>{formatCompact(owedTotal)}</Text>
      </View>
      <TouchableOpacity onPress={onSettle} style={styles.settleBtn} accessibilityRole="button" accessibilityLabel="Settle up">
        <Text style={styles.settleText}>Settle →</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.md, marginBottom: space.md, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  half: { flex: 1 },
  label: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: space.xs },
  amount: { fontFamily: 'SpaceMono_400Regular', fontSize: 20, letterSpacing: -0.5 },
  divider: { width: 1, height: 36, backgroundColor: colors.border, marginHorizontal: space.md },
  settleBtn: { backgroundColor: colors.accentMuted, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: space.sm, marginLeft: space.sm },
  settleText: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
});
