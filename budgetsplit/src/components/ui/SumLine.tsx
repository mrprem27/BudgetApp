import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space } from '../tokens';
import { formatRupeesShort } from '../../lib/money';

/**
 * One line of a sum you could check by hand (`U-28`): `Bank + Cash = Spendable`, `Owed to you −
 * You owe = Net`. The operator column is fixed-width so the numbers line up; a total line (`=`)
 * gets a rule above it and the primary weight — the arithmetic you learnt at school.
 */
export function SumLine({ op, dot, label, value, total, color, hint, onPress }: {
  op: '' | '+' | '−' | '='; dot?: string; label: string; value: number;
  total?: boolean;
  /** Overrides the figure's colour. A negative value is always shown in the expense colour. */
  color?: string;
  hint?: string; onPress?: () => void;
}) {
  // Whole rupees, not compact: `1.2L + 1.2L = 2.5L` is what rounding does to a sum meant to be
  // checked by hand.
  const shown = value < 0 ? `−${formatRupeesShort(-value)}` : formatRupeesShort(value);
  const body = (
    <View style={[styles.line, total && styles.totalLine]}>
      <Text style={[styles.op, total && styles.opTotal]}>{op}</Text>
      {!total && <View style={[styles.dot, { backgroundColor: dot ?? 'transparent' }]} />}
      <View style={styles.lineText}>
        <Text style={[styles.lineLabel, total && styles.totalLabel]} numberOfLines={1}>{label}</Text>
        {hint ? <Text style={styles.hint} numberOfLines={1}>{hint}</Text> : null}
      </View>
      <Text style={[styles.lineValue, total && styles.totalValue, color ? { color } : null, value < 0 && { color: colors.expense }]}>{shown}</Text>
      {onPress ? <Feather name="chevron-right" size={14} color={colors.textMuted} /> : null}
    </View>
  );
  return onPress
    ? <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}, ${shown}`}>{body}</TouchableOpacity>
    : body;
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 24 },
  totalLine: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm, marginTop: 2 },
  op: { width: 12, fontFamily: 'SpaceMono_400Regular', fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  opTotal: { color: colors.textPrimary },
  dot: { width: 8, height: 8, borderRadius: 4 },
  lineText: { flex: 1 },
  lineLabel: { ...type.body, color: colors.textSecondary },
  totalLabel: { color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  hint: { ...type.caption, color: colors.textMuted },
  lineValue: { fontFamily: 'SpaceMono_400Regular', fontSize: 13, color: colors.textSecondary },
  totalValue: { fontSize: 15, color: colors.textPrimary },
});
