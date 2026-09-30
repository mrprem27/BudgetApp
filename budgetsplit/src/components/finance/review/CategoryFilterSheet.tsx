import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SheetModal } from '../../ui/SheetModal';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { categoryVisual } from '../../../constants/categories';
import { CategoryTileGrid } from '../CategoryTileGrid';
import { colors, type, space, radius } from '../../tokens';

type Props = {
  visible: boolean;
  /** Every category on offer — the ones present in the list being filtered. */
  categories: string[];
  selected: string[];
  onClose: () => void;
  onApply: (categories: string[]) => void;
};

/**
 * Pick the categories to filter by — the same tile grid Add's category picker uses, tick as many
 * as you like (`U-42`: this used to be a plain list of checkbox rows, a different control for the
 * same choice shown one screen over).
 *
 * It used to be every category as a wrapped wall of chips in the filter form, which grows without
 * bound and was single-choice: "Food or Groceries" was impossible. The chips sat in the form's own
 * sheet, so the form is now one line ("Any category ›") that opens this, the same shape as the
 * date range.
 *
 * A draft, applied by the button: ticking is free to change your mind about.
 */
export function CategoryFilterSheet({ visible, categories, selected, onClose, onApply }: Props) {
  const [draft, setDraft] = useState<string[]>(selected);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (visible) { setDraft(selected); setQuery(''); }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...categories].sort((a, b) => a.localeCompare(b)).filter(c => !q || c.toLowerCase().includes(q));
  }, [categories, query]);

  const items = useMemo(() => shown.map(c => {
    const v = categoryVisual(c);
    return { key: c, label: c, icon: v.icon, color: v.color };
  }), [shown]);

  const toggle = (c: string) => setDraft(d => (d.includes(c) ? d.filter(x => x !== c) : [...d, c]));

  return (
    <SheetModal visible={visible} onClose={onClose} title="Category" scroll={false}>
      <View style={styles.search}>
        <Feather name="search" size={15} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search categories"
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          accessibilityLabel="Search categories"
        />
        {!!query && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
            <Feather name="x" size={15} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <CategoryTileGrid
        items={items}
        isSelected={key => draft.includes(key)}
        onToggle={toggle}
        showCheck
        emptyText={`No category matches “${query.trim()}”`}
      />

      <View style={styles.actions}>
        <TouchableOpacity onPress={() => setDraft([])} disabled={draft.length === 0} style={styles.clearBtn} accessibilityRole="button">
          <Text style={[styles.clearText, draft.length === 0 && styles.clearOff]}>Clear</Text>
        </TouchableOpacity>
        <View style={styles.apply}>
          <PrimaryButton
            label={draft.length === 0 ? 'Show all categories' : `Apply · ${draft.length} selected`}
            onPress={() => { onApply(draft); onClose(); }}
          />
        </View>
      </View>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bgInput, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, minHeight: 44, marginBottom: space.md },
  searchInput: { flex: 1, ...type.body, color: colors.textPrimary, paddingVertical: space.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md },
  clearBtn: { paddingHorizontal: space.md, paddingVertical: 12 },
  clearText: { ...type.label, color: colors.expense, fontFamily: 'Inter_600SemiBold' },
  clearOff: { color: colors.textMuted },
  apply: { flex: 1 },
});
