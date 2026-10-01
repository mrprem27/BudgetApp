import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, type, space, radius, layout } from '../../tokens';
import { alpha } from '../../../theme';
import { formatCompact } from '../../../lib/money';
import { oweView } from '../../../lib/owe';
import { kindColor } from '../../../lib/kindTheme';
import { MemberAvatar } from '../MemberAvatar';
import { LedgerTotalsRow } from '../LedgerTotalsRow';
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
  /** Why the row is not simply this month ("Last month", "2 filters"); null while it is. */
  periodLabel: string | null;
  onReports: () => void;
}) {
  const net = owed - owe;
  const ov = oweView(net);
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

      <LedgerTotalsRow
        label={periodLabel}
        onReports={onReports}
        stats={[
          { label: 'Spent', value: formatCompact(totals.spent), tint: kindColor('expense') },
          { label: 'Income', value: formatCompact(totals.income), tint: kindColor('income') },
        ]}
      />
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
});
