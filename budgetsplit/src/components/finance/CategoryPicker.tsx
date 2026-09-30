import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../tokens';
import { asFeather } from '../../constants/palette';
import { haptic } from '../../lib/haptics';
import type { Category } from '../../db/queries/categories';
import { IconCircle } from '../ui/IconCircle';
import { SheetModal } from '../ui/SheetModal';
import { CategoryTileGrid } from './CategoryTileGrid';

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
 * no existing category, an inline "Create" action appears. The grid itself is
 * `CategoryTileGrid`, shared with Review's category filter (`U-42`).
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

  const items = useMemo(() => filtered.map(c => ({
    key: c.id, label: c.name, icon: asFeather(c.icon, 'tag'), color: c.color ?? colors.accent,
  })), [filtered]);

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
            <IconCircle icon={asFeather(value.icon, 'tag')} size={28} color={value.color ?? colors.accent} iconSize={15} />
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

            <CategoryTileGrid
              items={items}
              isSelected={key => value?.id === key}
              onToggle={key => { const c = filtered.find(x => x.id === key); if (c) pick(c); }}
              listHeader={canCreate ? (
                <TouchableOpacity style={styles.createRow} onPress={create} accessibilityRole="button">
                  <IconCircle icon="plus" size={28} iconSize={16} color={colors.accent} bg={colors.accentMuted} />
                  <Text style={styles.createText}>Create “{query.trim()}”</Text>
                </TouchableOpacity>
              ) : null}
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
});
