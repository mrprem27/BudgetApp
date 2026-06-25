import React from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../tokens';
import { MemberAvatar } from './MemberAvatar';
import type { Person } from '../../db/queries/persons';
import type { SplitMode } from '../../db/queries/groups';

// Quick group "types" — each preset picks an icon + colour so creation is one tap.
export const GROUP_TYPES: { key: string; label: string; icon: string; color: string }[] = [
  { key: 'home', label: '🏠 Home', icon: 'home', color: '#4F46E5' },
  { key: 'trip', label: '✈️ Trip', icon: 'map', color: '#20C4B8' },
  { key: 'work', label: '💼 Work', icon: 'briefcase', color: '#7C6AF7' },
  { key: 'dining', label: '🍽️ Dining', icon: 'coffee', color: '#F0A500' },
  { key: 'other', label: 'Other', icon: 'grid', color: '#8FA3A0' },
];

export const SPLIT_OPTIONS: { key: SplitMode; label: string }[] = [
  { key: 'equal', label: 'Equal' },
  { key: 'shares', label: 'Shares' },
  { key: 'exact', label: 'Exact' },
  { key: 'percent', label: 'Percent' },
];

export type GroupFormValues = {
  name: string;
  icon: string;
  color: string;
  members: string[];        // selected non-me person ids
  defaultSplit: SplitMode;
};

type Props = {
  values: GroupFormValues;
  onChange: (patch: Partial<GroupFormValues>) => void;
  /** People available to add as members (exclude "me"). */
  allPersons: Person[];
  /** Hide the members + default-split sections (e.g. the Personal group). */
  showMembers?: boolean;
  autoFocusName?: boolean;
};

/**
 * Shared group editor used by both New Group and Edit Group — one source of
 * truth for name, type (icon+colour), members and default split.
 */
export function GroupForm({ values, onChange, allPersons, showMembers = true, autoFocusName = false }: Props) {
  function toggleMember(id: string) {
    onChange({ members: values.members.includes(id) ? values.members.filter(x => x !== id) : [...values.members, id] });
  }

  return (
    <View>
      <TextInput
        style={styles.input}
        placeholder="Group name"
        placeholderTextColor={colors.textMuted}
        value={values.name}
        onChangeText={(t) => onChange({ name: t })}
        autoFocus={autoFocusName}
        autoCapitalize="words"
        maxLength={40}
        accessibilityLabel="Group name"
      />

      <Text style={styles.fieldLabel}>Type</Text>
      <View style={styles.chipRow}>
        {GROUP_TYPES.map(t => {
          const on = values.icon === t.icon;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => onChange({ icon: t.icon, color: t.color })}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {showMembers && allPersons.length > 0 && (
        <>
          <Text style={styles.fieldLabel}>Members</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberRow} keyboardShouldPersistTaps="handled">
            {allPersons.map(p => {
              const on = values.members.includes(p.id);
              return (
                <TouchableOpacity key={p.id} style={styles.memberPick} onPress={() => toggleMember(p.id)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={p.name}>
                  <View style={[styles.memberAvatarWrap, on && styles.memberAvatarOn]}>
                    <MemberAvatar name={p.name} color={p.avatar_color} size={44} imageUri={p.image_uri} />
                    {on && <View style={styles.memberCheck}><Feather name="check" size={11} color={colors.bg} /></View>}
                  </View>
                  <Text style={styles.memberPickName} numberOfLines={1}>{p.name.split(' ')[0]}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </>
      )}

      {showMembers && (
        <>
          <Text style={styles.fieldLabel}>Default split</Text>
          <View style={styles.chipRow}>
            {SPLIT_OPTIONS.map(s => {
              const on = values.defaultSplit === s.key;
              return (
                <TouchableOpacity
                  key={s.key}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => onChange({ defaultSplit: s.key })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{s.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border },
  fieldLabel: { ...type.label, color: colors.textSecondary, marginTop: space.md, marginBottom: space.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: { paddingHorizontal: space.md, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.bgMuted, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { ...type.label, color: colors.textSecondary },
  chipTextOn: { color: colors.bg, fontFamily: 'Inter_600SemiBold' },
  memberRow: { gap: space.md, paddingVertical: space.xs, paddingRight: space.md },
  memberPick: { alignItems: 'center', gap: 4, width: 52 },
  memberAvatarWrap: { borderRadius: 24, borderWidth: 2, borderColor: 'transparent' },
  memberAvatarOn: { borderColor: colors.accent },
  memberCheck: { position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bgCard },
  memberPickName: { ...type.caption, color: colors.textSecondary, fontSize: 10 },
});
