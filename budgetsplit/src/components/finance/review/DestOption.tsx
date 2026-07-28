import React from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../../tokens';

/**
 * One selectable row in a Review picker sheet — "where does this go?" (Personal
 * vs a group) and "who was this transfer with?" (a member).
 *
 * Pass `icon` for the plain Feather variant, or `leading` to supply your own
 * node (e.g. a `MemberAvatar`). Both share one style block so the two sheets
 * can't drift apart.
 */
export function DestOption({ label, icon, leading, active, onPress }: {
  label: string;
  icon?: 'user' | 'users';
  leading?: React.ReactNode;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.destOption, active && styles.destOptionOn]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      {leading ?? (icon && <Feather name={icon} size={16} color={active ? colors.settle : colors.textSecondary} />)}
      <Text style={[styles.destOptionText, active && { color: colors.settle, fontFamily: 'Inter_600SemiBold' }]}>{label}</Text>
      {active && <Feather name="check" size={16} color={colors.settle} style={{ marginLeft: 'auto' }} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  destOption: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.sm, borderRadius: radius.md },
  destOptionOn: { backgroundColor: colors.bgMuted },
  destOptionText: { ...type.body, color: colors.textPrimary },
});
