import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { KeyboardForm } from '../../src/components/ui/KeyboardForm';
import { useRouter } from 'expo-router';
import { fullDate } from '../../src/lib/dateFormat';
import { colors, type, space, layout } from '../../src/theme';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { Card } from '../../src/components/ui/Card';
import { Input } from '../../src/components/ui/Input';
import { PrimaryButton } from '../../src/components/ui/PrimaryButton';
import { SecondaryButton } from '../../src/components/ui/SecondaryButton';
import { IconCircle } from '../../src/components/ui/IconCircle';
import { SettingsRow, settingsRowDivider } from '../../src/components/ui/SettingsRow';
import { MemberAvatar } from '../../src/components/finance/MemberAvatar';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { SyncStatus } from '../../src/components/system/SyncStatus';
import { FirstSignInStep } from '../../src/components/system/FirstSignInStep';
import { MergeDuplicatesSheet } from '../../src/components/finance/MergeDuplicatesSheet';
import { getPendingMergeDuplicates } from '../../src/lib/pendingMergeDuplicates';
import type { MergeDuplicate } from '../../src/lib/sync';
import { useServerSession } from '../../src/hooks/useServerSession';
import { useEmailSignIn } from '../../src/hooks/useEmailSignIn';
import { useSignOut } from '../../src/hooks/useSignOut';
import { useStore } from '../../src/store';
import { haptic } from '../../src/lib/haptics';
import { settings } from '../../src/lib/settings';
import {
  deleteAccount, updateProfile, uploadAvatar, deviceLabel,
} from '../../src/lib/serverApi';

/**
 * The account screen: sign in by email link, see what the server holds about
 * you, sign out.
 *
 * An account holds a copy of everything this phone has (`DQ-93`): a new phone
 * gets it back by signing in, and shared groups are exchanged through it
 * (`lib/sync`). The phone stays offline-first — everything on this screen works
 * or fails without blocking the ledger.
 *
 * Signing in also settles the first sign-in (`useEmailSignIn`,
 * `SPEC-SERVER.md` §4): this phone's ledger is uploaded to the account, or —
 * when both hold data — the user chooses, and "Use my account" replaces it.
 */
