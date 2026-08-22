import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Switch, TouchableOpacity,
  ScrollView, Alert, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import * as LocalAuthentication from 'expo-local-authentication';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { settings } from '../../src/lib/settings';
import { colors, type, space, radius, layout, shadow } from '../../src/theme';
import { haptic } from '../../src/lib/haptics';
import { formatAgoCompact } from '../../src/lib/time';
import { getMe, getAllPersons, updatePersonName, setPersonImage, setPersonUpiVpa } from '../../src/db/queries/persons';
import { isValidVpa } from '../../src/lib/upiIntent';
import { RequestQrSheet } from '../../src/components/finance/RequestQrSheet';
import { getAllGroups } from '../../src/db/queries/groups';
import { getMyGlobalBudgetRows } from '../../src/db/queries/categoryBudgets';
import { rollUpBudgets } from '../../src/lib/budget';
import { formatCompact } from '../../src/lib/money';
import { buildAllGroupsExportCsv } from '../../src/lib/groupExport';
import { shareCsv } from '../../src/lib/shareCsv';
import { getCategories } from '../../src/db/queries/categories';
import { seedGlobalCategories } from '../../src/db/seedCategories';
import { pickAndSaveAvatar } from '../../src/lib/avatar';
import { deleteAttachment } from '../../src/lib/attachment';
import { MemberAvatar } from '../../src/components/finance/MemberAvatar';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { PayMethodSelector } from '../../src/components/finance/PayMethodSelector';
import { Input } from '../../src/components/ui/Input';
import { PrimaryButton } from '../../src/components/ui/PrimaryButton';
import { SettingsRow, settingsRowDivider } from '../../src/components/ui/SettingsRow';
import { freeBytes } from '../../src/lib/deviceStorage';
import { StorageVerdict, storageVerdict, formatBytes } from '../../src/lib/storage';
import { DEV_TOOLS_ENABLED } from '../../src/constants/devTools';
import { useFeatureFlags } from '../../src/components/system/FeatureFlagsProvider';
import type { Person } from '../../src/db/queries/persons';
import type { BudgetCadence } from '../../src/db/queries/categoryBudgets';
import { asBudgetCadence, asPayMethod, PayMethod, PAY_METHOD_ICON, PAY_METHOD_LABEL } from '../../src/constants/enums';
import { useScreenData } from '../../src/hooks/useScreenData';
import { useServerSession } from '../../src/hooks/useServerSession';
import { ErrorState } from '../../src/components/ui/ErrorState';

