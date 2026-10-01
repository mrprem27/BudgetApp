import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, type, space, radius } from '../../tokens';
import { Chip } from '../../ui/Chip';
import { OptionRow } from '../../ui/OptionRow';
import { MemberAvatar } from '../MemberAvatar';
import { formatRupees } from '../../../lib/money';
import { SPLIT_MODE, SPLIT_MODE_LABEL, type SplitMode } from '../../../constants/enums';
import type { Person } from '../../../db/queries/persons';

/**
 * The shared split allocator: who is in, and how it divides. Presentational and fully
 * controlled, so the SAME UI backs Quick Add's SplitSheet, the itemized per-item split and the
 * import group-split. One raw string per member for the active mode, and a `result` callback for
 * the computed paise (single source of split UI across the app, [[feedback_no_duplicate_logic]]).
 *
 * Laid out for the common case (yours, 2026-10-01). Equal is what almost every split is, and
 * then the whole job is choosing people: so the people are names you tap, with one line saying
 * what each pays. How it divides is one dropdown at the top right, as the Budget's period is,
 * instead of four pills over every split; the other three modes are a form (a field per person),
 * and only they show one. The list opens in place: this sits inside a sheet in Quick Add, and a
 * sheet inside a sheet fights over `lib/sheetStage`.
 */

const PLACEHOLDER: Record<SplitMode, string> = { equal: '', exact: '₹0', percent: '%', shares: '1' };
const KEYBOARD: Record<SplitMode, 'decimal-pad' | 'number-pad'> = {
  equal: 'number-pad', exact: 'decimal-pad', percent: 'decimal-pad', shares: 'number-pad',
};
const MODE_HINT: Record<SplitMode, string> = {
  equal: 'Everyone chosen pays the same',
  shares: 'By parts: 2 pays twice what 1 pays',
  exact: 'Type what each person owes',
  percent: 'Type each person’s percentage',
};

type Props = {
  members: Person[];
  /** Included member ids. */
  included: string[];
  onToggle: (id: string) => void;
  mode: SplitMode;
  onMode: (m: SplitMode) => void;
  /** Raw input for a member in the active non-equal mode. */
  rawValue: (id: string) => string;
  onValue: (id: string, v: string) => void;
  /** Computed share (paise) for a member — shown alongside/instead of the input. */
  result: (id: string) => number;
  avatarSize?: number;
};

export function SplitEditor({ members, included, onToggle, mode, onMode, rawValue, onValue, result, avatarSize = 36 }: Props) {
  const [picking, setPicking] = useState(false);
  const count = included.length;
  // Equal can leave a paisa or two unevenly spread, so "each" is the largest share.
  const each = count > 0 ? Math.max(...included.map(result)) : 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.headText} numberOfLines={1}>
          {count === 0 ? 'Pick who shares this'
            : mode === 'equal' ? `${formatRupees(each)} each · ${count} ${count === 1 ? 'person' : 'people'}`
            : `${count} ${count === 1 ? 'person' : 'people'}`}
        </Text>
        <Chip
          size="sm"
          label={SPLIT_MODE_LABEL[mode]}
          chevron
          selected={picking}
          onPress={() => setPicking(p => !p)}
          accessibilityLabel={`Split ${SPLIT_MODE_LABEL[mode]}. Change how it divides`}
        />
      </View>

      {picking && (
        <View style={styles.modes}>
          {SPLIT_MODE.map(m => (
            <OptionRow key={m} label={SPLIT_MODE_LABEL[m]} description={MODE_HINT[m]} selected={m === mode}
              onPress={() => { setPicking(false); if (m !== mode) onMode(m); }} />
          ))}
        </View>
      )}

      {mode === 'equal' ? (
        // Names to tap, in or out. Nothing to type, so no rows and no fields.
        <View style={styles.people}>
          {members.map(mem => {
            const on = included.includes(mem.id);
            return (
              <Chip
                key={mem.id}
                leading={<MemberAvatar name={mem.name} color={mem.avatar_color} size={20} imageUri={mem.image_uri} />}
                label={mem.name}
                selected={on}
                onPress={() => onToggle(mem.id)}
                accessibilityLabel={`${mem.name}, ${on ? 'in the split' : 'not in the split'}`}
              />
            );
          })}
        </View>
      ) : members.map(mem => {
        const on = included.includes(mem.id);
        return (
          // The whole row toggles, not only the avatar (`U-67`): a 36pt disc was the only target, so
          // "who is in this split" was a precision tap on each face.
          <TouchableOpacity
            key={mem.id}
            style={styles.row}
            onPress={() => onToggle(mem.id)}
            activeOpacity={0.7}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${mem.name}, ${on ? 'in the split' : 'not in the split'}`}
          >
            <MemberAvatar name={mem.name} color={mem.avatar_color} size={avatarSize} imageUri={mem.image_uri} selected={on} />
            <Text style={[styles.name, !on && styles.nameOff]} numberOfLines={1}>{mem.name}</Text>
            {on && (
              <TextInput
                style={styles.input}
                value={rawValue(mem.id)}
                onChangeText={v => onValue(mem.id, v)}
                keyboardType={KEYBOARD[mode]}
                placeholder={PLACEHOLDER[mode]}
                placeholderTextColor={colors.textMuted}
                accessibilityLabel={`${mem.name} ${mode}`}
              />
            )}
            {on && <Text style={styles.result}>{formatRupees(result(mem.id))}</Text>}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  headText: { ...type.label, color: colors.textSecondary, flex: 1 },
  modes: { gap: space.sm },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  name: { ...type.body, color: colors.textPrimary, flex: 1 },
  nameOff: { color: colors.textMuted },
  input: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: space.xs, width: 80, textAlign: 'right', borderWidth: 1, borderColor: colors.border },
  result: { fontFamily: 'SpaceMono_400Regular', fontSize: 13, color: colors.textSecondary, minWidth: 64, textAlign: 'right' },
});
