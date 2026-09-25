import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, type, space, layout } from '../tokens';
import { IconCircle } from '../ui/IconCircle';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import { AnimatedBar } from '../ui/anim/AnimatedBar';

type Props =
  | { kind: 'restore'; progress: number }
  | { kind: 'merge'; progress: number }
  | { kind: 'ask'; canMerge: boolean; onMerge: () => void; onUseAccount: () => void; onNotNow: () => void };

/**
 * The first sign-in's full-screen step (SPEC-SERVER.md §6.2, layout picked in
 * S15): onboarding's look — an icon, a title, one sentence, then a progress bar
 * (restore/merge) or the choices (both have data). Upper third, like every
 * single-question screen (AGENTS.md §6b). Neither progress bar can be
 * cancelled: both are atomic and short, and stopping halfway would only put
 * the phone back.
 *
 * Shared by onboarding's sign-in, Settings → Account and the emailed link, so
 * they can't word or draw it differently.
 */
export function FirstSignInStep(props: Props) {
  const progressing = props.kind === 'restore' || props.kind === 'merge';
  const pct = progressing ? Math.round(Math.max(0, Math.min(1, props.progress)) * 100) : 0;

  const title = props.kind === 'restore' ? 'Bringing back your data'
    : props.kind === 'merge' ? 'Bringing your account in'
    : 'This phone already has data';
  const sentence = props.kind === 'restore' ? 'Keep the app open — this takes a moment.'
    : props.kind === 'merge' ? 'Keep the app open — this takes a moment. This phone’s own data goes up next.'
    : (props as Extract<Props, { kind: 'ask' }>).canMerge
      ? 'So does your account. “Merge” keeps both, adding this phone’s data to your account. “Use my account” saves this phone’s data to a file in Files first, then replaces it. “Not now” signs you out and changes nothing.'
      : 'So does your account, and they can’t be merged. “Use my account” saves this phone’s data to a file in Files first, then replaces it. “Not now” signs you out and changes nothing.';

  return (
    <View style={styles.page}>
      <View style={styles.above} />
      <View style={styles.body}>
        <IconCircle
          icon={progressing ? 'download-cloud' : 'smartphone'}
          size={72}
          iconSize={32}
          color={colors.accent}
          bg={colors.accentMuted}
        />
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sentence}>{sentence}</Text>
        {progressing ? (
          <View style={styles.progress}>
            <AnimatedBar
              progress={pct / 100}
              height={6}
              accessibilityLabel={`${props.kind === 'merge' ? 'Merging' : 'Restoring'}, ${pct} percent`}
            />
            <Text style={styles.pct}>{pct}%</Text>
          </View>
        ) : (
          <View style={styles.actions}>
            {props.canMerge && <PrimaryButton label="Merge into my account" onPress={props.onMerge} />}
            <SecondaryButton label="Use my account" onPress={props.onUseAccount} />
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
