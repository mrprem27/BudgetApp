import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, type, space, layout } from '../src/theme';
import { IconCircle } from '../src/components/ui/IconCircle';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { SecondaryButton } from '../src/components/ui/SecondaryButton';
import { haptic } from '../src/lib/haptics';
import {
  claimInvite, extractInviteToken, getStoredSession, serverConfigured,
} from '../src/lib/serverApi';

type State = 'working' | 'pending' | 'linked' | 'signin' | 'error';

/**
 * Where a tapped invite link lands: `budgetsplit:///link?token=…`, redirected
 * here from the Worker's `/invite/open`.
 *
 * Claiming does **not** link anything — it asks. An invite is made to be
 * forwarded, so the person who sent it confirms that whoever opened it is who
 * they meant. This screen's job is to say that clearly, so "pending" reads as
 * the design rather than as something having gone wrong.
 */
export default function LinkInviteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const [state, setState] = useState<State>('working');
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  const raw = typeof params.token === 'string' ? params.token : '';
  const goHome = useCallback(() => router.replace('/'), [router]);
  const goAccount = useCallback(() => router.replace('/settings/account'), [router]);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    (async () => {
      if (!serverConfigured()) {
        setState('error');
        setError('This build has no server configured, so invite links can’t be used.');
        return;
      }
      const token = extractInviteToken(raw);
      if (!token) {
        setState('error');
        setError('That invite link is incomplete. Ask them to send it again.');
        return;
      }
      // Claiming needs an account of your own — there is nothing to link otherwise.
      if (!(await getStoredSession())) {
        setState('signin');
        return;
      }
      try {
        const result = await claimInvite(token);
        setState(result === 'already-linked' ? 'linked' : 'pending');
        haptic.success();
      } catch (e) {
        haptic.error();
        setState('error');
        setError(e instanceof Error ? e.message : 'Could not open that invite. Please try again.');
      }
    })();
  }, [raw]);

  if (state === 'working') {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.title}>Opening the invite…</Text>
      </View>
    );
  }

  if (state === 'signin') {
    return (
      <View style={styles.container}>
        <IconCircle icon="user-plus" size={56} iconSize={20} color={colors.accent} bg={colors.accentMuted} />
        <Text style={styles.title}>Sign in to accept</Text>
        <Text style={styles.body}>
          Linking connects two accounts, so you’ll need one of your own first. It takes an
          email and one tap — no password.
        </Text>
        <PrimaryButton label="Sign in" onPress={goAccount} style={styles.cta} />
        <SecondaryButton label="Not now" onPress={goHome} style={styles.secondary} />
      </View>
    );
  }

  if (state === 'pending') {
    return (
      <View style={styles.container}>
        <IconCircle icon="clock" size={56} iconSize={20} color={colors.accent} bg={colors.accentMuted} />
        <Text style={styles.title}>Asked to link</Text>
        <Text style={styles.body}>
          They’ll see your name and confirm it’s you before anything connects — an invite
          link can be forwarded, so the person who sent it gets the last word. Nothing is
          shared until then.
        </Text>
        <PrimaryButton label="Done" onPress={goHome} style={styles.cta} />
      </View>
    );
  }

  if (state === 'linked') {
    return (
      <View style={styles.container}>
        <IconCircle icon="check" size={56} iconSize={20} color={colors.income} />
        <Text style={styles.title}>Already linked</Text>
        <Text style={styles.body}>You two are connected already — nothing to do.</Text>
        <PrimaryButton label="Done" onPress={goHome} style={styles.cta} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <IconCircle icon="alert-circle" size={56} iconSize={20} color={colors.expense} />
      <Text style={styles.title}>Couldn’t open that invite</Text>
      <Text style={styles.body}>{error}</Text>
      <PrimaryButton label="Done" onPress={goHome} style={styles.cta} />
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
