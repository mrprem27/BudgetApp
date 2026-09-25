import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, type, space, layout } from '../tokens';
import { IconCircle } from '../ui/IconCircle';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import { AnimatedBar } from '../ui/anim/AnimatedBar';

type Props =
  | { kind: 'restore'; progress: number }
  | { kind: 'ask'; onUseAccount: () => void; onNotNow: () => void };

/**
 * The first sign-in's full-screen step (SPEC-SERVER.md §6.2, layout picked in
 * S15): onboarding's look — an icon, a title, one sentence, then a progress bar
 * (restore) or the two choices (both have data). Upper third, like every
 * single-question screen (AGENTS.md §6b). The restore can't be cancelled: it is
 * atomic and short, and stopping halfway would only put the phone back.
 *
 * Shared by onboarding's sign-in, Settings → Account and the emailed link, so
 * the three can't word or draw it differently.
 */
export function FirstSignInStep(props: Props) {
  const restoring = props.kind === 'restore';
  const pct = restoring ? Math.round(Math.max(0, Math.min(1, props.progress)) * 100) : 0;

  return (
    <View style={styles.page}>
      <View style={styles.above} />
      <View style={styles.body}>
        <IconCircle
          icon={restoring ? 'download-cloud' : 'smartphone'}
          size={72}
          iconSize={32}
          color={colors.accent}
          bg={colors.accentMuted}
        />
        <Text style={styles.title}>{restoring ? 'Bringing back your data' : 'This phone already has data'}</Text>
        <Text style={styles.sentence}>
          {restoring
            ? 'Keep the app open — this takes a moment.'
            : 'So does your account, and they can’t be merged. “Use my account” saves this phone’s data to a file in Files first, then replaces it. “Not now” signs you out and changes nothing.'}
        </Text>
        {restoring ? (
          <View style={styles.progress}>
            <AnimatedBar progress={pct / 100} height={6} accessibilityLabel={`Restoring, ${pct} percent`} />
            <Text style={styles.pct}>{pct}%</Text>
          </View>
        ) : (
          <View style={styles.actions}>
            <PrimaryButton label="Use my account" onPress={props.onUseAccount} />
            <SecondaryButton label="Not now" onPress={props.onNotNow} />
          </View>
        )}
      </View>
      <View style={styles.below} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: layout.screenPaddingH },
  above: { flex: 1 },
  below: { flex: 2 },
  body: { alignItems: 'center', gap: space.md },
  title: { ...type.title, color: colors.textPrimary, textAlign: 'center' },
  sentence: { ...type.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  progress: { alignSelf: 'stretch', gap: space.sm, marginTop: space.sm },
  pct: { ...type.label, color: colors.textSecondary, textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: space.sm, marginTop: space.md },
});
