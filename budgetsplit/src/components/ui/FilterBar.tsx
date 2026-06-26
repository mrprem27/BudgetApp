import React, { useRef } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity, Animated } from 'react-native';
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
  /**
   * When true, the search bar collapses to a search icon until tapped.
   * Expands inline on tap; collapses again when cleared and blurred.
   */
  collapsible?: boolean;
  /** Chip groups (kind, range, action, entity, …). */
  groups?: ChipGroup[];
  /** Selected value per group key. Missing key = first option. */
  selected: Record<string, string>;
  onSelect: (key: string, value: string) => void;
};

/**
 * Reusable filter bar: a search box plus one or more horizontally-scrolling
 * chip groups. Used by group transactions, history, and reports.
 */
export function FilterBar({
  search, onSearch, searchPlaceholder = 'Search…', collapsible = false,
  groups = [], selected, onSelect,
}: Props) {
  const [expanded, setExpanded] = React.useState(!collapsible || !!search);
  const inputRef = useRef<TextInput>(null);
  const widthAnim = useRef(new Animated.Value(collapsible && !search ? 0 : 1)).current;

  function expand() {
    setExpanded(true);
    Animated.timing(widthAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start(
      () => inputRef.current?.focus(),
    );
  }

  function collapse() {
    if (!search) {
      Animated.timing(widthAnim, { toValue: 0, duration: 160, useNativeDriver: false }).start(
        () => setExpanded(false),
      );
    }
  }

  return (
    <View style={styles.wrap}>
      {onSearch && (
        <View style={styles.searchRow}>
          {collapsible && !expanded ? (
            <TouchableOpacity
              onPress={expand}
              hitSlop={8}
              style={styles.searchIconBtn}
              accessibilityRole="button"
              accessibilityLabel="Open search"
            >
              <Feather name="search" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.searchBox}>
              <Feather name="search" size={15} color={colors.textMuted} />
              <TextInput
                ref={inputRef}
                style={styles.searchInput}
                placeholder={searchPlaceholder}
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={onSearch}
                autoCorrect={false}
                returnKeyType="search"
                onBlur={collapsible ? collapse : undefined}
              />
              {!!search && (
                <TouchableOpacity onPress={() => { onSearch(''); if (collapsible) collapse(); }} hitSlop={8} accessibilityLabel="Clear search">
                  <Feather name="x" size={15} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Filter chips scroll inline with the search icon when collapsible */}
          {collapsible && !expanded && groups.map(g => {
            const active = selected[g.key] ?? g.options[0]?.value;
            return (
              <ScrollView
                key={g.key}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRowInline}
                keyboardShouldPersistTaps="handled"
                style={{ flex: 1 }}
              >
                {g.options.map(o => {
                  const isActive = active === o.value;
                  return (
                    <TouchableOpacity
                      key={o.value}
                      style={[styles.chip, isActive && styles.chipActive]}
                      onPress={() => onSelect(g.key, o.value)}
                      hitSlop={{ top: 6, bottom: 6 }}
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
      )}

      {/* Chip groups below search (when search is expanded or no search) */}
      {(!collapsible || expanded) && groups.map(g => {
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
                  hitSlop={{ top: 6, bottom: 6 }}
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
  wrap: { gap: space.xs },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  searchIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    height: 40,
  },
  searchInput: { flex: 1, ...type.body, color: colors.textPrimary, padding: 0 },
  chipRow: { gap: space.xs, paddingRight: space.sm },
  chipRowInline: { gap: space.xs, paddingRight: space.sm, flexDirection: 'row', alignItems: 'center' },
  chip: {
    paddingHorizontal: space.sm + 2,
    height: 30,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.bgMuted,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipActive: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  chipText: { ...type.label, color: colors.textSecondary },
  chipTextActive: { color: colors.accent, fontFamily: 'Inter_600SemiBold' },
});
