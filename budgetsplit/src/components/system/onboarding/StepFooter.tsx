import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
 * **It deliberately forks the hero's styling rather than sharing it.** `styles.footer`
 * and `bottomPad` in `Onboarding.tsx` are used by the `stage === 'hero'` block, whose
 * `FadeIn delay={4300/4520/4760}` values are tuned to the ~3.7 s logo physics run.
 * Those are animation, not styling, and the hero is off limits — so this component
 * owns an equivalent `paddingTop`/`gap` and reads the safe-area inset itself, leaving
 * the originals byte-identical.
 */
export function StepFooter({
  primaryLabel, onPrimary, disabled, loading, skipLabel, onSkip, skipDisabled,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.footer, { paddingBottom: insets.bottom + space.xl }]}>
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
  // Forked from Onboarding's `footer` — same geometry, separate declaration.
  footer: { gap: space.md, paddingTop: space.md },
  skipBtn: { alignSelf: 'center', paddingVertical: space.xs },
  skipText: { ...type.body, color: colors.textSecondary },
  skipOff: { opacity: 0.4 },
});
