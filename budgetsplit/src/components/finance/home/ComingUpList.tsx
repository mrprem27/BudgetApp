import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, shadow } from '../../tokens';
import { formatCompact } from '../../../lib/money';
import { categoryVisual } from '../../../constants/categories';
import { asFeather } from '../../../constants/palette';
import type { UpcomingItem } from '../../../lib/upcoming';

type Props = {
  items: UpcomingItem[];
  /** Section label — defaults to the Home wording. */
  title?: string;
  /** Show a category icon square per row (Plan's "Upcoming this month"). */
  showIcon?: boolean;
};

function whenLabel(daysUntil: number): string {
  if (daysUntil <= 0) return 'today';
  if (daysUntil === 1) return 'tomorrow';
  return `in ${daysUntil} days`;
}

/** Next few recurring bills. Caller hides the section when the list is empty. */
export function ComingUpList({ items, title = 'COMING UP', showIcon = false }: Props) {
  return (
    <View>
      <Text style={styles.sectionLabel}>{title}</Text>
      <View style={styles.card}>
        {items.map((it, i) => {
          const vis = showIcon ? categoryVisual(it.category) : null;
          return (
            <View key={it.id} style={[styles.row, i < items.length - 1 && styles.rowBorder]}>
              {vis && (
                <View style={[styles.icon, { backgroundColor: vis.color + '22' }]}>
                  <Feather name={asFeather(vis.icon, 'calendar')} size={16} color={vis.color} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{it.name}</Text>
                <Text style={styles.sub}>Recurring · {whenLabel(it.daysUntil)}</Text>
              </View>
              <Text style={styles.amount}>{formatCompact(it.amount)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: space.sm, fontFamily: 'Inter_600SemiBold' },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, marginBottom: space.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingVertical: space.sm + 4 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  name: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  sub: { ...type.caption, color: colors.textMuted },
  amount: { fontFamily: 'SpaceMono_400Regular', fontSize: 14, color: colors.settle, fontWeight: '700' },
});
