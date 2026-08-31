import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, type, space, layout } from '../src/theme';
import { IconCircle } from '../src/components/ui/IconCircle';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { SecondaryButton } from '../src/components/ui/SecondaryButton';
import { haptic } from '../src/lib/haptics';
import { extractAuthToken, serverConfigured, verifyMagicLink } from '../src/lib/serverApi';
import { useSQLiteContext } from 'expo-sqlite';
import { claimMyAccount } from '../src/db/queries/persons';

/**
 * Where a tapped sign-in link lands: `budgetsplit:///auth?token=…`, redirected
 * here from the Worker's `/auth/open` (mail clients won't render a custom scheme
 * as a link, so the email points at https and bounces back).
 *
 * The token is spent here, once. React re-running an effect must not spend it
 * twice — the second attempt would fail, since the server marks it used — hence
 * the `attempted` ref rather than relying on the effect's dependency list.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ token?: string }>();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const attempted = useRef(false);

  const raw = typeof params.token === 'string' ? params.token : '';

  const goToAccount = useCallback(() => router.replace('/settings/account'), [router]);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    (async () => {
      if (!serverConfigured()) {
        setError('This build has no server configured, so sign-in links can’t be used.');
        return;
      }
      const token = extractAuthToken(raw);
      if (!token) {
        setError('That sign-in link is incomplete. Open the link from the email again.');
        return;
      }
      try {
        const { user } = await verifyMagicLink(token);
        // Bind the ledger's "me" to the account, exactly as the Account screen
        // does. This is the path most people take — the emailed link — so leaving
        // it out here would mean sharing quietly not working for the majority,
        // and working for whoever happened to paste the code by hand instead.
        // Best-effort: the session IS established, and a refusal has somewhere to
        // be reported (the Account screen this navigates to).
        await claimMyAccount(db, { uid: user.id, email: user.email }).catch(() => {});
        setDone(true);
        haptic.success();
        goToAccount();
      } catch (e) {
        haptic.error();
        setError(e instanceof Error ? e.message : 'Could not finish signing in. Please try again.');
      }
    })();
  }, [raw, goToAccount, db]);

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

  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.accent} size="large" />
      <Text style={styles.title}>{done ? 'Signed in' : 'Signing you in…'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center',
    padding: layout.screenPaddingH, gap: space.sm,
  },
  title: { ...type.subheading, color: colors.textPrimary, marginTop: space.sm, textAlign: 'center' },
  body: { ...type.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  cta: { marginTop: space.md, alignSelf: 'stretch' },
  secondary: { alignSelf: 'stretch' },
});
