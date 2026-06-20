import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../tokens';
import { MemberAvatar } from './MemberAvatar';
import { haptic } from '../../lib/haptics';
import type { Person } from '../../db/queries/persons';

type Props = {
  persons: Person[];
  selected: string[];
  onToggle: (id: string) => void;
  onCreate?: (name: string) => Promise<Person>;
  exclude?: string[];
  multi?: boolean;
  placeholder?: string;
};

export function PersonPicker({
  persons, selected, onToggle, onCreate, exclude, multi = true, placeholder = 'Search or add…',
}: Props) {
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const ex = new Set(exclude ?? []);
    let list = persons.filter(p => !ex.has(p.id));
    const q = query.trim().toLowerCase();
    if (q) list = list.filter(p => p.name.toLowerCase().includes(q));
    return list;
  }, [persons, exclude, query]);

  const exactMatch = useMemo(
    () => persons.some(p => p.name.toLowerCase() === query.trim().toLowerCase()),
    [persons, query],
  );
  const canCreate = !!onCreate && query.trim().length > 1 && !exactMatch;

  async function handleCreate() {
    if (!onCreate) return;
    try {
      const p = await onCreate(query.trim());
      haptic.success();
      onToggle(p.id);
      setQuery('');
    } catch {
      haptic.error();
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <Feather name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder={placeholder}
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

      {canCreate && (
        <TouchableOpacity style={styles.createRow} onPress={handleCreate} accessibilityRole="button">
          <View style={styles.createIcon}>
            <Feather name="plus" size={16} color={colors.accent} />
          </View>
          <Text style={styles.createText}>Create "{query.trim()}"</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={visible}
        keyExtractor={p => p.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const on = selected.includes(item.id);
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() => { haptic.selection(); onToggle(item.id); }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <MemberAvatar name={item.name} color={item.avatar_color} size={36} />
              <Text style={styles.name} numberOfLines={1}>{item.name}{item.is_me ? ' (you)' : ''}</Text>
              {on && <Feather name="check-circle" size={20} color={colors.accent} />}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          !canCreate ? <Text style={styles.empty}>No matches</Text> : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.sm },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    backgroundColor: colors.bgInput, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: space.md, height: 44,
  },
  searchInput: { flex: 1, ...type.body, color: colors.textPrimary, padding: 0 },
  createRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    padding: space.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.accent, borderStyle: 'dashed',
  },
  createIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  createText: { ...type.body, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    paddingVertical: space.sm, minHeight: 52,
  },
  name: { ...type.body, color: colors.textPrimary, flex: 1 },
  empty: { ...type.body, color: colors.textMuted, textAlign: 'center', paddingVertical: space.lg },
});
