import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, shadow } from '../../tokens';
import { categoryVisual } from '../../../constants/categories';
import { formatCompact } from '../../../lib/money';

export type CategoryRow = { name: string; paise: number };

/** A category bar fill that grows in on mount and tweens when its value changes. */
function AnimatedBar({ pct, color }: { pct: number; color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: pct, duration: 450, useNativeDriver: false }).start();
  }, [pct, anim]);
  const width = anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });
  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, { width, backgroundColor: color }]} />
    </View>
  );
}

type Props = {
  /** Spend-by-category, largest first. */
  rows: CategoryRow[];
  /** Total spend (paise) — for bar proportions. */
  total: number;
  /** How many rows to show before "+ N more". */
  topN?: number;
  /** Show skeleton rows (e.g. while a period switch loads) — keeps height stable. */
  loading?: boolean;
  /** When expanded, the list shows all rows; the footer becomes "Show less". */
  expanded?: boolean;
  onPressCategory: (name: string) => void;
  /** Toggles expand/collapse (reveal the rest of the categories inline). */
  onMore: () => void;
  /** Highlight the row for this category (two-way sync with a donut/chart). */
  selectedName?: string | null;
};

/**
 * "Where it went" — the top-N spend categories. Always renders exactly `topN`
 * row-slots plus a reserved "more" line so the card is the SAME height in every
 * state (loading, full, partial, empty) — switching Today/Month/Year never makes
 * the dashboard jump. Empty slots are faint placeholders; during `loading` they're
 * skeletons.
 */
export function CategoryRankList({ rows, total, topN = 3, loading = false, expanded = false, onPressCategory, onMore, selectedName }: Props) {
  const top = rows.slice(0, topN);
  const moreCount = Math.max(0, rows.length - topN);
  // Bars scale to the largest *visible* row.
  const max = (expanded ? rows : top).reduce((m, r) => Math.max(m, r.paise), 0) || 1;
  const empty = !loading && rows.length === 0;
  // Collapsed keeps a fixed topN height (no jump on the dashboard); expanded shows all.
  const displayRows: (CategoryRow | null)[] = loading
    ? Array.from({ length: topN }, () => null)
    : expanded
    ? rows
    : Array.from({ length: topN }, (_, i) => top[i] ?? null);

  return (
    <View>
      <Text style={styles.sectionLabel}>WHERE IT WENT</Text>
      <View style={styles.card}>
        {displayRows.map((row, i) => {
          if (loading) {
            return (
              <View key={i} style={styles.row}>
                <View style={[styles.icon, styles.skelBlock]} />
                <View style={[styles.skelName, styles.skelBlock]} />
                <View style={styles.track} />
                <View style={[styles.skelAmt, styles.skelBlock]} />
              </View>
            );
          }
          if (!row) {
            // Empty slot keeps the row's height so the card doesn't shrink between
            // periods — but instead of a fake faint row it shows a single quiet
            // line (or the 'no spending' note in the first slot).
            return (
              <View key={i} style={styles.placeholderRow}>
                {i === 0 && empty
                  ? <Text style={styles.emptyMsg}>No spending this period</Text>
                  : <View style={styles.emptyLine} />}
              </View>
            );
          }
          const vis = categoryVisual(row.name);
          const barPct = Math.round((row.paise / max) * 100);
          const pctOfTotal = total > 0 ? row.paise / total : 0;
          const isSel = !!selectedName && row.name === selectedName;
          // Selected → category color; single dominant category → red; else accent.
          const barColor = isSel ? vis.color : pctOfTotal >= 0.5 ? colors.expense : colors.accent;
          return (
            <TouchableOpacity
              key={row.name}
              style={[styles.row, isSel && styles.rowSelected]}
              activeOpacity={0.7}
              onPress={() => onPressCategory(row.name)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSel }}
              accessibilityLabel={`${row.name}, ${formatCompact(row.paise)}`}
            >
              <View style={[styles.icon, { backgroundColor: vis.color + '22' }]}>
                <Feather name={vis.icon} size={14} color={vis.color} />
              </View>
              <Text style={[styles.name, isSel && styles.nameSelected]} numberOfLines={1}>{row.name}</Text>
              <AnimatedBar pct={barPct} color={barColor} />
              <Text style={styles.amount}>{formatCompact(row.paise)}</Text>
            </TouchableOpacity>
          );
        })}
        {/* Footer is a FIXED-HEIGHT slot (link or empty) so the card height never
            changes between periods (Today/Month/Year) or more/less states. */}
        <View style={styles.moreSlot}>
          {!loading && moreCount > 0 && (
            <TouchableOpacity onPress={onMore} accessibilityRole="button" accessibilityLabel={expanded ? 'Show fewer categories' : `Show ${moreCount} more categories`}>
              <Text style={styles.more}>{expanded ? 'Show less' : `+ ${moreCount} more ${moreCount === 1 ? 'category' : 'categories'}`}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: space.sm, fontFamily: 'Inter_600SemiBold' },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.md, marginBottom: space.md, borderWidth: 1, borderColor: colors.border, ...shadow.sm, gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.sm, marginHorizontal: -4, paddingHorizontal: 4, paddingVertical: 2 },
  rowSelected: { backgroundColor: colors.bgMuted },
  nameSelected: { color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  icon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  // flex (not a fixed width) so longer names get more room and truncate with … instead of a hard cut.
  name: { ...type.label, color: colors.textSecondary, flex: 1 },
  track: { flex: 2, height: 3, backgroundColor: colors.bgElevated, borderRadius: 2 },
  fill: { height: 3, borderRadius: 2 },
  amount: { fontFamily: 'SpaceMono_400Regular', fontSize: 12, color: colors.textPrimary, width: 52, textAlign: 'right' },
  more: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  moreSlot: { height: 18, justifyContent: 'center' },
  // Empty category slot — same height as a real row, but just a quiet line.
  placeholderRow: { height: 28, flexDirection: 'row', alignItems: 'center' },
  emptyLine: { flex: 1, height: 2, borderRadius: 1, backgroundColor: colors.bgElevated },
  emptyMsg: { ...type.label, color: colors.textMuted },
  skelBlock: { backgroundColor: colors.bgElevated, borderRadius: 6 },
  skelName: { flex: 1, height: 10, marginRight: space.sm },
  skelAmt: { width: 52, height: 10 },
});
