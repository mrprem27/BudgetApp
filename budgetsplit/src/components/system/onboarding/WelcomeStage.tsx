import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, space } from '../../tokens';
import { IconCircle } from '../../ui/IconCircle';
import { OptionRow } from '../../ui/OptionRow';

type Props = {
  onNew: () => void;
  onExisting: () => void;
  /** Hidden when the build has no server configured — nothing to sign in to. */
  showExisting: boolean;
};

/**
 * The fork right after the hero: are you setting this phone up for the first
 * time, or do you already have an account? (`SPEC-2026-09-FEEDBACK.md` §3 `entry-gate`.)
 *
 * No `selected` on either row, so both draw a chevron rather than a radio —
 * the same reasoning the (now-removed) Siri row in the permissions step
 * established: a row whose tap *leaves this screen* is a door, not a state,
 * and a radio that can never fill claims to answer a question it isn't
 * asking. Body-only, like `SummaryStage` — `Onboarding.tsx` supplies the
 * `StepScaffold` around it.
 */
export function WelcomeStage({ onNew, onExisting, showExisting }: Props) {
  return (
    <View style={styles.cards}>
      <OptionRow
        label="I'm new here"
        description="Set up in about 20 seconds."
        onPress={onNew}
        leading={<IconCircle icon="star" size={40} color={colors.accent} />}
      />
      {showExisting && (
        <OptionRow
          label="I have an account"
          description="Sign in with your email."
          onPress={onExisting}
          leading={<IconCircle icon="log-in" size={40} color={colors.accent} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cards: { gap: space.sm },
});
