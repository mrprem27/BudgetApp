import React, { useRef, useState } from 'react';
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
  /**
   * When true: chips + a compact search icon are shown inline on one row.
   * Tapping the search icon replaces the chip row with a full-width input.
   * Clearing/blurring collapses back.
   */
  collapsible?: boolean;
  /** Chip groups (kind, range, action, entity, …). */
  groups?: ChipGroup[];
  /** Selected value per group key. Missing key = first option. */
  selected: Record<string, string>;
  onSelect: (key: string, value: string) => void;
};

/**
 * Reusable filter bar: chip filters + optional collapsible search.
 *
 * Non-collapsible: search box on top, chip rows below (stacked).
 * Collapsible: all chips + a search icon in one compact row. Tapping the
 * search icon expands to a full-width text input; closing reverts.
 * Chips always live in exactly ONE position — no dual-rendering.
 */
export function FilterBar({
  search, onSearch, searchPlaceholder = 'Search…', collapsible = false,
  groups = [], selected, onSelect,
}: Props) {
  const [searchOpen, setSearchOpen] = useState(!!search);
  const inputRef = useRef<TextInput>(null);

  function openSearch() {
    setSearchOpen(true);
    // Small delay so the input mounts before we try to focus it.
    setTimeout(() => inputRef.current?.focus(), 30);
  }

  function closeSearch() {
    onSearch?.('');
    setSearchOpen(false);
  }

  const chips = groups.flatMap(g => {
    const active = selected[g.key] ?? g.options[0]?.value;
    return g.options.map(o => {
      const isActive = active === o.value;
      return (
        <TouchableOpacity
          key={`${g.key}:${o.value}`}
          style={[styles.chip, isActive && styles.chipActive]}
          onPress={() => onSelect(g.key, o.value)}
          hitSlop={{ top: 6, bottom: 6 }}
          accessibilityRole="button"
          accessibilityState={{ selected: isActive }}
        >
          <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{o.label}</Text>
        </TouchableOpacity>
      );
    });
  });

  if (collapsible) {
    // One row: either chips + search icon, OR full-width search input.
    return (
      <View style={styles.collapsibleRow}>
        {searchOpen ? (
          // Full-width search — chips are fully hidden to free up space.
          <>
            <TouchableOpacity
              onPress={closeSearch}
              hitSlop={8}
              style={styles.collapseBtn}
              accessibilityRole="button"
              accessibilityLabel="Close search"
            >
              <Feather name="chevron-left" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
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
                onBlur={() => { if (!search) closeSearch(); }}
              />
              {!!search && (
                <TouchableOpacity onPress={() => onSearch?.('')} hitSlop={8} accessibilityLabel="Clear search">
                  <Feather name="x" size={15} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </>
        ) : (
          // Chip row + search icon at the end.
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRowContent}
              keyboardShouldPersistTaps="handled"
              style={styles.chipScroll}
            >
              {chips}
            </ScrollView>
            {onSearch && (
              <TouchableOpacity
                onPress={openSearch}
                hitSlop={8}
                style={styles.searchIconBtn}
                accessibilityRole="button"
                accessibilityLabel="Search"
              >
                <Feather name="search" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    );
  }

  // Non-collapsible: search box above, chip rows below.
  return (
    <View style={styles.wrap}>
      {onSearch && (
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
            contentContainerStyle={styles.chipRowContent}
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

  // Collapsible: single row containing chips OR search.
  collapsibleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 40,
  },
  chipScroll: { flex: 1 },
  chipRowContent: { gap: space.xs, alignItems: 'center', flexDirection: 'row' },

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
  collapseBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // Shared search box (used by both collapsible-open and non-collapsible).
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
  // No lineHeight — it misaligns the placeholder/text in a single-line input.
  searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15, color: colors.textPrimary, padding: 0 },

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
