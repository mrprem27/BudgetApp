import React from 'react';
import { StyleSheet } from 'react-native';
import { Chip } from '../../ui/Chip';
import { colors, type, space, radius } from '../../tokens';

/**
 * The Review forms' selectable pill — now `ui/Chip`, with the wrapping behaviour
 * those forms need.
 *
 * It was the fourth hand-rolled chip in the app (`OV-34`), alongside `FilterBar`'s,
 * Search's and the Add screen's. All four are `ui/Chip` now. This one survives as a
 * named wrapper rather than disappearing because its callers pass `on`, not
 * `selected`, and because of the note below — deleting it would put that reasoning
 * nowhere.
 *
 * **No `maxWidth`.** The row wraps (`fChipRow` is `flexWrap: 'wrap'`), so a long
 * label needs a new line, not an ellipsis: a cap produced the "Househol…" pattern
 * on exactly the chips whose whole job is to name which filter is active. `Chip`
 * only truncates when given `maxWidth`, so omitting it is the whole fix.
 */
export function FChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return <Chip label={label} selected={on} onPress={onPress} />;
}

/** Form styles shared by the two Review sheet forms (labels, inputs, actions). */
export const reviewFormStyles = StyleSheet.create({
  fLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, fontFamily: 'Inter_600SemiBold', marginBottom: 6 },
  fInput: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: 10 },
  fChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  fActions: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm },
  fClearBtn: { paddingHorizontal: space.md, paddingVertical: 12 },
  fClearText: { ...type.label, color: colors.expense, fontFamily: 'Inter_600SemiBold' },
});
