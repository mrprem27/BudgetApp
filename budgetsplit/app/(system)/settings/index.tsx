import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Switch, TouchableOpacity,
  ScrollView, Alert, Platform, ActivityIndicator,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import * as LocalAuthentication from 'expo-local-authentication';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { settings } from '../../../src/lib/settings';
import { colors, type, space, radius, layout, shadow } from '../../../src/theme';
import { haptic } from '../../../src/lib/haptics';
import { loadSettingsTab, saveMyName, saveMyVpa } from '../../../src/lib/settingsData';
import { replacePersonPhoto } from '../../../src/lib/personWrites';
import { useDataRefresh } from '../../../src/components/system/DataRefreshProvider';
import { isValidVpa } from '../../../src/lib/upiIntent';
import { RequestQrSheet } from '../../../src/components/finance/RequestQrSheet';
import { formatCompact } from '../../../src/lib/money';
import { MemberAvatar } from '../../../src/components/finance/MemberAvatar';
import { SheetModal } from '../../../src/components/ui/SheetModal';
import { PayMethodSelector } from '../../../src/components/finance/PayMethodSelector';
import { Input } from '../../../src/components/ui/Input';
import { PrimaryButton } from '../../../src/components/ui/PrimaryButton';
import { ScreenHeader } from '../../../src/components/ui/ScreenHeader';
import { MoneySettingsRows } from '../../../src/components/finance/settings/MoneySettingsRows';
import { SettingsRow, settingsRowDivider } from '../../../src/components/ui/SettingsRow';
import { IconCircle } from '../../../src/components/ui/IconCircle';
import { decor } from '../../../src/constants/palette';
import { freeBytes } from '../../../src/lib/deviceStorage';
import { StorageVerdict, storageVerdict, formatBytes } from '../../../src/lib/storage';
import { DEV_TOOLS_ENABLED } from '../../../src/constants/devTools';
import { useFeatureFlags } from '../../../src/components/system/FeatureFlagsProvider';
import type { Person } from '../../../src/db/queries/persons';
import type { BudgetCadence } from '../../../src/db/queries/categoryBudgets';
import { asBudgetCadence, asPayMethod, PayMethod, PAY_METHOD_ICON, PAY_METHOD_LABEL } from '../../../src/constants/enums';
import { useScreenData } from '../../../src/hooks/useScreenData';
import { useServerSession } from '../../../src/hooks/useServerSession';
import { ErrorState } from '../../../src/components/ui/ErrorState';

const CADENCE_LABELS: Record<BudgetCadence, string> = { daily: 'Daily', monthly: 'Monthly', yearly: 'Yearly' };
const CADENCE_KEYS: BudgetCadence[] = ['daily', 'monthly', 'yearly'];

/**
 * One hue per SECTION: every row in a section shares it, so the section reads as one group and the
 * colour tells you where you are, not which row is which. (One hue per row made the list a
 * rainbow with nothing to hold a section together.) A state tint (`storageTint`, pending imports)
 * still overrides it.
 */
const SECTION = {
  account: decor.blue,
  paid: colors.income,
  manage: decor.orange,
  preferences: decor.violet,
  security: colors.accent,
  data: colors.settle,
  help: decor.pink,
} as const;

