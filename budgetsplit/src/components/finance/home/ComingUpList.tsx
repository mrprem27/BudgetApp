import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, type, space, radius, shadow } from '../../tokens';
import { formatCompact } from '../../../lib/money';
import type { UpcomingItem } from '../../../lib/upcoming';

type Props = {
  items: UpcomingItem[];
};

function whenLabel(daysUntil: number): string {
  if (daysUntil <= 0) return 'today';
  if (daysUntil === 1) return 'tomorrow';
  return `in ${daysUntil} days`;
}

/** Next few recurring bills. Caller hides the section when the list is empty. */
export function ComingUpList({ items }: Props) {
  return (
    <View>
      <Text style={styles.sectionLabel}>COMING UP</Text>
      <View style={styles.card}>
        {items.map((it, i) => (
          <View key={it.id} style={[styles.row, i < items.length - 1 && styles.rowBorder]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{it.name}</Text>
              <Text style={styles.sub}>{whenLabel(it.daysUntil)} · Recurring</Text>
            </View>
            <Text style={styles.amount}>{formatCompact(it.amount)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: space.sm, fontFamily: 'Inter_600SemiBold' },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, marginBottom: space.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.sm },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: space.sm + 4 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  name: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  sub: { ...type.caption, color: colors.textMuted },
  amount: { fontFamily: 'SpaceMono_400Regular', fontSize: 14, color: colors.settle, fontWeight: '700' },
});
