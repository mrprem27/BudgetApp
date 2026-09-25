import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, type, space, layout } from '../src/theme';
import { IconCircle } from '../src/components/ui/IconCircle';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { SecondaryButton } from '../src/components/ui/SecondaryButton';
import { extractAuthToken, serverConfigured } from '../src/lib/serverApi';
import { useEmailSignIn } from '../src/hooks/useEmailSignIn';
import { FirstSignInStep } from '../src/components/system/FirstSignInStep';

/**
 * Where a tapped sign-in link lands: `budgetsplit:///auth?token=…`, redirected
 * here from the Worker's `/auth/open` (mail clients won't render a custom scheme
 * as a link, so the email points at https and bounces back).
 *
 * The token is spent here, once. React re-running an effect must not spend it
 * twice — the second attempt would fail, since the server marks it used — hence
 * the `attempted` ref rather than relying on the effect's dependency list.
 *
 * It signs in through `useEmailSignIn`'s `signInWithToken`, the same path as a
 * typed code, so a tapped link settles the first sign-in (upload, restore or ask,
 * `SPEC-SERVER.md` §4) exactly as the code does. This is the path most people
 * take; skipping it here would leave them signed in to a phone that never syncs.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const [linkError, setLinkError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const { signInWithToken, restoring, merging, asking, canMerge, answer, error: signInError } = useEmailSignIn();
  const error = linkError ?? signInError;
  const attempted = useRef(false);

  const raw = typeof params.token === 'string' ? params.token : '';

  const goToAccount = useCallback(() => router.replace('/settings/account'), [router]);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    (async () => {
      if (!serverConfigured()) {
        setLinkError('This build has no server configured, so sign-in links can’t be used.');
        return;
      }
      const token = extractAuthToken(raw);
      if (!token) {
        setLinkError('That sign-in link is incomplete. Open the link from the email again.');
        return;
      }
      const result = await signInWithToken(token);
      if (result === 'signed-in') setDone(true);
      // "Not now" signed out and changed nothing; a failure stays on screen.
      if (result !== 'failed') goToAccount();
    })();
  }, [raw, goToAccount, signInWithToken]);

  if (error) {
    return (
      <View style={styles.container}>
        <IconCircle icon="alert-circle" size={56} iconSize={20} color={colors.expense} />
        <Text style={styles.title}>Couldn’t sign you in</Text>
        <Text style={styles.body}>{error}</Text>
        <PrimaryButton label="Try again from Account" onPress={goToAccount} style={styles.cta} />
        <SecondaryButton label="Not now" onPress={() => router.replace('/')} style={styles.secondary} />
      </View>
    );
  }

  if (restoring !== null || merging !== null || asking) {
    return (
      <View style={styles.page}>
        {restoring !== null ? <FirstSignInStep kind="restore" progress={restoring} />
          : merging !== null ? <FirstSignInStep kind="merge" progress={merging} />
          : (
            <FirstSignInStep
              kind="ask"
              canMerge={canMerge}
              onMerge={() => answer('merge')}
              onUseAccount={() => answer('use-my-account')}
              onNotNow={() => answer('not-now')}
            />
          )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.accent} size="large" />
      <Text style={styles.title}>{done ? 'Signed in' : 'Signing you in…'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  container: {
    flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center',
    padding: layout.screenPaddingH, gap: space.sm,
  },
  title: { ...type.subheading, color: colors.textPrimary, marginTop: space.sm, textAlign: 'center' },
  body: { ...type.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  cta: { marginTop: space.md, alignSelf: 'stretch' },
  secondary: { alignSelf: 'stretch' },
});
