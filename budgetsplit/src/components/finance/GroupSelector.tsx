import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../tokens';
import { asFeather } from '../../constants/palette';
import type { BudgetGroup } from '../../db/queries/groups';

type Props = {
  groups: BudgetGroup[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** Optional inline label before the chips (e.g. "In"). */
  label?: string;
};

/**
 * Compact horizontal chip list for group selection.
 * Replaces the old SheetModal picker — faster (one tap), less wasted space.
 * Reusable across quick-add, itemized, and any other screen that needs group context.
 */
export function GroupSelector({ groups, selectedId, onSelect, label }: Props) {
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {groups.map(g => {
          const active = g.id === selectedId;
          return (
            <TouchableOpacity
              key={g.id}
              style={[
                styles.chip,
                active && { backgroundColor: g.color + '22', borderColor: g.color },
              ]}
              onPress={() => onSelect(g.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={g.name}
            >
              <View style={[styles.chipIcon, { backgroundColor: g.color + '22' }]}>
                <Feather name={asFeather(g.icon, 'layers')} size={13} color={g.color} />
              </View>
              <Text
                style={[styles.chipText, active && { color: g.color, fontFamily: 'Inter_600SemiBold' }]}
                numberOfLines={1}
              >
                {g.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.xs,
  },
  label: {
    ...type.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: 'Inter_600SemiBold',
    paddingHorizontal: 2,
  },
  row: {
    flexDirection: 'row',
    gap: space.xs,
    paddingRight: space.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 160,
  },
  chipIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    ...type.label,
    color: colors.textSecondary,
    flexShrink: 1,
  },
});
