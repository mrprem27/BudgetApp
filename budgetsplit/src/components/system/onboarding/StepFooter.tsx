import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { colors, type, space } from '../../tokens';

type Props = {
  primaryLabel: string;
  onPrimary: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Renders the quiet escape hatch below the CTA. Omit for steps with no skip. */
  skipLabel?: string;
  onSkip?: () => void;
  skipDisabled?: boolean;
};

/**
 * The CTA block at the bottom of an onboarding step: one primary button, with an
 * optional quiet skip beneath it. Copy-pasted into six stages before this existed.
 *
 * It keeps its own `gap`/`paddingTop` rather than sharing the hero's, because the
 * hero block in `Onboarding.tsx` is off limits (`AGENTS.md` §11) and reaching into
 * it for a style object is how that rule gets eroded. The geometry is identical and
 * intended to stay identical — the two are one screen apart in the same flow.
 *
 * (This note originally cited the hero's delays as `4300/4520/4760`, which was
 * accurate when it was written — those values ran from June to August 2026. A later
 * edit "corrected" it to say they had never run, which was itself wrong. The timing
 * is stated in exactly one place now, `HERO_REVEAL_MS`, so this note no longer
 * quotes it at all.)
 */
export function StepFooter({
  primaryLabel, onPrimary, disabled, loading, skipLabel, onSkip, skipDisabled,
}: Props) {
  // No bottom padding of its own: `StepScaffold` pins this in `KeyboardForm`'s
  // footer, which clears the home indicator with the keyboard down and keeps a
  // gap above the keys with it up.
  return (
    <View style={styles.footer}>
      <PrimaryButton label={primaryLabel} onPress={onPrimary} disabled={disabled} loading={loading} />
      {skipLabel && onSkip && (
        <TouchableOpacity
          onPress={onSkip}
          disabled={skipDisabled}
          hitSlop={10}
          style={styles.skipBtn}
          accessibilityRole="button"
        >
          <Text style={[styles.skipText, skipDisabled && styles.skipOff]}>{skipLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Same geometry as the hero's own footer, declared separately on purpose — see
  // the note above.
  footer: { gap: space.md, paddingTop: space.sm },
  skipBtn: { alignSelf: 'center', paddingVertical: space.xs },
  skipText: { ...type.body, color: colors.textSecondary },
  skipOff: { opacity: 0.4 },
});
