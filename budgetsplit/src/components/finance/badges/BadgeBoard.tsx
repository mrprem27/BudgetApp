import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space } from '../../tokens';
import { IconCircle } from '../../ui/IconCircle';
import { PressableScale } from '../../ui/PressableScale';
import { Card } from '../../ui/Card';
import type { Badge } from '../../../lib/badges';

/** One colour per level climbed, so a board fills in and warms up as you go (`U-65`). */
const TIER = [colors.accent, colors.income, colors.settle, colors.healthAmber];
export function badgeTint(b: Badge): string {
  if (b.level === 0) return colors.textMuted;
  return TIER[Math.min(b.level, TIER.length) - 1];
}

/**
 * The badge board (`U-65`): every badge as a small disc, dimmed until earned, in colour once it
 * is — and a warmer colour for each level climbed. The whole board opens the Badges screen,
 * where each one says what it means and how far you are. Small discs (2026-09-30), so thirty fit
 * in a few rows.
 */
export function BadgeBoard({ badges, onOpen, compact }: { badges: Badge[]; onOpen?: () => void; compact?: boolean }) {
  if (badges.length === 0) return null;
  const earned = badges.filter(b => b.level > 0).length;
  const body = (
    <Card padded style={compact ? styles.cardCompact : undefined}>
      <View style={styles.head}>
        <Text style={styles.title}>Badges</Text>
        <Text style={styles.count}>{earned} of {badges.length}</Text>
        {onOpen && <Feather name="chevron-right" size={16} color={colors.textMuted} />}
      </View>
      <View style={styles.grid}>
        {badges.map(b => (
          <View key={b.id} style={styles.cell} accessible accessibilityLabel={`${b.title}, ${b.level > 0 ? 'earned' : 'not yet'}`}>
            <View style={b.level > 0 ? undefined : styles.dull}>
              <IconCircle icon={b.icon} size={compact ? 28 : 32} color={badgeTint(b)} bg={b.level > 0 ? undefined : colors.bgMuted} />
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
  return onOpen
    ? <PressableScale onPress={onOpen} accessibilityLabel={`Badges, ${earned} of ${badges.length} earned. Open`}>{body}</PressableScale>
    : body;
}

const styles = StyleSheet.create({
  cardCompact: { marginBottom: space.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.smd },
  title: { ...type.sectionLabel, color: colors.textMuted, flex: 1 },
  count: { ...type.caption, color: colors.textSecondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  // Not yet earned: there, but clearly not yours yet.
  dull: { opacity: 0.35 },
  cell: { alignItems: 'center' },
});
