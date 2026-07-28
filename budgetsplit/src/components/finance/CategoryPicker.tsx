import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, shadow } from '../tokens';
import { asFeather } from '../../constants/palette';
import { haptic } from '../../lib/haptics';
import type { Category } from '../../db/queries/categories';
import { IconCircle } from '../ui/IconCircle';
import { SheetModal } from '../ui/SheetModal';
import { alpha } from '../../theme';

type Props = {
  categories: Category[];
  value: Category | null;
  onChange: (c: Category) => void;
  /** When provided, lets the user create a new category from the search text. */
  onCreate?: (name: string) => Promise<Category>;
  /** When true, forces the picker sheet open (controlled externally). */
  forceOpen?: boolean;
  /** Called when the sheet closes (used with forceOpen). */
  onClose?: () => void;
  /** When true, hides the trigger button (useful when using forceOpen). */
  hideTrigger?: boolean;
};

/**
 * A tappable field showing the selected category that opens a searchable
 * bottom-sheet of all categories. Typing filters the grid; if the text matches
 * no existing category, an inline "Create" action appears.
 */
export function CategoryPicker({ categories, value, onChange, onCreate, forceOpen, onClose, hideTrigger }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const isOpen = open || !!forceOpen;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(c => c.name.toLowerCase().includes(q));
  }, [categories, query]);

  const exactMatch = useMemo(
    () => categories.some(c => c.name.toLowerCase() === query.trim().toLowerCase()),
    [categories, query],
  );
  const canCreate = !!onCreate && query.trim().length > 0 && !exactMatch;

  function close() {
    setOpen(false);
    setQuery('');
    onClose?.();
  }

  function pick(c: Category) {
    haptic.selection();
    onChange(c);
    close();
  }

  async function create() {
    if (!onCreate) return;
    try {
      const created = await onCreate(query.trim());
      haptic.success();
      onChange(created);
      close();
    } catch {
      // Create failed (e.g. duplicate name / DB error) — keep the sheet open so
      // the user can retry, and signal the failure rather than hanging silently.
      haptic.error();
    }
  }

  return (
    <>
      {!hideTrigger && (
      <TouchableOpacity
        style={styles.field}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={value ? `Category: ${value.name}` : 'Choose category'}
      >
        {value ? (
          <View style={styles.fieldInner}>
            <View style={[styles.iconDot, { backgroundColor: alpha(value.color ?? colors.accent, 13) }]}>
              <Feather name={asFeather(value.icon, 'tag')} size={15} color={value.color ?? colors.accent} />
            </View>
            <Text style={styles.fieldValue}>{value.name}</Text>
          </View>
        ) : (
          <Text style={styles.fieldPlaceholder}>Choose category</Text>
        )}
        <Feather name="chevron-down" size={18} color={colors.textMuted} />
      </TouchableOpacity>
      )}

      {/* SheetModal (via DraggableSheet) owns the backdrop, drag handle, title,
          safe-area padding AND keyboard avoidance — all of which this sheet
          previously hand-rolled around a raw <Modal>. */}
      <SheetModal visible={isOpen} onClose={close} title="Category" scroll={false}>
        <>

            <View style={styles.searchRow}>
              <Feather name="search" size={16} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search or add new…"
                placeholderTextColor={colors.textMuted}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                returnKeyType="done"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                  <Feather name="x" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            <FlatList
              data={filtered}
              keyExtractor={c => c.id}
              numColumns={3}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={styles.grid}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                canCreate ? (
                  <TouchableOpacity style={styles.createRow} onPress={create} accessibilityRole="button">
                    <IconCircle icon="plus" size={28} iconSize={16} color={colors.accent} bg={colors.accentMuted} />
                    <Text style={styles.createText}>Create “{query.trim()}”</Text>
                  </TouchableOpacity>
                ) : null
              }
              ListEmptyComponent={
                !canCreate ? <Text style={styles.empty}>No matches</Text> : null
              }
              renderItem={({ item }) => {
                const active = value?.id === item.id;
                return (
                  <TouchableOpacity
                    style={[styles.tile, active && styles.tileActive]}
                    onPress={() => pick(item)}
                    accessibilityRole="button"
                    accessibilityLabel={item.name}
                    accessibilityState={{ selected: active }}
                  >
                    <View style={[styles.tileIcon, { backgroundColor: alpha(item.color ?? colors.accent, 13) }]}>
                      <Feather name={asFeather(item.icon, 'tag')} size={20} color={item.color ?? colors.accent} />
                    </View>
                    <Text style={[styles.tileLabel, active && styles.tileLabelActive]} numberOfLines={1}>
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
        </>
      </SheetModal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  fieldInner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flex: 1 },
  iconDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  fieldValue: { ...type.body, color: colors.textPrimary },
  fieldPlaceholder: { ...type.body, color: colors.textMuted },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    height: 44,
    marginBottom: space.md,
  },
  searchInput: { flex: 1, ...type.body, color: colors.textPrimary, padding: 0 },
  grid: { paddingBottom: space.md },
  gridRow: { gap: space.sm, marginBottom: space.sm },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.bgMuted,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tileActive: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  tileIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { ...type.caption, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 2 },
  tileLabelActive: { color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    borderStyle: 'dashed',
    marginBottom: space.md,
  },
  createText: { ...type.body, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  empty: { ...type.body, color: colors.textMuted, textAlign: 'center', paddingVertical: space.xl },
});
