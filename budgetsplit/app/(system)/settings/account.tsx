import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Feather } from '@expo/vector-icons';
import { KeyboardForm } from '../../../src/components/ui/KeyboardForm';
import { useRouter } from 'expo-router';
import { fullDate } from '../../../src/lib/dateFormat';
import { colors, type, space, layout } from '../../../src/theme';
import { ScreenHeader } from '../../../src/components/ui/ScreenHeader';
import { Card } from '../../../src/components/ui/Card';
import { Input } from '../../../src/components/ui/Input';
import { PhoneInput } from '../../../src/components/ui/PhoneInput';
import { PrimaryButton } from '../../../src/components/ui/PrimaryButton';
import { SecondaryButton } from '../../../src/components/ui/SecondaryButton';
import { IconCircle } from '../../../src/components/ui/IconCircle';
import { InfoLabel } from '../../../src/components/ui/InfoLabel';
import { SettingsRow } from '../../../src/components/ui/SettingsRow';
import { Divider } from '../../../src/components/ui/Divider';
import { SectionHeader } from '../../../src/components/ui/SectionHeader';
import { decor } from '../../../src/constants/palette';
import { MemberAvatar } from '../../../src/components/finance/MemberAvatar';
import { SheetModal } from '../../../src/components/ui/SheetModal';
import { SyncStatus } from '../../../src/components/system/SyncStatus';
import { FirstSignInStep } from '../../../src/components/system/FirstSignInStep';
import { MergeDuplicatesSheet } from '../../../src/components/finance/MergeDuplicatesSheet';
import { getPendingMergeDuplicates } from '../../../src/lib/pendingMergeDuplicates';
import type { MergeDuplicate } from '../../../src/lib/sync';
import { useServerSession } from '../../../src/hooks/useServerSession';
import { useEmailSignIn } from '../../../src/hooks/useEmailSignIn';
import { useSignOut } from '../../../src/hooks/useSignOut';
import { useStore } from '../../../src/store';
import { haptic } from '../../../src/lib/haptics';
import {
  deleteAccount, updateProfile, uploadAvatar, deviceLabel,
} from '../../../src/lib/serverApi';
import { backOr } from '../../../src/lib/nav';
import { saveMyName } from '../../../src/lib/settingsData';
import { useExportAll } from '../../../src/hooks/useExportAll';
import { replacePersonPhoto } from '../../../src/lib/personWrites';
import { useDataRefresh } from '../../../src/components/system/DataRefreshProvider';

