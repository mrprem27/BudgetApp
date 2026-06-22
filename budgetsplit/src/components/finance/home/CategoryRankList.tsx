import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, shadow } from '../../tokens';
import { categoryVisual } from '../../../constants/categories';
import { formatCompact } from '../../../lib/money';

export type CategoryRow = { name: string; paise: number };

type Props = {
  /** Spend-by-category, largest first. */
  rows: CategoryRow[];
  /** Total spend (paise) — for bar proportions. */
  total: number;
  /** How many rows to show before "+ N more". */
  topN?: number;
  onPressCategory: (name: string) => void;
  onMore: () => void;
};

/** "Where it went" — top-N category bars + a "+ N more" affordance. */
export function CategoryRankList({ rows, total, topN = 3, onPressCategory, onMore }: Props) {
  const top = rows.slice(0, topN);
  const moreCount = Math.max(0, rows.length - topN);
  const max = top.reduce((m, r) => Math.max(m, r.paise), 0) || 1;

  return (
    <View>
      <Text style={styles.sectionLabel}>WHERE IT WENT</Text>
      <View style={styles.card}>
        {top.map(row => {
          const vis = categoryVisual(row.name);
          const barPct = Math.round((row.paise / max) * 100);
          const pctOfTotal = total > 0 ? row.paise / total : 0;
          // Red bar when this single category dominates spend.
          const barColor = pctOfTotal >= 0.5 ? colors.expense : colors.accent;
          return (
            <TouchableOpacity
              key={row.name}
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => onPressCategory(row.name)}
              accessibilityRole="button"
              accessibilityLabel={`${row.name}, ${formatCompact(row.paise)}`}
            >
              <View style={[styles.icon, { backgroundColor: vis.color + '22' }]}>
                <Feather name={vis.icon} size={14} color={vis.color} />
              </View>
              <Text style={styles.name} numberOfLines={1}>{row.name}</Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${barPct}%`, backgroundColor: barColor }]} />
              </View>
              <Text style={styles.amount}>{formatCompact(row.paise)}</Text>
            </TouchableOpacity>
          );
        })}
        {moreCount > 0 && (
          <TouchableOpacity onPress={onMore} accessibilityRole="button" accessibilityLabel={`${moreCount} more categories`}>
            <Text style={styles.more}>+ {moreCount} more {moreCount === 1 ? 'category' : 'categories'} →</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: space.sm, fontFamily: 'Inter_600SemiBold' },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.md, marginBottom: space.md, borderWidth: 1, borderColor: colors.border, ...shadow.sm, gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  icon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  name: { ...type.label, color: colors.textSecondary, width: 70 },
  track: { flex: 1, height: 3, backgroundColor: colors.bgElevated, borderRadius: 2 },
  fill: { height: 3, borderRadius: 2 },
  amount: { fontFamily: 'SpaceMono_400Regular', fontSize: 12, color: colors.textPrimary, width: 52, textAlign: 'right' },
  more: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
});
