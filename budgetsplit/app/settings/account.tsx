import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
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
import { useServerSession } from '../../src/hooks/useServerSession';
import { useStore } from '../../src/store';
import { haptic } from '../../src/lib/haptics';
import {
  requestMagicLink, verifyMagicLink, signOut, updateProfile, uploadAvatar,
  extractAuthToken, deviceLabel,
} from '../../src/lib/serverApi';

/** Same permissive shape the server uses — the real proof is that the email arrives. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The account screen: sign in by email link, see what the server holds about
 * you, sign out.
 *
 * An account buys exactly one thing today — a backup that survives losing this
 * phone (`settings/backup.tsx`). It does not sync: the ledger stays local-first,
 * and everything on this screen works or fails without touching it.
 */
export default function AccountScreen() {
  const router = useRouter();
  const { session, ready, configured, reload } = useServerSession();
  const me = useStore(s => s.me);

  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showPhone, setShowPhone] = useState(false);
  const [phoneText, setPhoneText] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');

  async function handleSendLink() {
    const address = email.trim().toLowerCase();
    if (!EMAIL_RE.test(address)) { setError('That doesn’t look like an email address.'); return; }
    setSending(true);
    setError(null);
    try {
      await requestMagicLink(address);
      setSentTo(address);
      setCode('');
      haptic.success();
    } catch (e) {
      haptic.error();
      setError(message(e));
    } finally {
      setSending(false);
    }
  }

  async function handleVerifyCode() {
    const token = extractAuthToken(code);
    if (!token) { setError('That code doesn’t look right. Copy the whole code from the email.'); return; }
    setVerifying(true);
    setError(null);
    try {
      await verifyMagicLink(token);
      setSentTo(null);
      setCode('');
      await reload();
      haptic.success();
    } catch (e) {
      haptic.error();
      setError(message(e));
    } finally {
      setVerifying(false);
    }
  }

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

  function handleSignOut() {
    Alert.alert(
      'Sign out?',
      'Your data stays on this device. Server backups stay on the server — sign in again to restore one.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            await reload();
            haptic.warning();
          },
        },
      ],
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Account" onBack={() => router.back()} />
      <KeyboardAwareScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
                label="Sign out"
                tint={colors.expense}
                onPress={handleSignOut}
              />
            </Card>

            <Text style={styles.footnote}>
              Your number is never used to find you — nobody can look you up by it, and it is
              only ever shown to people you have linked with and allowed to see it.
            </Text>

            <Text style={styles.footnote}>
              Signing in adds one thing: a backup that outlives this phone. Your transactions,
              groups and goals still live only on this device, and a server backup is encrypted
              here first — the passphrase never leaves your phone, so nobody at the other end can
              open it.
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
                onSubmitEditing={handleVerifyCode}
                accessibilityLabel="Sign-in code"
              />
              <PrimaryButton
                label="Sign in with code"
                onPress={handleVerifyCode}
                loading={verifying}
                disabled={code.trim().length === 0}
                style={styles.cta}
              />
              <SecondaryButton
                label="Use a different email"
                onPress={() => { setSentTo(null); setCode(''); setError(null); }}
                style={styles.secondaryCta}
              />
            </Card>
            {error && <Text style={styles.error}>{error}</Text>}
          </>
        ) : (
          <>
            <Card padded style={styles.heroCard}>
              <IconCircle icon="cloud" size={56} iconSize={20} color={colors.accent} bg={colors.accentMuted} />
              <Text style={styles.heroTitle}>Back up beyond this phone</Text>
              <Text style={styles.note}>
                Sign in with your email — no password — and you can store encrypted backups off
                this device, so losing the phone doesn’t lose your data. Nothing else is uploaded.
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
                onSubmitEditing={handleSendLink}
                accessibilityLabel="Email address"
              />
              <PrimaryButton
                label="Email me a sign-in link"
                onPress={handleSendLink}
                loading={sending}
                disabled={email.trim().length === 0}
                style={styles.cta}
              />
            </Card>
            {error && <Text style={styles.error}>{error}</Text>}
          </>
        )}
      </KeyboardAwareScrollView>

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
