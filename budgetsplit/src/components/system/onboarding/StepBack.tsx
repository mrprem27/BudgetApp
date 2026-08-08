import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, space, radius, layout } from '../../tokens';

/**
 * The back control on an onboarding step.
 *
 * This chevron was copy-pasted into seven stages under the style name `nameBack` —
 * named for the step it was born on, then reused by every step after it. A circular
 * surface (rather than a bare glyph) makes the target visible and gets it to
 * `layout.touchMin`; the old version was a 40pt-tall strip with a negative margin.
 */
export function StepBack({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={10}
      style={styles.btn}
      accessibilityRole="button"
      accessibilityLabel="Back"
    >
      <Feather name="chevron-left" size={22} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: layout.touchMin,
    height: layout.touchMin,
    borderRadius: radius.pill,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    // Optically centres the chevron, which carries trailing whitespace.
    paddingRight: 2,
    marginLeft: -space.xs,
  },
});
