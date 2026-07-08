import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, type, space, radius } from '../../tokens';
import { MemberAvatar } from '../MemberAvatar';
import { formatRupees } from '../../../lib/money';
import { SPLIT_MODE, SPLIT_MODE_LABEL, type SplitMode } from '../../../constants/enums';
import type { Person } from '../../../db/queries/persons';

/**
 * The shared split allocator — split-mode tabs (Equal / Exact / Percent / Shares)
 * plus a per-member row (tap avatar to include; Equal shows the computed share,
 * other modes take an input). Presentational + fully controlled, so the SAME UI
 * backs Quick Add's SplitSheet, the itemized per-item split, and the import
 * group-split. Value model is unified: one raw string per member for the active
 * mode, and a `result` callback for the computed paise (single source of split
 * UI across the app — see [[feedback_no_duplicate_logic]]).
 */

const PLACEHOLDER: Record<SplitMode, string> = { equal: '', exact: '₹0', percent: '%', shares: '1' };
const KEYBOARD: Record<SplitMode, 'decimal-pad' | 'number-pad'> = {
  equal: 'number-pad', exact: 'decimal-pad', percent: 'number-pad', shares: 'number-pad',
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
  return (
    <View style={styles.wrap}>
      <View style={styles.tabs}>
        {SPLIT_MODE.map(m => (
          <TouchableOpacity
            key={m}
            style={[styles.tab, mode === m && styles.tabOn]}
            onPress={() => onMode(m)}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === m }}
          >
            <Text style={[styles.tabText, mode === m && styles.tabTextOn]}>{SPLIT_MODE_LABEL[m]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {members.map(mem => {
        const on = included.includes(mem.id);
        return (
          <View key={mem.id} style={styles.row}>
            <MemberAvatar name={mem.name} color={mem.avatar_color} size={avatarSize} imageUri={mem.image_uri} selected={on} onPress={() => onToggle(mem.id)} />
            <Text style={styles.name} numberOfLines={1}>{mem.name}</Text>
            {on && mode !== 'equal' && (
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
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  tabs: { flexDirection: 'row', gap: space.xs, backgroundColor: colors.bgMuted, borderRadius: radius.md, padding: 3 },
  tab: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: radius.sm },
  tabOn: { backgroundColor: colors.accent },
  tabText: { ...type.caption, color: colors.textSecondary },
  tabTextOn: { color: colors.bg, fontFamily: 'Inter_600SemiBold' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  name: { ...type.body, color: colors.textPrimary, flex: 1 },
  input: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: space.xs, width: 80, textAlign: 'right', borderWidth: 1, borderColor: colors.border },
  result: { fontFamily: 'SpaceMono_400Regular', fontSize: 13, color: colors.textSecondary, minWidth: 64, textAlign: 'right' },
});
