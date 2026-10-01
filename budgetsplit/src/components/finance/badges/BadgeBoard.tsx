import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, layout } from '../../tokens';
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
 * where each one says what it means and how far you are.
 *
 * Small on purpose, and smaller twice over (`U-75`): 20pt discs, three rows for thirty-six on the
 * Badges screen. `compact` (Settings) is ONE row, earned ones first, as many as fit: the board
 * there is a door to the Badges screen, not the screen itself.
 */
const DISC = 20;
const GAP = space.xs;

export function BadgeBoard({ badges, onOpen, compact }: { badges: Badge[]; onOpen?: () => void; compact?: boolean }) {
  const { width } = useWindowDimensions();
  if (badges.length === 0) return null;
  const earned = badges.filter(b => b.level > 0).length;
  // The card's inner width: the screen less its side padding and the card's own.
  const perRow = Math.max(1, Math.floor((width - 2 * layout.screenPaddingH - 2 * space.md + GAP) / (DISC + GAP)));
  const shown = compact ? [...badges].sort((a, b) => Number(b.level > 0) - Number(a.level > 0)).slice(0, perRow) : badges;
  const body = (
    <Card padded style={compact ? styles.cardCompact : undefined}>
      <View style={styles.head}>
        <Text style={styles.title}>Badges</Text>
        <Text style={styles.count}>{earned} of {badges.length}</Text>
        {onOpen && <Feather name="chevron-right" size={16} color={colors.textMuted} />}
      </View>
      <View style={styles.grid}>
        {shown.map(b => (
          <View key={b.id} style={styles.cell} accessible accessibilityLabel={`${b.title}, ${b.level > 0 ? 'earned' : 'not yet'}`}>
            <View style={b.level > 0 ? undefined : styles.dull}>
              <IconCircle icon={b.icon} size={DISC} iconSize={12} color={badgeTint(b)} bg={b.level > 0 ? undefined : colors.bgMuted} />
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
  head: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.sm },
  title: { ...type.sectionLabel, color: colors.textMuted, flex: 1 },
  count: { ...type.caption, color: colors.textSecondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  // Not yet earned: there, but clearly not yours yet.
  dull: { opacity: 0.35 },
  cell: { alignItems: 'center' },
});
