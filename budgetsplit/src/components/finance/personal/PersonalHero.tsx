import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, type, space, radius, layout } from '../../tokens';
import { alpha } from '../../../theme';
import { formatCompact } from '../../../lib/money';
import { oweView } from '../../../lib/owe';
import { kindColor } from '../../../lib/kindTheme';
import { MemberAvatar } from '../MemberAvatar';
import type { ActivityTotals } from '../../../lib/activityTotals';

/**
 * Personal's top (`U-63`): who you are and where you stand with everyone, then — always there —
 * what the list below adds up to.
 *
 * The hero never changes with filters: it is today's position with people, over a faint wash of
 * your own avatar colour, so the screen reads as yours. The row under it is the one that follows
 * the list (a filter, a date, Groups / All), with Reports at its right edge. Both keep one height,
 * so turning a filter on never moves the list. It replaces a card that swapped between the two
 * questions, which left either one missing half the time.
 */
export function PersonalHero({ name, color, imageUri, owe, owed, totals, periodLabel, onReports }: {
  name: string;
  color: string;
  imageUri?: string | null;
  owe: number;
  owed: number;
  totals: ActivityTotals;
  /** What the row covers — "This month", "Filtered". */
  periodLabel: string;
  onReports: () => void;
}) {
  const net = owed - owe;
  const ov = oweView(net);
  const nv = oweView(totals.netWithOthers);
  return (
    <View style={styles.wrap}>
      <View style={styles.hero}>
        <LinearGradient
          colors={[alpha(color, 20), colors.bgCard]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.heroRow}>
          <MemberAvatar name={name} color={color} imageUri={imageUri ?? undefined} size={44} />
          <View style={styles.heroText}>
            <Text style={styles.label}>Net with everyone</Text>
            <Text style={[styles.net, { color: ov.color }]}>{ov.sign}{formatCompact(Math.abs(net))}</Text>
          </View>
        </View>
        <Text style={styles.sub}>
          You owe <Text style={{ color: oweView(-owe).color }}>{formatCompact(owe)}</Text>
          {'  ·  '}
          You’re owed <Text style={{ color: oweView(owed).color }}>{formatCompact(owed)}</Text>
        </Text>
      </View>

      <View style={styles.row}>
        <View style={styles.rowBody}>
          <Text style={styles.period}>{periodLabel}</Text>
          <View style={styles.stats}>
            <Stat label="Spent" value={formatCompact(totals.spent)} tint={kindColor('expense')} />
            <View style={styles.divider} />
            <Stat label="Income" value={formatCompact(totals.income)} tint={kindColor('income')} />
            <View style={styles.divider} />
            <Stat label="With others" value={`${nv.sign}${formatCompact(Math.abs(totals.netWithOthers))}`} tint={nv.color} />
          </View>
        </View>
        <TouchableOpacity onPress={onReports} style={styles.go} hitSlop={6} accessibilityRole="button" accessibilityLabel="Open these in Reports">
          <Feather name="pie-chart" size={18} color={colors.accent} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: tint }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const card = {
  backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' as const,
};

const styles = StyleSheet.create({
  wrap: { marginHorizontal: layout.screenPaddingH, marginBottom: space.md, gap: space.sm },
  hero: { ...card, padding: space.md },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: space.smd },
  heroText: { flex: 1 },
  label: { ...type.caption, color: colors.textMuted },
  net: { ...type.amountLG },
  sub: { ...type.caption, color: colors.textSecondary, marginTop: space.sm },
  row: { ...card, flexDirection: 'row', alignItems: 'stretch' },
  rowBody: { flex: 1, paddingVertical: space.sm, paddingHorizontal: space.md },
  period: { ...type.caption, color: colors.textMuted, marginBottom: 2 },
  stats: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, gap: 2 },
  statLabel: { ...type.caption, color: colors.textMuted },
  statValue: { ...type.amountSM },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border, marginHorizontal: space.sm },
  go: { width: layout.touchMin, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: colors.border },
});
