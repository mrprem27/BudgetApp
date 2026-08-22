import React from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, type, space, radius } from '../../tokens';

/**
 * Small selectable pill used by the Review filter and save-view forms.
 * Shared by {@link FilterForm} and {@link SaveViewForm}, which is why it lives
 * in its own file rather than inside either one.
 */
export function FChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.fChip, on && styles.fChipOn]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      <Text style={[styles.fChipText, on && styles.fChipTextOn]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // No `maxWidth`. The row already wraps (`fChipRow` is `flexWrap: 'wrap'`), so a
  // long label needs a new line, not an ellipsis: the 160pt cap produced the
  // "Househol…" pattern on exactly the chips whose whole job is to name which
  // filter is active. `space.smd` is the scale's 12 — `space.smd` was not on it.
  fChip: { paddingHorizontal: space.smd, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.bgMuted, borderWidth: 1, borderColor: colors.border },
  fChipOn: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  fChipText: { ...type.label, color: colors.textSecondary },
  fChipTextOn: { color: colors.accent, fontFamily: 'Inter_600SemiBold' },
});

/** Form styles shared by the two Review sheet forms (labels, inputs, actions). */
export const reviewFormStyles = StyleSheet.create({
  fLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, fontFamily: 'Inter_600SemiBold', marginBottom: 6 },
  fInput: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: 10 },
  fChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fActions: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm },
  fClearBtn: { paddingHorizontal: space.md, paddingVertical: 12 },
  fClearText: { ...type.label, color: colors.expense, fontFamily: 'Inter_600SemiBold' },
});
