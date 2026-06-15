import React from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../tokens';

export type ChipGroup = {
  key: string;
  /** First option is treated as the "All"/reset default. */
  options: { label: string; value: string }[];
};

type Props = {
  /** Search field — omit to hide. */
  search?: string;
  onSearch?: (s: string) => void;
  searchPlaceholder?: string;
  /** Chip groups (kind, range, action, entity, …). */
  groups?: ChipGroup[];
  /** Selected value per group key. Missing key = first option. */
  selected: Record<string, string>;
  onSelect: (key: string, value: string) => void;
};

/**
 * Reusable filter bar: a search box plus one or more horizontally-scrolling
 * chip groups. Used by group transactions, history, and reports — one filter
 * UI, configured per screen. (AGENTS.md / Spec §18.4)
 */
export function FilterBar({ search, onSearch, searchPlaceholder = 'Search…', groups = [], selected, onSelect }: Props) {
  return (
    <View style={styles.wrap}>
      {onSearch && (
        <View style={styles.searchRow}>
          <Feather name="search" size={15} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder={searchPlaceholder}
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={onSearch}
            autoCorrect={false}
            returnKeyType="search"
          />
          {!!search && (
            <TouchableOpacity onPress={() => onSearch('')} hitSlop={8} accessibilityLabel="Clear search">
              <Feather name="x" size={15} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {groups.map(g => {
        const active = selected[g.key] ?? g.options[0]?.value;
        return (
          <ScrollView
            key={g.key}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            keyboardShouldPersistTaps="handled"
          >
            {g.options.map(o => {
              const isActive = active === o.value;
              return (
                <TouchableOpacity
                  key={o.value}
                  style={[styles.chip, isActive && styles.chipActive]}
                  onPress={() => onSelect(g.key, o.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                >
                  <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{o.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    backgroundColor: colors.bgInput, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: space.md, height: 42,
  },
  searchInput: { flex: 1, ...type.body, color: colors.textPrimary, padding: 0 },
  chipRow: { gap: space.xs, paddingRight: space.md },
  chip: {
    paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill,
    backgroundColor: colors.bgMuted, borderWidth: 1, borderColor: 'transparent',
  },
  chipActive: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  chipText: { ...type.label, color: colors.textSecondary },
  chipTextActive: { color: colors.accent, fontFamily: 'Inter_600SemiBold' },
});
