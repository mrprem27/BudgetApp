import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { colors, type, space, radius, layout } from '../tokens';
import { GROUP_TYPES, asFeather } from '../../constants/palette';
import { PersonPicker } from './PersonPicker';
import { IconCircle } from '../ui/IconCircle';
import { Card } from '../ui/Card';
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
      {/* The name in a card row beside the group's own icon, so choosing a type below previews on it. */}
      <Card clip>
        <View style={styles.nameRow}>
          <IconCircle icon={asFeather(values.icon, 'users')} size={layout.iconCircle} color={colors.onAccent} bg={values.color} />
          <TextInput
            style={styles.nameInput}
            placeholder="Group name"
            placeholderTextColor={colors.textMuted}
            value={values.name}
            onChangeText={(t) => onChange({ name: t })}
            autoFocus={autoFocusName}
            autoCapitalize="words"
            maxLength={40}
            accessibilityLabel="Group name"
          />
        </View>
      </Card>

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
          {/* The shared people grid (`U-22`, `W1-18`), not a third avatar strip of its own. */}
          <PersonPicker persons={allPersons} selected={values.members} onToggle={toggleMember} onNew={onRequestNewPerson} />
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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.smd, paddingHorizontal: space.md, minHeight: layout.rowMinHeight },
  nameInput: { ...type.body, color: colors.textPrimary, flex: 1, paddingVertical: space.smd },
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
  // Dashed, not solid — an empty slot rather than a person, the same
  // distinction `CategoryPicker`'s own `+` tile draws with a plain accent
  // ring instead of a filled disc.
});