const TINT = {
  account: SECTION.account,
  upiId: SECTION.paid,
  upiQr: SECTION.paid,
  friends: SECTION.manage,
  categories: SECTION.manage,
  budget: SECTION.manage,
  payMethod: SECTION.preferences,
  cadence: SECTION.preferences,
  features: SECTION.preferences,
  notifications: SECTION.preferences,
  trust: SECTION.security,
  lock: SECTION.security,
  privacy: SECTION.security,
  hideAmounts: SECTION.security,
  import: SECTION.data,
  storage: SECTION.data,
  audit: SECTION.data,
  help: SECTION.help,
  tour: SECTION.help,
} as const;

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const { refresh } = useDataRefresh();
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
  const { data, error: loadError, reload } = useScreenData(loadSettingsTab, []);
  const me = data?.me ?? null;
  const contactCount = data?.contactCount ?? 0;
  const categoryCount = data?.categoryCount ?? 0;
  const budgetMonthly = data?.budgetMonthly ?? 0;
  const pendingCount = data?.pendingCount ?? 0;

  const [biometric, setBiometric] = useState(false);
  const [privacyScreen, setPrivacyScreen] = useState(true);

  // Free space, shown on the row itself so a filling device is visible from Settings without
  // having to open the screen. Tinted only when it has become worth acting on.
  const storageVerdictNow = storageVerdict(freeBytes());
  const storageLabel = storageVerdictNow === StorageVerdict.Ample
    ? undefined
    : `${formatBytes(freeBytes())} free`;
  const storageTint = storageVerdictNow === StorageVerdict.Full ? colors.expense
    : storageVerdictNow === StorageVerdict.Critical ? colors.healthAmber
    : undefined;
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
    await saveMyName(db, me.id, trimmed);
    await reload();
    refresh();
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
      Alert.alert('That doesn’t look like a UPI ID', 'It should read like name@bank, for example prem@okhdfcbank.');
      return;
    }
    await saveMyVpa(db, me.id, trimmed || null);
    await reload();
    refresh();
    haptic.success();
    setShowVpa(false);
  }

  return (
    // No keyboard container: every field here is in a sheet, and `DraggableSheet`
    // handles its own keyboard (AGENTS.md §6b).
    <View style={styles.root}>
    <ScreenHeader title="Settings" onBack={() => router.back()} />
    <ScrollView style={styles.container} contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + space.lg }]} keyboardShouldPersistTaps="handled">
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
            try {
              if (await replacePersonPhoto(db, me)) { haptic.success(); await reload(); refresh(); }
            } catch { haptic.error(); }
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
          <Text style={styles.profileName}>{me?.name ?? 'You'}</Text>
          <Text style={styles.profileSub}>
            {serverSession
              ? serverSession.user.email
              : serverSessionConfigured ? 'On this phone · sign in to link with people' : 'On this phone · no account needed'}
          </Text>
        </View>
        <Feather name="edit-2" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      {/* ACCOUNT — only in a build that has a server to talk to
          (EXPO_PUBLIC_API_URL). Signing in keeps a copy of everything on the
          account and syncs shared groups; the app stays offline-first either way,
          which is why this is a row and not a gate in front of the app. */}
      {serverSessionConfigured && (
        <>
          <Text style={[styles.sectionTitle, sectionTop(true)]}>Account</Text>
          <View style={styles.card}>
            <SettingsRow
              icon={serverSession ? 'user-check' : 'cloud'}
              label={serverSession ? 'Account' : 'Sign in'}
              tint={TINT.account}
              value={serverSession ? serverSession.user.email : 'Keep a copy on your account'}
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
              tint={TINT.upiId}
              value={me?.upi_vpa ?? 'Not set'}
              onPress={() => { setVpaText(me?.upi_vpa ?? ''); setShowVpa(true); }}
            />
            <View style={settingsRowDivider} />
            <SettingsRow
              icon="maximize"
              label="Show my UPI QR"
              tint={TINT.upiQr}
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
          label="Friends"
          tint={TINT.friends}
          value={contactCount > 0 ? `${contactCount} contact${contactCount !== 1 ? 's' : ''}` : undefined}
          onPress={() => { router.push('/friends'); }}
        />
        <View style={settingsRowDivider} />
        <SettingsRow
          icon="tag"
          label="Categories"
          tint={TINT.categories}
          value={categoryCount > 0 ? `${categoryCount} categor${categoryCount === 1 ? 'y' : 'ies'}` : undefined}
          onPress={() => { router.push('/categories'); }}
        />
        <View style={settingsRowDivider} />
        <SettingsRow
          icon="target"
          label="My Budget"
          tint={TINT.budget}
          value={budgetMonthly > 0 ? `${formatCompact(budgetMonthly)}/mo` : 'Not set'}
          onPress={() => router.push('/budget')}
        />
      </View>

      {/* PREFERENCES */}
      <Text style={styles.sectionTitle}>Preferences</Text>
      <View style={styles.card}>
        {/* `B-101`/`DQ-101`: Currency dropped — it was never tappable
            (`onPress={undefined}`, INR only), which reads as a broken row,
            not as "there's only one option." Comes back once there's a second
            currency to pick between. */}
        <SettingsRow icon={PAY_METHOD_ICON[defaultPay]} label="Default pay method" tint={TINT.payMethod} value={PAY_METHOD_LABEL[defaultPay]} onPress={() => setShowPayMethod(true)} />
        <View style={settingsRowDivider} />
        <SettingsRow icon="repeat" label="Default budget cadence" tint={TINT.cadence} value={CADENCE_LABELS[defaultCadence]} onPress={() => setShowCadence(true)} />
        <View style={settingsRowDivider} />
        <MoneySettingsRows tint={TINT.cadence} />
        <View style={settingsRowDivider} />
        <SettingsRow icon="sliders" label="Feature management" tint={TINT.features} value="Modules & toggles" onPress={() => { router.push('/features'); }} />
        {/* Notifications used to be a section of its own holding one row — a
            heading for a single item. It's a preference like the rest. */}
        {flags.reminders && (<>
          <View style={settingsRowDivider} />
          <SettingsRow icon="bell" label="Notifications & Reminders" tint={TINT.notifications} value="Bills · daily log" onPress={() => { router.push('/settings/notifications'); }} />
        </>)}
      </View>

      {/* SECURITY */}
      <Text style={styles.sectionTitle}>Security</Text>
      <View style={styles.card}>
        {/* Under Security, not under People: this is the answer to "who can write
            to my numbers", which is a question about exposure rather than about
            contacts. It was previously answerable only one person at a time. */}
        {flags.splitting && (<>
          <SettingsRow icon="shield" label="Who can add to my ledger" tint={TINT.trust} onPress={() => { router.push('/trust'); }} />
          <View style={settingsRowDivider} />
        </>)}
        <ToggleRow icon="lock" tint={TINT.lock} label="Face ID / Touch ID lock" value={biometric} onValueChange={toggleLock} />
        <View style={settingsRowDivider} />
        <ToggleRow icon="eye-off" tint={TINT.privacy} label="Privacy screen in app switcher" value={privacyScreen} onValueChange={(v) => toggle(settings.setPrivacyScreen, v, setPrivacyScreen)} />
        <View style={settingsRowDivider} />
        <ToggleRow icon="eye" tint={TINT.hideAmounts} label="Hide amounts on home" value={hideAmounts} onValueChange={(v) => toggle(settings.setHideAmounts, v, setHideAmounts)} />
      </View>

      {/* YOUR DATA */}
      <Text style={styles.sectionTitle}>Your data</Text>
      <View style={styles.card}>
        {/* Each row carries its own trailing divider so a hidden row leaves no seam. */}
        {/* `B-101` follow-up: Import and Review inbox were two rows for one pipeline.
            One row, routed by state — unconfirmed rows waiting means the useful thing
            is to confirm them; otherwise it's to bring more in. Review's header carries an
            Import button, so neither destination becomes unreachable. */}
        {flags.importReview && (<>
          <SettingsRow
            icon={pendingCount > 0 ? 'inbox' : 'upload'}
            label="Import & review"
            value={pendingCount > 0 ? `${pendingCount} to review` : 'CSV / text'}
            tint={pendingCount > 0 ? colors.healthAmber : TINT.import}
            onPress={() => { router.push(pendingCount > 0 ? '/review' : '/import'); }}
          />
          <View style={settingsRowDivider} />
        </>)}
        {/* `B-101`: Sync and Backup & restore dropped as their own rows —
            `/settings/account` already surfaces both (`SyncStatus` and a link
            to Backup), so this stopped being a second, repeated path to the
            same two things and started being a third and fourth (`DQ-101`).
            When there's no server build (`!serverSessionConfigured`), Account
            itself is hidden too, so there is nothing to sync either. */}
        <SettingsRow
          icon="hard-drive"
          label="Storage"
          value={storageLabel}
          tint={storageTint ?? TINT.storage}
          onPress={() => { router.push('/settings/storage'); }}
        />
        <View style={settingsRowDivider} />
        <SettingsRow icon="clock" label="Audit log" tint={TINT.audit} onPress={() => { router.push('/history'); }} />
      </View>

      {/* HELP — split from data: "where are my numbers" and "how does this work"
          are different questions, and seven rows under one heading hid both. */}
      <Text style={styles.sectionTitle}>Help</Text>
      <View style={styles.card}>
        <SettingsRow icon="help-circle" label="Help & Feedback" tint={TINT.help} onPress={() => { router.push('/help'); }} />
        <View style={settingsRowDivider} />
        <SettingsRow icon="play-circle" label="Replay welcome tour" tint={TINT.tour} onPress={async () => { await settings.clearOnboardingDone(); haptic.light(); Alert.alert('Welcome tour reset', 'Fully close and reopen BudgetSplit to see the intro again.'); }} />
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
          <Text style={styles.aboutSub}>No bank login · No tracking · Sign-in optional</Text>
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
          Goes into the QR others scan to pay you. Signed in, it's kept on your account with your profile.
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
    </View>
  );
}

function ToggleRow({ icon, tint = colors.accent, label, value, onValueChange }: { icon: keyof typeof Feather.glyphMap; tint?: string; label: string; value: boolean; onValueChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <IconCircle icon={icon} color={tint} size={layout.iconCircle} />
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: colors.accent, false: colors.bgMuted }} thumbColor={colors.textPrimary} accessibilityLabel={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
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
  toggleLabel: { ...type.body, color: colors.textPrimary, flex: 1 },
  cadOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.md, paddingHorizontal: space.md, borderRadius: radius.md },
  cadOptionActive: { backgroundColor: colors.accentMuted },
  cadOptionText: { ...type.body, color: colors.textPrimary },
});

