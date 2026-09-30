import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../tokens';
import { MemberAvatar } from './MemberAvatar';
import { haptic } from '../../lib/haptics';
import type { Person } from '../../db/queries/persons';

type PickerPerson = Pick<Person, 'id' | 'name' | 'avatar_color'> & Partial<Pick<Person, 'image_uri' | 'is_me'>>;

type Props = {
  persons: PickerPerson[];
  selected: string[];
  onToggle: (id: string) => void;
  onCreate?: (name: string) => Promise<Person>;
  exclude?: string[];
  multi?: boolean;
  placeholder?: string;
};

/** Past this many people, a search field earns its place. */
const SEARCH_FROM = 8;
const AVATAR = 52;

/**
 * Choosing people, as a grid of faces (`U-22`): four across, a tap ticks one (accent ring and a
 * ✓). With `onCreate`, a **+ New** tile comes first and focuses the "Search or add…" field, where a
 * typed name that matches nobody can be created. One control for every place people are picked.
 */
export function PersonPicker({
  persons, selected, onToggle, onCreate, exclude, multi = true, placeholder = onCreate ? 'Search or add…' : 'Search people…',
}: Props) {
  const [query, setQuery] = useState('');
  const input = useRef<TextInput>(null);

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
  const showSearch = !!onCreate || persons.length > SEARCH_FROM;

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
      {showSearch && (
        <View style={styles.searchRow}>
          <Feather name="search" size={16} color={colors.textMuted} />
          <TextInput
            ref={input}
            style={styles.searchInput}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => { if (canCreate) void handleCreate(); }}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
              <Feather name="x" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {canCreate && (
        <TouchableOpacity style={styles.createRow} onPress={handleCreate} accessibilityRole="button">
          <Feather name="user-plus" size={16} color={colors.accent} />
          <Text style={styles.createText} numberOfLines={1}>Add “{query.trim()}”</Text>
        </TouchableOpacity>
      )}

      <View style={styles.grid}>
        {onCreate && !query && (
          <TouchableOpacity style={styles.tile} onPress={() => input.current?.focus()} accessibilityRole="button" accessibilityLabel="Add a new person">
            <View style={styles.newCircle}><Feather name="plus" size={22} color={colors.accent} /></View>
            <Text style={[styles.name, { color: colors.accent }]} numberOfLines={1}>New</Text>
          </TouchableOpacity>
        )}
        {visible.map(p => {
          const on = selected.includes(p.id);
          return (
            <TouchableOpacity
              key={p.id}
              style={styles.tile}
              onPress={() => { haptic.selection(); onToggle(p.id); }}
              accessibilityRole={multi ? 'checkbox' : 'button'}
              accessibilityState={multi ? { checked: on } : { selected: on }}
              accessibilityLabel={p.is_me ? 'You' : p.name}
            >
              <View>
                <MemberAvatar name={p.name} color={p.avatar_color} size={AVATAR} imageUri={p.image_uri} selected={on} />
                {on && <View style={styles.badge}><Feather name="check" size={11} color={colors.onAccent} /></View>}
              </View>
              {/* The full name, on two lines: two Rahuls must never be two identical tiles. */}
              <Text style={[styles.name, on && styles.nameOn]} numberOfLines={2}>{p.is_me ? 'You' : p.name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {visible.length === 0 && !canCreate && <Text style={styles.empty}>No matches</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.md },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    backgroundColor: colors.bgInput, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: space.md, height: 44,
  },
  searchInput: { flex: 1, ...type.body, color: colors.textPrimary, padding: 0 },
  createRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44,
    paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: colors.accentMuted,
  },
  createText: { ...type.body, color: colors.accent, fontFamily: 'Inter_600SemiBold', flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md },
  tile: { width: '25%', alignItems: 'center', gap: space.xs },
  newCircle: {
    width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  badge: {
    position: 'absolute', right: -2, bottom: -2, width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.bgCard, alignItems: 'center', justifyContent: 'center',
  },
  name: { ...type.caption, color: colors.textSecondary, maxWidth: '90%', textAlign: 'center' },
  nameOn: { color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  empty: { ...type.body, color: colors.textMuted, textAlign: 'center', paddingVertical: space.lg },
});