export default function AccountScreen() {
  const router = useRouter();
  const { session, ready, configured, reload } = useServerSession();
  const me = useStore(s => s.me);

  const {
    email, setEmail, sentTo, code, setCode, sending, verifying, error, setError,
    sendLink, verifyCode, useDifferentEmail, restoring, merging, asking, canMerge, answer, connect,
    mergeDuplicates: freshMergeDuplicates, clearMergeDuplicates,
  } = useEmailSignIn({ onVerified: reload });
  // Persisted duplicates (a merge that ran on auth.tsx or in onboarding, where
  // the hook that found them has since unmounted) — read once on mount, then
  // whichever list is non-null wins so a fresh find is never overwritten by
  // a stale read.
  const [storedMergeDuplicates, setStoredMergeDuplicates] = useState<MergeDuplicate[] | null>(null);
  useEffect(() => {
    getPendingMergeDuplicates().then(d => { if (d.length > 0) setStoredMergeDuplicates(d); }).catch(() => {});
  }, []);
  const mergeDuplicates = freshMergeDuplicates ?? storedMergeDuplicates;
  function dismissMergeDuplicates() {
    setStoredMergeDuplicates(null);
    clearMergeDuplicates();
  }
  // Upload first, then empty the phone (`DQ-97`).
  const { signOut: handleSignOut, signingOut } = useSignOut({ onSignedOut: reload });
  const [syncing, setSyncing] = useState(false);
  const [showPhone, setShowPhone] = useState(false);
  const [phoneText, setPhoneText] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');

  /**
   * Pushes this device's name and picture up. One-directional on purpose: the
   * device profile is the one the user edits (Settings → profile card), so a
   * two-way merge would be inventing a conflict that doesn't exist yet.
   */
  async function handleSyncProfile() {
    setSyncing(true);
    setError(null);
    try {
      await updateProfile({ name: me?.name ?? null });
      if (me?.image_uri) await uploadAvatar(me.image_uri);
      await reload();
      haptic.success();
    } catch (e) {
      haptic.error();
      setError(message(e));
    } finally {
      setSyncing(false);
    }
  }

  /** Self-declared and unverified — the server stores what you type. */
  async function handleSavePhone() {
    setSavingPhone(true);
    setError(null);
    try {
      await updateProfile({ phone: phoneText.trim() || null });
      await reload();
      setShowPhone(false);
      haptic.success();
    } catch (e) {
      haptic.error();
      setError(message(e));
    } finally {
      setSavingPhone(false);
    }
  }

  /**
   * Closing the account. Required by App Store Review 5.1.1(v) — an app that
   * creates an account must let the user delete it from inside the app, not by
   * emailing support.
   *
   * Two confirmations, because it cannot be undone and because the first one is
   * a thing people tap while reading the second line. What the copy has to be
   * exact about is the boundary users get wrong in both directions: the account's
   * copy of what was yours alone IS erased (`server/api/sync/erase.ts`), the ledger
   * on this phone is NOT (Settings has its own wipe for that), and your entries in
   * groups other people are in are not withdrawn — they are the group's record of
   * what was spent, and no more recallable than a message somebody already read.
   */
  function handleDeleteAccount() {
    Alert.alert(
      'Delete your account?',
      'Your email, name and phone are deleted, along with your account’s copy of '
      + 'everything that was yours alone — your own spending, goals, budgets, and any '
      + 'group nobody else is in. Every signed-in device is signed out.\n\n'
      + 'Your transactions on this phone stay exactly as they are. Groups you share with '
      + 'other people carry on: your entries there are the group’s record, and stay.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => Alert.alert(
            'This cannot be undone',
            'Your account’s copy is erased and cannot be recovered. You can sign up again '
            + 'with the same email, but it will be a new, empty account.',
            [
              { text: 'Keep my account', style: 'cancel' },
              { text: 'Delete account', style: 'destructive', onPress: runDeleteAccount },
            ],
          ),
        },
      ],
    );
  }

  async function runDeleteAccount() {
    setDeleting(true);
    setError(null);
    try {
      await deleteAccount();
      await reload();
      haptic.warning();
    } catch (e) {
      // Deliberately not swallowed, unlike sign-out: a deletion that half-worked
      // must not leave the app claiming the account is gone while it is open.
      haptic.error();
      setError(message(e));
    } finally {
      setDeleting(false);
    }
  }

  // The first sign-in's full-screen step (S15): no header, no way back — the
  // restore is atomic and short, and the choice has to be made.
  if (restoring !== null || merging !== null || asking) {
    return (
      <View style={styles.container}>
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
      <ScreenHeader title="Account" onBack={() => router.back()} />
      <KeyboardForm contentContainerStyle={styles.content}>
        {!configured ? (
          <Card padded>
            <Text style={styles.note}>
              This build has no server configured, so there’s nothing to sign in to. Everything
              works offline — use Backup & restore to keep an encrypted copy of your data.
            </Text>
          </Card>
        ) : !ready ? (
          <ActivityIndicator color={colors.accent} style={styles.loading} />
        ) : session ? (
          <>
            <SyncStatus onPress={() => router.push('/settings/sync')} onConnect={() => { void connect(); }} />
            <Card padded style={styles.profileCard}>
              <MemberAvatar
                name={me?.name ?? session.user.name ?? session.user.email}
                color={me?.avatar_color ?? colors.accent}
                size={56}
                imageUri={me?.image_uri}
              />
              <Text style={styles.profileName}>{session.user.name ?? me?.name ?? 'No name yet'}</Text>
              <Text style={styles.profileEmail}>{session.user.email}</Text>
              <Text style={styles.profileMeta}>
                Signed in on {deviceLabel()} · account created {fullDate(new Date(session.user.createdAt))}
              </Text>
            </Card>

            <Card>
              <SettingsRow
                icon="phone"
                label="Phone"
                value={session.user.phone ?? 'Not set'}
                onPress={() => { setPhoneText(session.user.phone ?? ''); setShowPhone(true); }}
              />
              <View style={settingsRowDivider} />
              <SettingsRow
                icon="refresh-cw"
                label="Update profile from this device"
                value={syncing ? undefined : session.user.avatarUrl ? 'Name · picture' : 'Name only'}
                onPress={syncing ? undefined : handleSyncProfile}
                right={syncing ? <ActivityIndicator size="small" color={colors.accent} /> : undefined}
              />
              <View style={settingsRowDivider} />
              <SettingsRow
                icon="users"
                label="Linked people"
                value="Invite · approve"
                onPress={() => router.push('/settings/linked')}
              />
              <View style={settingsRowDivider} />
              <SettingsRow
                icon="shield"
                label="Backup & restore"
                value="Encrypted"
                onPress={() => router.push('/settings/backup')}
              />
              <View style={settingsRowDivider} />
              <SettingsRow
                icon="log-out"
                label={signingOut ? 'Signing out…' : 'Sign out'}
                tint={colors.expense}
                onPress={signingOut ? undefined : handleSignOut}
                right={signingOut ? <ActivityIndicator size="small" color={colors.expense} /> : undefined}
              />
              <View style={settingsRowDivider} />
              <SettingsRow
                icon="trash-2"
                label="Delete account"
                tint={colors.expense}
                onPress={deleting ? undefined : handleDeleteAccount}
                right={deleting ? <ActivityIndicator size="small" color={colors.expense} /> : undefined}
              />
            </Card>

            <Text style={styles.footnote}>
              Your number is never used to find you — nobody can look you up by it, and it is
              only ever shown to people you have linked with and allowed to see it.
            </Text>

            <Text style={styles.footnote}>
              Your transactions, groups and goals are saved to your account and work offline on
              this phone. Signing out uploads anything left, then clears this phone — sign in
              again, here or on a new phone, and everything comes back.
            </Text>
          </>
        ) : sentTo ? (
          <>
            <Card padded style={styles.heroCard}>
              <IconCircle icon="mail" size={56} iconSize={20} color={colors.accent} bg={colors.accentMuted} />
              <Text style={styles.heroTitle}>Check your inbox</Text>
              <Text style={styles.note}>
                We sent a sign-in link to {sentTo}. Open it on this phone and you’re in. The link
                works once and expires in 15 minutes.
              </Text>
            </Card>

            <Card padded>
              {/* The link only works on the phone with the app installed, so the email
                  also prints a code — this is the way in when the mail was opened on a laptop. */}
              <Text style={styles.blockLabel}>Opened the email somewhere else?</Text>
              <Input
                value={code}
                onChangeText={(t) => { setCode(t); setError(null); }}
                placeholder="Paste the code from the email"
                icon="key"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={verifyCode}
                accessibilityLabel="Sign-in code"
              />
              <PrimaryButton
                label="Sign in with code"
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
        ) : (
          <>
            <Card padded style={styles.heroCard}>
              <IconCircle icon="cloud" size={56} iconSize={20} color={colors.accent} bg={colors.accentMuted} />
              <Text style={styles.heroTitle}>Sign in to keep your place</Text>
              <Text style={styles.note}>
                Signing in is how this phone knows it’s you. It stores your email and who you’re
                linked with — never your transactions. Everything works without it.
              </Text>
              <Text style={styles.noteWarn}>
                It does not back anything up on its own. Make a backup under Backup &amp; restore,
                or losing this phone still loses your data.
              </Text>
            </Card>

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
                onSubmitEditing={sendLink}
                accessibilityLabel="Email address"
              />
              <PrimaryButton
                label="Email me a sign-in link"
                onPress={sendLink}
                loading={sending}
                disabled={email.trim().length === 0}
                style={styles.cta}
              />
            </Card>
            {error && <Text style={styles.error}>{error}</Text>}
          </>
        )}
      </KeyboardForm>

      <SheetModal visible={showPhone} onClose={() => setShowPhone(false)} title="Your phone number">
        <Input
          value={phoneText}
          onChangeText={setPhoneText}
          placeholder="+91 98765 43210"
          icon="phone"
          keyboardType="phone-pad"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={24}
          accessibilityLabel="Your phone number"
        />
        <Text style={styles.sheetHint}>
          Not verified, and not a way to sign in — the email link stays that. It is shared only
          with friends you link with, and only when you allow it. Leave it blank to remove it.
        </Text>
        <PrimaryButton label="Save" onPress={handleSavePhone} loading={savingPhone} />
      </SheetModal>

      {mergeDuplicates && (
        <MergeDuplicatesSheet visible duplicates={mergeDuplicates} onClose={dismissMergeDuplicates} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: layout.screenPaddingH, gap: space.md },
  loading: { marginTop: space.xl },
  heroCard: { alignItems: 'center', gap: space.sm },
  heroTitle: { ...type.subheading, color: colors.textPrimary, textAlign: 'center' },
  note: { ...type.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  // Amber, not grey. This line is the correction to what people assume an account
  // does, so it must not read as more of the same explanatory text above it.
  noteWarn: { ...type.caption, color: colors.healthAmber, textAlign: 'center', lineHeight: 18, marginTop: space.sm },
  profileCard: { alignItems: 'center', gap: space.xs },
  profileName: { ...type.subheading, color: colors.textPrimary, marginTop: space.sm },
  profileEmail: { ...type.body, color: colors.textSecondary },
  profileMeta: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.xs },
  blockLabel: { ...type.label, color: colors.textSecondary, marginBottom: space.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  cta: { marginTop: space.md },
  secondaryCta: { marginTop: space.sm },
  error: { ...type.body, color: colors.expense, textAlign: 'center' },
  sheetHint: { ...type.caption, color: colors.textMuted, lineHeight: 18, marginTop: space.sm, marginBottom: space.md },
  footnote: { ...type.caption, color: colors.textMuted, lineHeight: 18, textAlign: 'center' },
});