const CADENCE_LABELS: Record<BudgetCadence, string> = { daily: 'Daily', monthly: 'Monthly', yearly: 'Yearly' };
const CADENCE_KEYS: BudgetCadence[] = ['daily', 'monthly', 'yearly'];

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { flags, setFlag } = useFeatureFlags();

  const [showName, setShowName] = useState(false);
  const [nameText, setNameText] = useState('');
  const [showVpa, setShowVpa] = useState(false);
  const [vpaText, setVpaText] = useState('');
  const [showMyQr, setShowMyQr] = useState(false);

  // DB-backed values: one loader, with the hook owning focus refetch + errors.
  // The self-heal write is idempotent (only fires on an empty catalog), so it's
  // safe inside a loader that re-runs on focus.
  const { data, error: loadError, reload } = useScreenData(async (database) => {
    const [meRow, allPersons] = await Promise.all([getMe(database), getAllPersons(database)]);
    let count = (await getCategories(database, 'expense')).length;
    if (count === 0) { await seedGlobalCategories(database); count = (await getCategories(database, 'expense')).length; }
    // Just the lines, rolled up — no spend queries: a settings row must not run an
    // all-groups scan to render its subtitle.
    const myBudget = meRow ? await getMyGlobalBudgetRows(database, meRow.id) : [];
    return {
      me: meRow,
      contactCount: allPersons.filter(p => !p.is_me).length,
      budgetMonthly: rollUpBudgets(myBudget, 'monthly', new Date()).amount,
      categoryCount: count,
    };
  }, []);
  const me = data?.me ?? null;
  const contactCount = data?.contactCount ?? 0;
  const categoryCount = data?.categoryCount ?? 0;
  const budgetMonthly = data?.budgetMonthly ?? 0;

  const [biometric, setBiometric] = useState(false);
  const [privacyScreen, setPrivacyScreen] = useState(true);
  // `null` = never. Shown on the row because the only other prompt is a local
  // notification, which needs flags.reminders + an OS grant + a dev build.
  const [backupAt, setBackupAt] = useState<number | null>(null);

  // Free space, shown on the row itself so a filling device is visible from Settings without
  // having to open the screen. Tinted only when it has become worth acting on.
  const storageVerdictNow = storageVerdict(freeBytes());
  const storageLabel = storageVerdictNow === StorageVerdict.Ample
    ? undefined
    : `${formatBytes(freeBytes())} free`;
  const storageTint = storageVerdictNow === StorageVerdict.Full ? colors.expense
    : storageVerdictNow === StorageVerdict.Critical ? colors.healthAmber
    : undefined;
  const [exportingAll, setExportingAll] = useState(false);

  async function handleExportAll() {
    if (exportingAll) return;
    setExportingAll(true);
    haptic.light();
    try {
      const groups = await getAllGroups(db);
      const { csv, rowCount } = await buildAllGroupsExportCsv(db, groups);
      if (rowCount === 0) { Alert.alert('Nothing to export', 'There are no transactions yet.'); return; }
      const { uri, shared } = await shareCsv(csv, 'budgetsplit_all.csv', 'Export all data');
      if (!shared) Alert.alert('Saved', `Sharing isn't available here. The CSV was saved to:\n${uri}`);
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    } finally {
      setExportingAll(false);
    }
  }
  const [hideAmounts, setHideAmounts] = useState(false);

  const [defaultCadence, setDefaultCadence] = useState<BudgetCadence>('monthly');
  const [defaultPay, setDefaultPay] = useState<PayMethod>(PayMethod.Upi);
  const [showPayMethod, setShowPayMethod] = useState(false);
  const [showCadence, setShowCadence] = useState(false);

  const [devTaps, setDevTaps] = useState(0);

  // Optional server account (`server/api`). `configured` is false in any build
  // without EXPO_PUBLIC_API_URL, and then none of this UI exists.
  const { session: serverSession, configured: serverSessionConfigured } = useServerSession();

  /**
   * Only the topmost section drops its top margin, and which section that is
   * depends on what's enabled above it. This was `{ marginTop: 0 }` hardcoded on
   * "Getting paid" plus a one-off ternary on "Manage" — a third optional section
   * would have silently double-spaced.
   */
  const sectionTop = (isFirst: boolean) => (isFirst ? { marginTop: 0 } : null);

  // Local preference toggles (AsyncStorage, not the DB) — re-read on focus so a
  // change made elsewhere is reflected.
  useFocusEffect(useCallback(() => {
    (async () => {
      setBiometric(await settings.biometricEnabled());
      setPrivacyScreen(await settings.privacyScreen());
      setHideAmounts(await settings.hideAmounts());
      // `lastBackupAt`, not the reminder anchor: turning the backup *reminder* on
      // writes the anchor, so this row used to read "Backed up just now" to someone
      // who had never backed up at all.
      setBackupAt(await settings.lastBackupAt());
      // Narrowed, not cast: a database written before `once` was removed still
      // holds it here, and an unknown key would index CADENCE_LABELS to undefined.
      const dc = await settings.defaultCadence();
      if (dc) setDefaultCadence(asBudgetCadence(dc));
      setDefaultPay(asPayMethod(await settings.defaultPayMethod()));
    })();
  }, []));

  async function toggle(persist: (v: boolean) => Promise<void>, val: boolean, setter: (v: boolean) => void) {
    haptic.selection();
    setter(val);
    await persist(val);
  }

  /**
   * Turning the app lock OFF requires passing it first.
   *
   * The lock's entire purpose is that someone holding your unlocked phone cannot
   * read your finances — and this switch let them disable it in two taps, with no
   * challenge at all. A lock that can be removed without satisfying it protects
   * nothing but the screen it draws.
   *
   * Turning it ON is deliberately not gated: there is nothing to protect yet, and
   * demanding Face ID before you may *increase* security is friction with no
   * benefit. `LockGate` proves the hardware works on the next foreground.
   */
  async function toggleLock(next: boolean) {
    if (next) { await toggle(settings.setBiometricEnabled, true, setBiometric); return; }

    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !enrolled) {
      // Nothing left to authenticate against — refusing here would strand the user
      // with a lock they can neither pass nor remove.
      await toggle(settings.setBiometricEnabled, false, setBiometric);
      return;
    }

    try {
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Turn off app lock',
        fallbackLabel: 'Use passcode',
      });
      if (res.success) {
        await toggle(settings.setBiometricEnabled, false, setBiometric);
        return;
      }
      haptic.error();
      Alert.alert('App lock is still on', 'You need to unlock to turn it off.');
    } catch {
      haptic.error();
      Alert.alert('App lock is still on', 'Could not verify it is you, so nothing was changed.');
    }
  }

  async function pickPayMethod(m: PayMethod) {
    setDefaultPay(m);
    setShowPayMethod(false);
    await settings.setDefaultPayMethod(m);
  }

  async function pickCadence(c: BudgetCadence) {
    setDefaultCadence(c);
    setShowCadence(false);
    await settings.setDefaultCadence(c);
  }

  async function saveName() {
    const trimmed = nameText.trim();
    if (!trimmed || !me) return;
    await updatePersonName(db, me.id, trimmed);
    await reload();
    haptic.success();
    setShowName(false);
  }

  /**
   * Your own handle — the one thing a request QR cannot be built without.
   *
   * `friends.tsx` sets a VPA for everyone *except* you (it filters `is_me`), so until
   * this existed there was no way to record your own. Validated with the same
   * `isValidVpa` the pay path uses; a second validator here would be a second answer to
   * the same question.
   */
  async function saveVpa() {
    if (!me) return;
    const trimmed = vpaText.trim();
    // Empty clears it — the only way back out once you have set one.
    if (trimmed && !isValidVpa(trimmed)) {
      haptic.error();
      Alert.alert('That doesn’t look like a UPI ID', 'It should read like name@bank — for example prem@okhdfcbank.');
      return;
    }
    await setPersonUpiVpa(db, me.id, trimmed || null);
    await reload();
    haptic.success();
    setShowVpa(false);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    {/* Persistent status-bar cover — outside the ScrollView so scrolled content
        never paints under the clock/notch once the large title scrolls away. */}
    <View style={[styles.statusBarCover, { height: insets.top, backgroundColor: colors.bg }]} pointerEvents="none" />
    <ScrollView style={styles.container} contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + layout.tabBarHeight + space.lg }]} keyboardShouldPersistTaps="handled">
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Text style={styles.title}>Settings</Text>
      </View>

      {loadError && (
        <ErrorState
          title="Couldn't load your profile"
          body="Your name, contacts and category count couldn't be read. The settings below still work."
          onRetry={reload}
        />
      )}

      {/* Profile card — hero */}
      <TouchableOpacity style={styles.profileCard} onPress={() => { setNameText(me?.name ?? ''); setShowName(true); }} accessibilityRole="button" accessibilityLabel="Edit profile">
        <TouchableOpacity
          onPress={me ? async () => {
            const uri = await pickAndSaveAvatar(me.id);
            if (uri) {
              const old = me.image_uri;
              await setPersonImage(db, me.id, uri);
              // Every avatar pick writes a new timestamped file and never
              // replaces one in place — unlink the one this photo replaces.
              if (old) await deleteAttachment(old);
              haptic.success();
              await reload();
            }
          } : undefined}
          accessibilityLabel="Change avatar"
          hitSlop={4}
        >
          <MemberAvatar
            name={me?.name ?? '?'}
            color={me?.avatar_color ?? colors.accent}
            size={56}
            imageUri={me?.image_uri}
          />
          <View style={styles.cameraBadge} pointerEvents="none">
            <Feather name="camera" size={10} color={colors.bg} />
          </View>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.profileName}>{me?.name ?? '—'}</Text>
          <Text style={styles.profileSub}>
            {serverSession
              ? serverSession.user.email
              : serverSessionConfigured ? 'Offline-first · sign in to back up' : 'Offline-first · no accounts'}
          </Text>
        </View>
        <Feather name="edit-2" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      {/* ACCOUNT — only in a build that has a server to talk to
          (EXPO_PUBLIC_API_URL). Signing in buys one thing: backups that outlive
          this phone. Everything else stays local-first either way, which is why
          this is a row and not a gate in front of the app. */}
      {serverSessionConfigured && (
        <>
          <Text style={[styles.sectionTitle, sectionTop(true)]}>Account</Text>
          <View style={styles.card}>
            <SettingsRow
              icon={serverSession ? 'user-check' : 'cloud'}
              label={serverSession ? 'Account' : 'Sign in'}
              value={serverSession ? serverSession.user.email : 'Back up beyond this phone'}
              onPress={() => { router.push('/settings/account'); }}
            />
          </View>
        </>
      )}

      {/* GETTING PAID — your own handle, and the code others scan to pay you.
          Sits directly under the profile because both rows are about *you*, not about
          the app. `friends.tsx` covers everyone else's handle; it filters out `is_me`. */}
      {flags.upiSettle && (
        <>
          <Text style={[styles.sectionTitle, sectionTop(!serverSessionConfigured)]}>Getting paid</Text>
          <View style={styles.card}>
            <SettingsRow
              icon="credit-card"
              label="Your UPI ID"
              value={me?.upi_vpa ?? 'Not set'}
              onPress={() => { setVpaText(me?.upi_vpa ?? ''); setShowVpa(true); }}
            />
            <View style={settingsRowDivider} />
            <SettingsRow
              icon="maximize"
              label="Show my UPI QR"
              value="Any UPI app"
              onPress={() => setShowMyQr(true)}
            />
          </View>
        </>
      )}

      {/* MANAGE */}
      <Text style={[styles.sectionTitle, sectionTop(!serverSessionConfigured && !flags.upiSettle)]}>Manage</Text>
      <View style={styles.card}>
        <SettingsRow
          icon="users"
          label="People"
          value={contactCount > 0 ? `${contactCount} contact${contactCount !== 1 ? 's' : ''}` : undefined}
          onPress={() => { router.push('/friends'); }}
        />
        <View style={settingsRowDivider} />
        <SettingsRow
          icon="tag"
          label="Categories"
          value={categoryCount > 0 ? `${categoryCount} categor${categoryCount === 1 ? 'y' : 'ies'}` : undefined}
          onPress={() => { router.push('/categories'); }}
        />
        <View style={settingsRowDivider} />
        <SettingsRow
          icon="target"
          label="My Budget"
          value={budgetMonthly > 0 ? `${formatCompact(budgetMonthly)}/mo` : 'Not set'}
          onPress={() => router.push('/budget')}
        />
      </View>

      {/* PREFERENCES */}
      <Text style={styles.sectionTitle}>Preferences</Text>
      <View style={styles.card}>
        <SettingsRow icon="globe" label="Currency" value="INR" onPress={undefined} />
        <View style={settingsRowDivider} />
        <SettingsRow icon={PAY_METHOD_ICON[defaultPay]} label="Default pay method" value={PAY_METHOD_LABEL[defaultPay]} onPress={() => setShowPayMethod(true)} />
        <View style={settingsRowDivider} />
        <SettingsRow icon="repeat" label="Default budget cadence" value={CADENCE_LABELS[defaultCadence]} onPress={() => setShowCadence(true)} />
        <View style={settingsRowDivider} />
        <SettingsRow icon="sliders" label="Feature management" value="Modules & toggles" onPress={() => { router.push('/features'); }} />
        {flags.voiceEntry && (<>
          <View style={settingsRowDivider} />
          <SettingsRow icon="mic" label="Voice entry" value="Hands-free with Siri" onPress={() => { router.push('/settings/voice'); }} />
        </>)}
      </View>

      {/* SECURITY */}
      <Text style={styles.sectionTitle}>Security</Text>
      <View style={styles.card}>
        <ToggleRow icon="lock" label="Face ID / Touch ID lock" value={biometric} onValueChange={toggleLock} />
        <View style={settingsRowDivider} />
        <ToggleRow icon="eye-off" label="Privacy screen in app switcher" value={privacyScreen} onValueChange={(v) => toggle(settings.setPrivacyScreen, v, setPrivacyScreen)} />
        <View style={settingsRowDivider} />
        <ToggleRow icon="eye" label="Hide amounts on home" value={hideAmounts} onValueChange={(v) => toggle(settings.setHideAmounts, v, setHideAmounts)} />
      </View>

      {/* NOTIFICATIONS & REMINDERS — all reminder config lives on its own screen now */}
      {flags.reminders && (<>
      <Text style={styles.sectionTitle}>Notifications</Text>
      <View style={styles.card}>
        <SettingsRow icon="bell" label="Notifications & Reminders" value="Bills · daily log" onPress={() => { router.push('/settings/notifications'); }} />
      </View>
      </>)}

      {/* DATA & HELP */}
      <Text style={styles.sectionTitle}>Data & Help</Text>
      <View style={styles.card}>
        {/* Each row carries its own trailing divider so a hidden row leaves no seam. */}
        {flags.importReview && (<>
          <SettingsRow icon="upload" label="Import transactions" value="CSV / text" onPress={() => { router.push('/import'); }} />
          <View style={settingsRowDivider} />
        </>)}
        {flags.reports && (<>
          <SettingsRow icon="download" label="Reports & export" value="CSV / PDF" onPress={() => { router.push('/reports'); }} />
          <View style={settingsRowDivider} />
        </>)}
        <SettingsRow
          icon="database"
          label="Export all data"
          value={exportingAll ? undefined : 'CSV'}
          onPress={exportingAll ? undefined : handleExportAll}
          right={exportingAll ? <ActivityIndicator size="small" color={colors.accent} /> : undefined}
        />
        <View style={settingsRowDivider} />
        <SettingsRow
          icon="hard-drive"
          label="Storage"
          value={storageLabel}
          tint={storageTint}
          onPress={() => { router.push('/settings/storage'); }}
        />
        <View style={settingsRowDivider} />
        <SettingsRow
          icon="shield"
          label="Backup & restore"
          // Amber, not red: no backup is a risk to act on, not a user error.
          value={backupAt ? `Backed up ${formatAgoCompact(backupAt)}` : 'Never backed up'}
          tint={backupAt ? colors.accent : colors.healthAmber}
          onPress={() => { router.push('/settings/backup'); }}
        />
        <View style={settingsRowDivider} />
        <SettingsRow icon="help-circle" label="Help & Feedback" onPress={() => { router.push('/help'); }} />
        <View style={settingsRowDivider} />
        <SettingsRow icon="play-circle" label="Replay welcome tour" onPress={async () => { await settings.clearOnboardingDone(); haptic.light(); Alert.alert('Welcome tour reset', 'Fully close and reopen BudgetSplit to see the intro again.'); }} />
        <View style={settingsRowDivider} />
        <SettingsRow icon="clock" label="Audit log" onPress={() => { router.push('/history'); }} />
      </View>

      {/* About — tap version 7× to open the developer storage screen. Gated on
          DEV_TOOLS_ENABLED, not __DEV__: that screen can replace or erase the
          user's entire dataset, and it is deliberately reachable in pilot builds
          for now. One constant closes every entry point — see constants/devTools. */}
      <Text style={styles.sectionTitle}>About</Text>
      <View style={styles.card}>
        <TouchableOpacity
          onPress={() => {
            if (!DEV_TOOLS_ENABLED) return;
            const next = devTaps + 1;
            setDevTaps(next);
            if (next >= 7) {
              setDevTaps(0);
              haptic.success();
              router.push('/storage');
            }
          }}
          activeOpacity={DEV_TOOLS_ENABLED ? 0.7 : 1}
          accessibilityLabel="App version"
        >
          <Text style={styles.aboutText}>BudgetSplit v2.0</Text>
          <Text style={styles.aboutSub}>No bank login · No accounts · No tracking</Text>
          <Text style={styles.aboutSub}>Receipt scanning uses a cloud OCR service</Text>
          {DEV_TOOLS_ENABLED && <Text style={styles.aboutHint}>Tap version 7× to unlock storage</Text>}
        </TouchableOpacity>
      </View>

      <SheetModal visible={showName} onClose={() => setShowName(false)} title="Your name">
        <Input value={nameText} onChangeText={setNameText} placeholder="Your name" autoFocus maxLength={30} autoCapitalize="words" returnKeyType="done" onSubmitEditing={saveName} style={styles.nameInputGap} />
        <PrimaryButton label="Save" onPress={saveName} disabled={!nameText.trim()} />
      </SheetModal>

      <SheetModal visible={showVpa} onClose={() => setShowVpa(false)} title="Your UPI ID">
        <Input
          value={vpaText}
          onChangeText={setVpaText}
          placeholder="name@bank"
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          maxLength={100}
          returnKeyType="done"
          onSubmitEditing={saveVpa}
          style={styles.nameInputGap}
        />
        <Text style={styles.vpaHint}>
          Goes into the QR others scan to pay you. It stays on this phone — nothing is uploaded.
        </Text>
        <PrimaryButton label="Save" onPress={saveVpa} />
      </SheetModal>

      {/* Amount-less: this is the standing "here's my handle" code, not a request for a
          specific sum. Settling up passes an amount — see TransferBody. */}
      <RequestQrSheet
        visible={showMyQr}
        onClose={() => setShowMyQr(false)}
        vpa={me?.upi_vpa ?? null}
        name={me?.name}
        onSetUpiId={() => { setShowMyQr(false); setVpaText(me?.upi_vpa ?? ''); setShowVpa(true); }}
      />


      {/* Reuses the Add screen's own picker, so the tiles here are the tiles the
          preference actually seeds — not a second list that could drift from it. */}
      <SheetModal visible={showPayMethod} onClose={() => setShowPayMethod(false)} title="How do you usually pay?" scroll={false}>
        <PayMethodSelector value={defaultPay} onChange={pickPayMethod} />
      </SheetModal>

      <SheetModal visible={showCadence} onClose={() => setShowCadence(false)} title="Default budget cadence" scroll={false}>
        {CADENCE_KEYS.map(c => (
          <TouchableOpacity key={c} style={[styles.cadOption, defaultCadence === c && styles.cadOptionActive]} accessibilityState={{ selected: defaultCadence === c }} onPress={() => pickCadence(c)} accessibilityRole="button">
            <Text style={[styles.cadOptionText, defaultCadence === c && { color: colors.accent, fontFamily: 'Inter_600SemiBold' }]}>{CADENCE_LABELS[c]}</Text>
            {defaultCadence === c && <Feather name="check" size={18} color={colors.accent} />}
          </TouchableOpacity>
        ))}
      </SheetModal>

      {/* Default-currency sheet hidden for v1 (INR-only). */}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ToggleRow({ icon, label, value, onValueChange }: { icon: keyof typeof Feather.glyphMap; label: string; value: boolean; onValueChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleIcon}><Feather name={icon} size={16} color={colors.accent} /></View>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: colors.accent, false: colors.bgMuted }} thumbColor={colors.textPrimary} accessibilityLabel={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  statusBarCover: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  scroll: { padding: layout.screenPaddingH, paddingBottom: space.lg },
  header: { marginBottom: space.sm },
  title: { ...type.title, color: colors.textPrimary },
  sectionTitle: { ...type.label, color: colors.textSecondary, marginBottom: space.sm, marginTop: 20, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.sm },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, marginBottom: space.lg, ...shadow.sm },
  profileName: { fontSize: 17, fontFamily: 'Inter_600SemiBold', color: colors.textPrimary },
  profileSub: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textMuted, marginTop: 2 },
  cameraBadge: { position: 'absolute', right: -2, bottom: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bgCard },

  aboutText: { ...type.body, color: colors.textPrimary, paddingHorizontal: space.md, paddingTop: space.md },
  aboutSub: { ...type.caption, color: colors.textSecondary, paddingHorizontal: space.md, paddingTop: 2 },
  aboutHint: { ...type.caption, color: colors.textMuted, fontSize: 10, paddingHorizontal: space.md, paddingBottom: space.md, paddingTop: 6 },
  nameInputGap: { marginBottom: space.md },
  vpaHint: { ...type.label, color: colors.textSecondary, marginBottom: space.md, lineHeight: 19 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, paddingHorizontal: space.md, minHeight: 52 },
  toggleIcon: { width: 32, height: 32, borderRadius: radius.lg, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  toggleLabel: { ...type.body, color: colors.textPrimary, flex: 1 },
  cadOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.md, paddingHorizontal: space.md, borderRadius: radius.md },
  cadOptionActive: { backgroundColor: colors.accentMuted },
  cadOptionText: { ...type.body, color: colors.textPrimary },
});

