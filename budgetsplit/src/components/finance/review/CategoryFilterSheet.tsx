import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SheetModal } from '../../ui/SheetModal';
import { Card } from '../../ui/Card';
import { ListRow } from '../../ui/ListRow';
import { Divider } from '../../ui/Divider';
import { IconCircle } from '../../ui/IconCircle';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { categoryVisual } from '../../../constants/categories';
import { colors, type, space, radius, layout } from '../../tokens';

type Props = {
  visible: boolean;
  /** Every category on offer — the ones present in the list being filtered. */
  categories: string[];
  selected: string[];
  onClose: () => void;
  onApply: (categories: string[]) => void;
};

/**
 * Pick the categories to filter by — a searchable list, tick as many as you like.
 *
 * It used to be every category as a wrapped wall of chips in the filter form, which
 * grows without bound and was single-choice: "Food or Groceries" was impossible. The
 * chips sat in the form's own sheet, so the form is now one line ("Any category ›")
 * that opens this, the same shape as the date range.
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

  const toggle = (c: string) => setDraft(d => (d.includes(c) ? d.filter(x => x !== c) : [...d, c]));

  return (
    <SheetModal visible={visible} onClose={onClose} title="Category">
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

      {shown.length === 0 ? (
        <Text style={styles.empty}>No category matches “{query.trim()}”</Text>
      ) : (
        <Card clip>
          {shown.map((c, i) => {
            const on = draft.includes(c);
            const v = categoryVisual(c);
            return (
              <View key={c}>
                {i > 0 && <Divider indent="text" />}
                <ListRow
                  leading={<IconCircle icon={v.icon} size={layout.iconCircle} color={v.color} />}
                  title={c}
                  value={<Feather name={on ? 'check-square' : 'square'} size={20} color={on ? colors.accent : colors.textMuted} />}
                  chevron={false}
                  selected={on}
                  onPress={() => toggle(c)}
                  accessibilityLabel={c}
                />
              </View>
            );
          })}
        </Card>
      )}

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
  empty: { ...type.body, color: colors.textMuted, textAlign: 'center', paddingVertical: space.lg },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md },
  clearBtn: { paddingHorizontal: space.md, paddingVertical: 12 },
  clearText: { ...type.label, color: colors.expense, fontFamily: 'Inter_600SemiBold' },
  clearOff: { color: colors.textMuted },
  apply: { flex: 1 },
});
