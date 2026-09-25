import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { colors, type, space } from '../../tokens';
import { Card } from '../../ui/Card';
import { Input } from '../../ui/Input';
import { IconCircle } from '../../ui/IconCircle';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { SecondaryButton } from '../../ui/SecondaryButton';
import { useEmailSignIn, type SignInOutcome } from '../../../hooks/useEmailSignIn';
import { StepScaffold } from './StepScaffold';
import { FirstSignInStep } from '../FirstSignInStep';
import type { ServerUser } from '../../../lib/serverApi';

type Props = {
  onBack: () => void;
  /** The first sign-in is settled (SPEC-SERVER.md §4). `restored`: the account's
   *  data is now on this phone, and onboarding has nothing left to ask. */
  onVerified: (user: ServerUser, outcome: SignInOutcome) => void;
};

/**
 * Sign in from inside onboarding, by code — not by the emailed link.
 *
 * `useEmailSignIn` is the same hook `settings/account.tsx` uses, so the two
 * screens can't drift on what a valid address is, what the server errors say,
 * or how a phone meets an account. The link opens `budgetsplit:///auth`, a
 * Stack route, and `OnboardingGate` renders `Onboarding` *instead of* the Stack
 * until onboarding is done — so the link has nowhere to land yet, and the code
 * the same email carries is what this screen asks for.
 *
 * It owns its `StepScaffold` because a restore, or the "both have data" choice,
 * replaces the whole step with `FirstSignInStep` (S15: a full-screen step).
 */
export function SignInStage({ onBack, onVerified }: Props) {
  const {
    email, setEmail, sentTo, code, setCode, sending, verifying, restoring, merging, asking, canMerge, error, setError,
    sendLink, verifyCode, answer, useDifferentEmail,
  } = useEmailSignIn({ onVerified });

  if (restoring !== null) return <FirstSignInStep kind="restore" progress={restoring} />;
  if (merging !== null) return <FirstSignInStep kind="merge" progress={merging} />;
  if (asking) {
    return (
      <FirstSignInStep
        kind="ask"
        canMerge={canMerge}
        onMerge={() => answer('merge')}
        onUseAccount={() => answer('use-my-account')}
        onNotNow={() => answer('not-now')}
      />
    );
  }

  return (
    <StepScaffold
      stageKey="signin"
      onBack={onBack}
      title="Sign in"
      subtitle="Then we'll finish setting up this phone."
      footer={null}
    >
      {/* Called, not rendered as <Components>: a component declared inside a
          render is a new type every render, and the field would remount — and
          drop the keyboard — on every keystroke. */}
      {sentTo ? codeEntry() : emailEntry()}
    </StepScaffold>
  );

  function codeEntry() {
    return (
      <>
        <Card padded style={styles.heroCard}>
          <IconCircle icon="key" size={56} iconSize={20} color={colors.accent} bg={colors.accentMuted} />
          <Text style={styles.heroTitle}>Enter your code</Text>
          <Text style={styles.note}>
            We&apos;ve emailed a code to {sentTo}. It expires in 15 minutes.
          </Text>
        </Card>
        <Card padded>
          <Input
            value={code}
            onChangeText={(t) => { setCode(t); setError(null); }}
            placeholder="Code from the email"
            icon="key"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            autoFocus
            onSubmitEditing={verifyCode}
            accessibilityLabel="Sign-in code"
          />
          <PrimaryButton
            label="Sign in"
            onPress={verifyCode}
            loading={verifying}
            disabled={code.trim().length === 0}
            style={styles.cta}
          />
          <SecondaryButton
            label="Use a different email"
            onPress={useDifferentEmail}
            style={styles.secondaryCta}
          />
        </Card>
        {error && <Text style={styles.error}>{error}</Text>}
      </>
    );
  }

  function emailEntry() {
    return (
    <>
      <Card padded>
        <Input
          value={email}
          onChangeText={(t) => { setEmail(t); setError(null); }}
          placeholder="you@example.com"
          icon="mail"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          autoFocus
          onSubmitEditing={sendLink}
          accessibilityLabel="Email address"
        />
        <PrimaryButton
          label="Email me a code"
          onPress={sendLink}
          loading={sending}
          disabled={email.trim().length === 0}
          style={styles.cta}
        />
      </Card>
      {error && <Text style={styles.error}>{error}</Text>}
    </>
    );
  }
}

const styles = StyleSheet.create({
  heroCard: { alignItems: 'center', gap: space.sm },
  heroTitle: { ...type.subheading, color: colors.textPrimary, textAlign: 'center' },
  note: { ...type.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  cta: { marginTop: space.md },
  secondaryCta: { marginTop: space.sm },
  error: { ...type.body, color: colors.expense, textAlign: 'center', marginTop: space.md },
});