/**
 * Profile (`U-92`): who you are here, in one screen. Your photo and name (on this phone, with or
 * without a server), then the account: sign in by email link, see what the server holds about
 * you, sign out. Laid out as Settings is: a section label, a card of rows, one hue per section.
 *
 * The route is still `/settings/account`: a rename would have moved every link to it for nothing.
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
  const db = useSQLiteContext();
  const { refresh } = useDataRefresh();
  const { session, ready, configured, reload } = useServerSession();
  const me = useStore(s => s.me);
  const { exporting, exportAll } = useExportAll(db);
  const [showName, setShowName] = useState(false);
  const [nameText, setNameText] = useState('');

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
   * device profile is the one the user edits (the rows at the top of this screen), so a
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

  /** The name on this phone. `refresh()` re-hydrates the store, which is where `me` is read from. */
  async function saveName() {
    const trimmed = nameText.trim();
    if (!trimmed || !me) return;
    await saveMyName(db, me.id, trimmed);
    refresh();
    haptic.success();
    setShowName(false);
  }

  async function changePhoto() {
    if (!me) return;
    try {
      if (await replacePersonPhoto(db, me)) { haptic.success(); refresh(); }
    } catch { haptic.error(); }
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
      + 'everything that was yours alone, your own spending, goals, budgets, and any '
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

  // "Your data" closes every state of this screen, and the error line follows whichever card raised it.
  const yourData = (
    <>
      <SectionHeader title="Your data" />
      <Card clip style={styles.card}>
        <SettingsRow icon="shield" label="Backup & restore" value="Encrypted" tint={TINT.data} onPress={() => router.push('/settings/backup')} />
        <Divider indent="text" />
        {/* Was a tile at the foot of Insights, with a line of text for its loading state. It is
            your data leaving the phone as a file, so it sits with the backup (yours, 2026-10-01). */}
        <SettingsRow
          icon="download"
          label={exporting ? 'Preparing your file…' : 'Export all data'}
          value={exporting ? undefined : 'One CSV'}
          tint={TINT.data}
          onPress={exporting ? undefined : exportAll}
          right={exporting ? <ActivityIndicator size="small" color={TINT.data} /> : undefined}
        />
      </Card>
    </>
  );
  const errorLine = error ? <Text style={styles.error}>{error}</Text> : null;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Profile" onBack={() => backOr(router, '/(tabs)')} />
      <KeyboardForm contentContainerStyle={styles.content}>
        {/* Who you are. The photo is the one control up here; everything else is a row below. */}
        <View style={styles.hero}>
          <TouchableOpacity onPress={changePhoto} accessibilityRole="button" accessibilityLabel="Change photo" hitSlop={4}>
            <MemberAvatar
              name={me?.name ?? session?.user.name ?? '?'}
              color={me?.avatar_color ?? colors.accent}
              size={88}
              imageUri={me?.image_uri}
            />
            <View style={styles.cameraBadge} pointerEvents="none">
              <Feather name="camera" size={13} color={colors.bg} />
            </View>
          </TouchableOpacity>
          <Text style={styles.heroName} numberOfLines={1}>{me?.name ?? 'You'}</Text>
          <Text style={styles.heroSub} numberOfLines={1}>{session ? session.user.email : 'On this phone'}</Text>
        </View>

        <SectionHeader title="Your details" />
        <Card clip style={styles.card}>
          <SettingsRow icon="user" label="Name" value={me?.name ?? 'Not set'} tint={TINT.details} onPress={() => { setNameText(me?.name ?? ''); setShowName(true); }} />
          {session && (
            <>
              <Divider indent="text" />
              <SettingsRow
                icon="phone"
                label="Phone"
                value={session.user.phone ?? 'Not set'}
                tint={TINT.details}
                onPress={() => { setPhoneText(session.user.phone ?? ''); setShowPhone(true); }}
              />
            </>
          )}
        </Card>

        {!configured ? (
          <>
            {yourData}
            <Text style={styles.meta}>No account in this build. Everything stays on this phone.</Text>
          </>
        ) : !ready ? (
          <ActivityIndicator color={colors.accent} style={styles.loading} />
        ) : session ? (
          <>
            <SectionHeader title="Account" />
            <SyncStatus onPress={() => router.push('/settings/sync')} onConnect={() => { void connect(); }} />
            <Card clip style={styles.card}>
              <SettingsRow
                icon="refresh-cw"
                label="Update profile from this device"
                tint={TINT.account}
                value={syncing ? undefined : session.user.avatarUrl ? 'Name · picture' : 'Name only'}
                onPress={syncing ? undefined : handleSyncProfile}
                right={syncing ? <ActivityIndicator size="small" color={colors.accent} /> : undefined}
              />
              <Divider indent="text" />
              <SettingsRow icon="users" label="Linked people" value="Invite · approve" tint={TINT.account} onPress={() => router.push('/settings/linked')} />
            </Card>
            {errorLine}
            {yourData}

            {/* Leaving, on its own: the two rows that cannot be taken back sit apart from the rest. */}
            <Card clip style={styles.leaving}>
              <SettingsRow
                icon="log-out"
                label={signingOut ? 'Signing out…' : 'Sign out'}
                tint={colors.expense}
                onPress={signingOut ? undefined : handleSignOut}
                right={signingOut ? <ActivityIndicator size="small" color={colors.expense} /> : undefined}
              />
              <Divider indent="text" />
              <SettingsRow
                icon="trash-2"
                label="Delete account"
                tint={colors.expense}
                onPress={deleting ? undefined : handleDeleteAccount}
                right={deleting ? <ActivityIndicator size="small" color={colors.expense} /> : undefined}
              />
            </Card>
            <Text style={styles.meta}>
              Signed in on {deviceLabel()} · account created {fullDate(new Date(session.user.createdAt))}
            </Text>
          </>
        ) : sentTo ? (
          <>
            <SectionHeader title="Sign in" />
            <Card padded style={styles.card}>
              <View style={styles.signInHead}>
                <IconCircle icon="mail" size={layout.avatarSize} color={colors.accent} bg={colors.accentMuted} />
                <View style={styles.signInText}>
                  <Text style={styles.signInTitle}>Check your inbox</Text>
                  <Text style={styles.signInSub} numberOfLines={1}>Link sent to {sentTo}</Text>
                </View>
              </View>
              {/* The link only works on the phone with the app installed, so the email
                  also prints a code — this is the way in when the mail was opened on a laptop. */}
              <Input
                value={code}
                onChangeText={(t) => { setCode(t); setError(null); }}
                placeholder="Or paste the code from the email"
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
              <SecondaryButton label="Use a different email" onPress={useDifferentEmail} style={styles.secondaryCta} />
              <Text style={styles.signInHint}>The link works once, on this phone, for 15 minutes.</Text>
            </Card>
            {errorLine}
            {yourData}
          </>
        ) : (
          <>
            <SectionHeader title="Sign in" />
            <Card padded style={styles.card}>
              <View style={styles.signInHead}>
                <IconCircle icon="cloud" size={layout.avatarSize} color={colors.accent} bg={colors.accentMuted} />
                <View style={styles.signInText}>
                  <InfoLabel
                    label="Keep a copy on your account"
                    labelStyle={styles.signInTitle}
                    accessibilityLabel="About signing in"
                    info="Optional. Your account keeps a copy of what is on this phone, so a new phone gets it back by signing in. No password, only a link by email."
                  />
                  <Text style={styles.signInSub}>Optional. No password.</Text>
                </View>
              </View>
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
            {errorLine}
            {yourData}
          </>
        )}
      </KeyboardForm>

      <SheetModal visible={showName} onClose={() => setShowName(false)} title="Your name">
        <Input value={nameText} onChangeText={setNameText} placeholder="Your name" autoFocus maxLength={30} autoCapitalize="words" returnKeyType="done" onSubmitEditing={saveName} style={styles.nameInputGap} />
        <PrimaryButton label="Save" onPress={saveName} disabled={!nameText.trim()} />
      </SheetModal>

      <SheetModal visible={showPhone} onClose={() => setShowPhone(false)} title="Your phone number">
        <PhoneInput
          value={phoneText}
          onChangeText={setPhoneText}
          accessibilityLabel="Your phone number"
        />
        <Text style={styles.sheetHint}>
          Not verified, and not a way to sign in, the email link stays that. It is shared only
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

/** One hue per section, as Settings does it. */
const TINT = { details: decor.blue, account: colors.accent, data: colors.settle } as const;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  // No `gap`: `SectionHeader` owns its margins, and the two add up (AGENTS.md §3).
  content: { padding: layout.screenPaddingH },
  loading: { marginTop: space.xl },
  hero: { alignItems: 'center', paddingTop: space.sm, paddingBottom: space.sm },
  heroName: { ...type.heading, color: colors.textPrimary, marginTop: space.md },
  heroSub: { ...type.body, color: colors.textSecondary, marginTop: 2 },
  cameraBadge: { position: 'absolute', right: 0, bottom: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  card: { marginBottom: space.md },
  leaving: { marginTop: space.sm, marginBottom: space.sm },
  meta: { ...type.caption, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
  signInHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  signInText: { flex: 1, minWidth: 0 },
  signInTitle: { ...type.bodySemi, color: colors.textPrimary },
  signInSub: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  signInHint: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.md },
  cta: { marginTop: space.md },
  secondaryCta: { marginTop: space.sm },
  error: { ...type.body, color: colors.expense, textAlign: 'center', marginBottom: space.md },
  sheetHint: { ...type.caption, color: colors.textMuted, lineHeight: 18, marginTop: space.sm, marginBottom: space.md },
  nameInputGap: { marginBottom: space.md },
});
