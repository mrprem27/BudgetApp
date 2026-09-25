import React from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../tokens';
import { GROUP_TYPES } from '../../constants/palette';
import { MemberAvatar } from './MemberAvatar';
import { IconCircle } from '../ui/IconCircle';
import { TabPills } from '../ui/TabPills';
import type { Person } from '../../db/queries/persons';
import { SPLIT_MODE, SPLIT_MODE_LABEL, type SplitMode } from '../../constants/enums';

// GROUP_TYPES lives with the other catalogues in constants/palette.
export { GROUP_TYPES };

// Derived from the canonical set so the options, their labels and their order
// can never drift from what the Add screen's split sheet shows.
export const SPLIT_OPTIONS: { key: SplitMode; label: string }[] =
  SPLIT_MODE.map(key => ({ key, label: SPLIT_MODE_LABEL[key] }));

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
  /**
   * Opens the caller's add-friend sheet (`PersonNameSheet`, the one Friends
   * and group Members already use) from the `+` tile at the end of the
   * member row. Omit to hide the tile — `GroupForm` has no DB access of its
   * own, so creating the person and adding them to `values.members` is the
   * caller's job once the sheet resolves.
   */
  onRequestNewPerson?: () => void;
};

/**
 * Shared group editor used by both New Group and Edit Group — one source of
 * truth for name, type (icon+colour), members and default split.
 *
 * Type is a row of coloured icon tiles, one per `GROUP_TYPES` entry — each
 * type's own colour as the tile fill, not a text chip that left the colour
 * and icon `GROUP_TYPES` already carries unused (`SPEC-2026-09-FEEDBACK.md` §5, T14). Default
 * split is `TabPills`: it is a single choice, and a `Chip` row reads as
 * multi-select (`AGENTS.md` §9 — "segmented choice → TabPills, not a chip
 * row").
 */
export function GroupForm({ values, onChange, allPersons, showMembers = true, autoFocusName = false, onRequestNewPerson }: Props) {
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
      <View style={styles.typeGrid}>
        {GROUP_TYPES.map(t => {
          const on = values.icon === t.icon;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.typeTile, on && styles.typeTileActive]}
              onPress={() => onChange({ icon: t.icon, color: t.color })}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t.label}
            >
              <IconCircle icon={t.icon} size={40} color={colors.onAccent} bg={t.color} />
              <Text style={[styles.typeLabel, on && styles.typeLabelActive]} numberOfLines={1}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {showMembers && (allPersons.length > 0 || onRequestNewPerson) && (
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
            {onRequestNewPerson && (
              <TouchableOpacity style={styles.memberPick} onPress={onRequestNewPerson} accessibilityRole="button" accessibilityLabel="Add a new friend">
                <View style={styles.memberAddWrap}>
                  <Feather name="plus" size={18} color={colors.accent} />
                </View>
                <Text style={styles.memberPickName} numberOfLines={1}>New</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </>
      )}

      {showMembers && (
        <>
          <Text style={styles.fieldLabel}>Default split</Text>
          <TabPills
            tabs={SPLIT_OPTIONS.map(s => ({ key: s.key, label: s.label }))}
            active={values.defaultSplit}
            onChange={(key) => onChange({ defaultSplit: key as SplitMode })}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border },
  fieldLabel: { ...type.label, color: colors.textSecondary, marginTop: space.md, marginBottom: space.xs },
  // Type tiles — fixed width rather than `flex: 1` (CategoryPicker's grid
  // shape): six items wrap to two rows on a narrow phone, and a fixed width
  // keeps every tile the same size whichever row it lands on.
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  typeTile: {
    width: 72, alignItems: 'center', gap: space.xs, paddingVertical: space.sm,
    borderRadius: radius.md, borderWidth: 1, borderColor: 'transparent',
  },
  typeTileActive: { borderColor: colors.accent, backgroundColor: colors.bgMuted },
  typeLabel: { ...type.caption, color: colors.textSecondary, textAlign: 'center' },
  typeLabelActive: { color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  memberRow: { gap: space.md, paddingVertical: space.xs, paddingRight: space.md },
  memberPick: { alignItems: 'center', gap: space.xs, width: 52 },
  memberAvatarWrap: { borderRadius: 24, borderWidth: 2, borderColor: 'transparent' },
  memberAvatarOn: { borderColor: colors.accent },
  memberCheck: { position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bgCard },
  memberPickName: { ...type.caption, color: colors.textSecondary, fontSize: 10 },
  // Dashed, not solid — an empty slot rather than a person, the same
  // distinction `CategoryPicker`'s own `+` tile draws with a plain accent
  // ring instead of a filled disc.
  memberAddWrap: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderStyle: 'dashed' as const,
    borderColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
});
