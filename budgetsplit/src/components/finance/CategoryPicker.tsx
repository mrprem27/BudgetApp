import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput,
  FlatList, Pressable, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, shadow } from '../tokens';
import { haptic } from '../../lib/haptics';
import type { Category } from '../../db/queries/categories';

type Props = {
  categories: Category[];
  value: Category | null;
  onChange: (c: Category) => void;
  /** When provided, lets the user create a new category from the search text. */
  onCreate?: (name: string) => Promise<Category>;
};

/**
 * A tappable field showing the selected category that opens a searchable
 * bottom-sheet of all categories. Typing filters the grid; if the text matches
 * no existing category, an inline "Create" action appears.
 */
export function CategoryPicker({ categories, value, onChange, onCreate }: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

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
  }

  function pick(c: Category) {
    haptic.selection();
    onChange(c);
    close();
  }

  async function create() {
    if (!onCreate) return;
    const created = await onCreate(query.trim());
    haptic.success();
    onChange(created);
    close();
  }

  return (
    <>
      <TouchableOpacity
        style={styles.field}
        onPress={() => { haptic.light(); setOpen(true); }}
        accessibilityRole="button"
        accessibilityLabel={value ? `Category: ${value.name}` : 'Choose category'}
      >
        {value ? (
          <View style={styles.fieldInner}>
            <View style={[styles.iconDot, { backgroundColor: (value.color ?? colors.accent) + '22' }]}>
              <Feather name={(value.icon ?? 'tag') as any} size={15} color={value.color ?? colors.accent} />
            </View>
            <Text style={styles.fieldValue}>{value.name}</Text>
          </View>
        ) : (
          <Text style={styles.fieldPlaceholder}>Choose category</Text>
        )}
        <Feather name="chevron-down" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
          pointerEvents="box-none"
        >
          <View style={[styles.sheet, { paddingBottom: insets.bottom + space.md }]}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Category</Text>

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
                <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
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
                    <View style={styles.createIcon}>
                      <Feather name="plus" size={16} color={colors.accent} />
                    </View>
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
                    <View style={[styles.tileIcon, { backgroundColor: (item.color ?? colors.accent) + '22' }]}>
                      <Feather name={(item.icon ?? 'tag') as any} size={20} color={item.color ?? colors.accent} />
                    </View>
                    <Text style={[styles.tileLabel, active && styles.tileLabelActive]} numberOfLines={1}>
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
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

  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    maxHeight: '78%',
    ...shadow.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 38, height: 4, borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: space.sm,
  },
  sheetTitle: { ...type.subheading, color: colors.textPrimary, marginBottom: space.sm },
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
  createIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  createText: { ...type.body, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  empty: { ...type.body, color: colors.textMuted, textAlign: 'center', paddingVertical: space.xl },
});
