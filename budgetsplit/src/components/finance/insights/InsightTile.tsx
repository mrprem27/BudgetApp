import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, alpha } from '../../tokens';
import { IconCircle } from '../../ui/IconCircle';
import { PressableScale } from '../../ui/PressableScale';

type Props = {
  icon: React.ComponentProps<typeof IconCircle>['icon'];
  /** The section's own colour: the disc, the wash and the border. */
  tint: string;
  title: string;
  /** The one figure the section comes down to. */
  figure: string;
  /** Colour of the figure when it carries a verdict (over, safe); the primary text colour otherwise. */
  figureColor?: string;
  line: string;
  onPress: () => void;
};

/**
 * One section of Insights as a tile (`U-91`): its colour, its name, the one figure it comes down
 * to and a line, with the same ↗ Home's tiles carry. Tapping it opens everything the section holds.
 * A column of identical collapsed rows gave every section the same weight and no figure.
 *
 * Every tile is the same height, and nothing in one is cut off with an ellipsis: the title is a
 * short keyword that shrinks before it truncates, and the line has two lines to finish its sentence.
 */
export function InsightTile({ icon, tint, title, figure, figureColor, line, onPress }: Props) {
  return (
    // The flex lives on a plain wrapper: `PressableScale` puts its `style` on an inner view (`U-30`).
    <View style={styles.cell}>
      <PressableScale
        style={[styles.tile, { backgroundColor: alpha(tint, 8), borderColor: alpha(tint, 25) }]}
        onPress={onPress}
        accessibilityLabel={`${title}. ${figure}, ${line}. Open`}
      >
        <View style={styles.head}>
          <IconCircle icon={icon} size={28} color={tint} />
          <Feather name="arrow-up-right" size={14} color={colors.textMuted} />
        </View>
        <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{title}</Text>
        <Text style={[styles.figure, { color: figureColor ?? colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{figure}</Text>
        <Text style={styles.line} numberOfLines={2}>{line}</Text>
      </PressableScale>
    </View>
  );
}

/** Tiles two to a row; an odd last one keeps its half. */
export function InsightGrid({ children }: { children: React.ReactNode[] }) {
  const tiles = children.filter(Boolean);
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < tiles.length; i += 2) rows.push(tiles.slice(i, i + 2));
  return (
    <>
      {rows.map((pair, i) => (
        <View key={i} style={styles.row}>
          {pair}
          {pair.length === 1 && <View style={styles.cell} />}
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch', gap: space.smd, marginBottom: space.smd },
  cell: { flex: 1, minWidth: 0 },
  // A fixed height, not a minimum: a tile with a one-line sentence sat shorter than its neighbour.
  tile: { alignSelf: 'stretch', height: 148, borderRadius: radius.lg, borderWidth: 1, padding: space.md },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: space.sm },
  title: { ...type.label, color: colors.textSecondary },
  figure: { ...type.amountMD, marginTop: 2 },
  line: { ...type.caption, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
});
