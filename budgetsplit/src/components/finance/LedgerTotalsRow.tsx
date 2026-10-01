import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, layout } from '../tokens';

export type LedgerStat = { label: string; value: string; tint: string };

/**
 * What a ledger adds up to, in one row, with Reports at its right edge: Personal's and every
 * group's (`U-88`). The row covers this month unless told otherwise, and says nothing about the
 * period while it is the default; `label` appears only once a date or a filter has changed
 * what the figures cover.
 */
export function LedgerTotalsRow({ stats, label, onReports }: {
  stats: LedgerStat[];
  /** Why the figures are not simply "this month": "Last month", "2 filters". */
  label?: string | null;
  /** Opens Reports on what this row covers. */
  onReports: () => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.body}>
        {!!label && <Text style={styles.period}>{label}</Text>}
        <View style={styles.stats}>
          {stats.map((s, i) => (
            <View key={s.label} style={styles.statWrap}>
              {i > 0 && <View style={styles.divider} />}
              <View style={styles.stat}>
                <Text style={styles.statLabel}>{s.label}</Text>
                <Text style={[styles.statValue, { color: s.tint }]} numberOfLines={1}>{s.value}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
      <TouchableOpacity onPress={onReports} style={styles.go} hitSlop={6} accessibilityRole="button" accessibilityLabel="Open these in Reports">
        <Feather name="pie-chart" size={18} color={colors.accent} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden', flexDirection: 'row', alignItems: 'stretch',
  },
  body: { flex: 1, paddingVertical: space.sm, paddingHorizontal: space.md, justifyContent: 'center' },
  period: { ...type.caption, color: colors.textMuted, marginBottom: 2 },
  stats: { flexDirection: 'row', alignItems: 'center' },
  statWrap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, gap: 2 },
  statLabel: { ...type.caption, color: colors.textMuted },
  statValue: { ...type.amountSM },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border, marginHorizontal: space.sm },
  go: { width: layout.touchMin, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: colors.border },
});
