import React from 'react';
import { Text, View, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../tokens';

type Props = { count: number; onPress: () => void };

/**
 * The "Filters" button: the same control wherever a list has filters behind a sheet (Search, Personal,
 * a group, Review). A count badge says how many are on, so a narrowed list is never a surprise.
 */
export function FiltersButton({ count, onPress }: Props) {
  const on = count > 0;
  return (
    <TouchableOpacity
      style={[styles.btn, on && styles.on]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={on ? `Filters, ${count} on` : 'Filters'}
      hitSlop={6}
    >
      <Feather name="sliders" size={16} color={on ? colors.accent : colors.textSecondary} />
      <Text style={[styles.text, on && { color: colors.accent }]}>Filters</Text>
      {on && <View style={styles.badge}><Text style={styles.badgeText}>{count}</Text></View>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: space.xs, height: 40, paddingHorizontal: space.smd,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard,
  },
  on: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  text: { ...type.label, color: colors.textSecondary },
  badge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  badgeText: { ...type.caption, color: colors.onAccent, fontFamily: 'Inter_600SemiBold', lineHeight: 14 },
});
