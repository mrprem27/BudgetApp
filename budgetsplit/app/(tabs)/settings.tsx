import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Switch, TouchableOpacity,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { settings } from '../../src/lib/settings';
import * as Location from 'expo-location';
import { colors } from '../../src/constants/colors';
import { type } from '../../src/constants/typography';
import { space, layout, radius, shadow } from '../../src/constants/layout';
import { haptic } from '../../src/lib/haptics';
import { getMe, getAllPersons, updatePersonName, setPersonImage } from '../../src/db/queries/persons';
import { getAllGroups } from '../../src/db/queries/groups';
import { getCategoriesForGroup } from '../../src/db/queries/categories';
import { pickAndSaveAvatar } from '../../src/lib/avatar';
import { isAutoSweepEnabled } from '../../src/db/queries/savings';
import { requestNotificationPermission, sendTestReminder } from '../../src/lib/notifications';
import {
  getReminderPrefs, setReminderPrefs, rescheduleReminders, formatReminderTime,
  MAX_LEAD_DAYS, type ReminderPrefs, type ReminderTime,
} from '../../src/lib/reminders';
import { TimePickerSheet } from '../../src/components/ui/TimePickerSheet';
import { MemberAvatar } from '../../src/components/finance/MemberAvatar';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { Input } from '../../src/components/ui/Input';
import { PrimaryButton } from '../../src/components/ui/PrimaryButton';
import { SettingsRow, settingsRowDivider } from '../../src/components/ui/SettingsRow';
import { useFeatureFlags } from '../../src/components/system/FeatureFlagsProvider';
import type { Person } from '../../src/db/queries/persons';
import type { BudgetCadence } from '../../src/db/queries/categoryBudgets';

const CADENCE_LABELS: Record<BudgetCadence, string> = { once: 'One-time', daily: 'Daily', monthly: 'Monthly', yearly: 'Yearly' };
const CADENCE_KEYS: BudgetCadence[] = ['once', 'daily', 'monthly', 'yearly'];

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { flags, setFlag } = useFeatureFlags();

  const [me, setMe] = useState<Person | null>(null);
  const [showName, setShowName] = useState(false);
  const [nameText, setNameText] = useState('');
  const [contactCount, setContactCount] = useState(0);
  const [categoryCount, setCategoryCount] = useState(0);

  const [biometric, setBiometric] = useState(false);
  const [privacyScreen, setPrivacyScreen] = useState(true);
  const [hideAmounts, setHideAmounts] = useState(false);
  const [saveLocation, setSaveLocation] = useState(false);
  const [autoSweep, setAutoSweep] = useState(false);

  const [defaultCadence, setDefaultCadence] = useState<BudgetCadence>('monthly');
  const [showCadence, setShowCadence] = useState(false);

  const [reminders, setReminders] = useState<ReminderPrefs | null>(null);
  const [timeEditing, setTimeEditing] = useState<null | 'renewal' | 'daily'>(null);
  const [devTaps, setDevTaps] = useState(0);

  useEffect(() => {
    (async () => {
      setMe(await getMe(db));
      const allPersons = await getAllPersons(db);
      setContactCount(allPersons.filter(p => !p.is_me).length);
      // Mirror the Categories screen: expense categories for the (first) group.
      const grps = await getAllGroups(db);
      const gid = grps.find(g => g.is_personal === 1)?.id ?? grps[0]?.id;
      if (gid) setCategoryCount((await getCategoriesForGroup(db, gid, 'expense')).length);
      setBiometric(await settings.biometricEnabled());
      setPrivacyScreen(await settings.privacyScreen());
      setHideAmounts(await settings.hideAmounts());
      setSaveLocation(await settings.saveLocation());
      setAutoSweep(await isAutoSweepEnabled());
      setReminders(await getReminderPrefs());
      const dc = await settings.defaultCadence();
      if (dc) setDefaultCadence(dc as BudgetCadence);
    })();
  }, []);

  // Any reminder change persists the prefs and rebuilds the schedule. Turning a
  // reminder ON requests permission first. In Expo Go this is a harmless no-op.
  async function updateReminders(patch: Partial<ReminderPrefs>, turningOn = false) {
    haptic.selection();
    if (turningOn) {
      const ok = await requestNotificationPermission();
      if (!ok) {
        Alert.alert('Notifications off', 'Enable notifications for BudgetSplit in your phone’s Settings to get reminders.');
        return;
      }
    }
    const next = await setReminderPrefs(patch);
    setReminders(next);
    await rescheduleReminders(db);
  }

  function onSaveTime(time: ReminderTime) {
    if (timeEditing === 'renewal') updateReminders({ renewalTime: time });
    else if (timeEditing === 'daily') updateReminders({ dailyTime: time });
    setTimeEditing(null);
  }

  async function toggle(persist: (v: boolean) => Promise<void>, val: boolean, setter: (v: boolean) => void) {
    haptic.selection();
    setter(val);
    await persist(val);
  }

  // Turning location on must ask for OS permission first; if denied, leave it off.
  async function toggleLocation(val: boolean) {
    haptic.selection();
    if (val) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location off', 'Allow location access for BudgetSplit in your phone’s Settings to tag where you spend.');
        return;
      }
    }
    setSaveLocation(val);
    await settings.setSaveLocation(val);
  }

  async function pickCadence(c: BudgetCadence) {
    setDefaultCadence(c);
    setShowCadence(false);
    await settings.setDefaultCadence(c);
  }

  async function onTestReminder() {
    haptic.light();
    const res = await sendTestReminder();
    if (res === 'scheduled') {
      Alert.alert('Test sent', 'A reminder will appear in about 5 seconds. Lock your phone or switch apps to see the banner.');
    } else if (res === 'denied') {
      Alert.alert('Notifications off', 'Allow notifications for BudgetSplit in your phone’s Settings, then try again.');
    } else {
      Alert.alert('Not available here', 'Test reminders need a dev build (they don’t fire in Expo Go).');
    }
  }

  async function saveName() {
    const trimmed = nameText.trim();
    if (!trimmed || !me) return;
    await updatePersonName(db, me.id, trimmed);
    setMe({ ...me, name: trimmed });
    haptic.success();
    setShowName(false);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView style={styles.container} contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + layout.tabBarHeight + space.lg }]} keyboardShouldPersistTaps="handled">
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Text style={styles.title}>Settings</Text>
      </View>

      {/* Profile card — hero */}
      <TouchableOpacity style={styles.profileCard} onPress={() => { setNameText(me?.name ?? ''); setShowName(true); }} accessibilityRole="button" accessibilityLabel="Edit profile">
        <TouchableOpacity
          onPress={me ? async () => {
            const uri = await pickAndSaveAvatar(me.id);
            if (uri) { await setPersonImage(db, me.id, uri); haptic.success(); setMe({ ...me, image_uri: uri }); }
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
          <Text style={styles.profileSub}>Offline-first · no accounts</Text>
        </View>
        <Feather name="edit-2" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      {/* MANAGE */}
      <Text style={[styles.sectionTitle, { marginTop: 0 }]}>Manage</Text>
      <View style={styles.card}>
        <SettingsRow
          icon="users"
          label="People"
          value={contactCount > 0 ? `${contactCount} contact${contactCount !== 1 ? 's' : ''}` : undefined}
          onPress={() => { haptic.light(); router.push('/friends'); }}
        />
        <View style={settingsRowDivider} />
        <SettingsRow
          icon="tag"
          label="Categories"
          value={categoryCount > 0 ? `${categoryCount} categor${categoryCount === 1 ? 'y' : 'ies'}` : undefined}
          onPress={() => { haptic.light(); router.push('/categories'); }}
        />
        <View style={settingsRowDivider} />
        <SettingsRow
          icon="target"
          label="Budgets & Goals"
          value="Per group"
          onPress={() => { haptic.light(); router.push('/groups'); }}
        />
      </View>

      {/* PREFERENCES */}
      <Text style={styles.sectionTitle}>Preferences</Text>
      <View style={styles.card}>
        <SettingsRow icon="globe" label="Currency" value="INR" onPress={undefined} />
        <View style={settingsRowDivider} />
        <SettingsRow icon="repeat" label="Default budget cadence" value={CADENCE_LABELS[defaultCadence]} onPress={() => setShowCadence(true)} />
        <View style={settingsRowDivider} />
        <ToggleRow icon="activity" label="Health score" value={!!flags.healthScore} onValueChange={(v) => setFlag('healthScore', v)} />
        <View style={settingsRowDivider} />
        <ToggleRow icon="credit-card" label="Subscription detection" value={!!flags.subscriptions} onValueChange={(v) => setFlag('subscriptions', v)} />
        <View style={settingsRowDivider} />
        <ToggleRow icon="map-pin" label="Save transaction location" value={saveLocation} onValueChange={toggleLocation} />
        <View style={settingsRowDivider} />
        <SettingsRow icon="sliders" label="Sections" onPress={() => { haptic.light(); router.push('/features'); }} />
      </View>

      {/* SECURITY */}
      <Text style={styles.sectionTitle}>Security</Text>
      <View style={styles.card}>
        <ToggleRow icon="lock" label="Face ID / Touch ID lock" value={biometric} onValueChange={(v) => toggle(settings.setBiometricEnabled, v, setBiometric)} />
        <View style={settingsRowDivider} />
        <ToggleRow icon="eye-off" label="Privacy screen in app switcher" value={privacyScreen} onValueChange={(v) => toggle(settings.setPrivacyScreen, v, setPrivacyScreen)} />
        <View style={settingsRowDivider} />
        <ToggleRow icon="eye" label="Hide amounts on home" value={hideAmounts} onValueChange={(v) => toggle(settings.setHideAmounts, v, setHideAmounts)} />
      </View>

      {/* REMINDERS */}
      {flags.reminders && (<>
      <Text style={styles.sectionTitle}>Reminders</Text>
      <View style={styles.card}>
        <ToggleRow icon="bell" label="Renewal reminders" value={!!reminders?.renewals} onValueChange={(v) => updateReminders({ renewals: v }, v)} />
        {reminders?.renewals && (
          <>
            <View style={settingsRowDivider} />
            <View style={styles.stepperRow}>
              <View style={styles.toggleIcon}><Feather name="calendar" size={16} color={colors.accent} /></View>
              <Text style={styles.stepperLabel}>Start {reminders.renewalLeadDays} day{reminders.renewalLeadDays === 1 ? '' : 's'} before</Text>
              <View style={styles.stepper}>
                <TouchableOpacity style={styles.stepperBtn} onPress={() => updateReminders({ renewalLeadDays: reminders.renewalLeadDays - 1 })} disabled={reminders.renewalLeadDays <= 1} accessibilityLabel="Fewer days">
                  <Feather name="minus" size={16} color={reminders.renewalLeadDays <= 1 ? colors.textMuted : colors.accent} />
                </TouchableOpacity>
                <Text style={styles.stepperVal}>{reminders.renewalLeadDays}</Text>
                <TouchableOpacity style={styles.stepperBtn} onPress={() => updateReminders({ renewalLeadDays: reminders.renewalLeadDays + 1 })} disabled={reminders.renewalLeadDays >= MAX_LEAD_DAYS} accessibilityLabel="More days">
                  <Feather name="plus" size={16} color={reminders.renewalLeadDays >= MAX_LEAD_DAYS ? colors.textMuted : colors.accent} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={settingsRowDivider} />
            <SettingsRow icon="clock" label="Reminder time" value={formatReminderTime(reminders.renewalTime)} onPress={() => setTimeEditing('renewal')} />
          </>
        )}
        <View style={settingsRowDivider} />
        <ToggleRow icon="calendar" label="Daily log reminder" value={!!reminders?.daily} onValueChange={(v) => updateReminders({ daily: v }, v)} />
        {reminders?.daily && (
          <>
            <View style={settingsRowDivider} />
            <SettingsRow icon="clock" label="Daily reminder time" value={formatReminderTime(reminders.dailyTime)} onPress={() => setTimeEditing('daily')} />
          </>
        )}
        <View style={settingsRowDivider} />
        <SettingsRow icon="send" label="Send a test reminder" onPress={onTestReminder} />
        <View style={settingsRowDivider} />
        <SettingsRow icon="bell" label="Manage notifications" onPress={() => { haptic.light(); router.push('/settings/notifications' as any); }} />
      </View>
      <Text style={styles.featureCaption}>All on-device — nothing leaves your phone.</Text>
      </>)}

      {/* DATA & HELP */}
      <Text style={styles.sectionTitle}>Data & Help</Text>
      <View style={styles.card}>
        <SettingsRow icon="download" label="Export PDF" onPress={() => { haptic.light(); Alert.alert('Coming soon', 'PDF export will be available in a future update.'); }} />
        <View style={settingsRowDivider} />
        <SettingsRow icon="help-circle" label="Help & Feedback" onPress={() => { haptic.light(); router.push('/help'); }} />
        <View style={settingsRowDivider} />
        <SettingsRow icon="play-circle" label="Replay welcome tour" onPress={async () => { await settings.clearOnboardingDone(); haptic.light(); Alert.alert('Welcome tour reset', 'Fully close and reopen BudgetSplit to see the intro again.'); }} />
        <View style={settingsRowDivider} />
        <SettingsRow icon="clock" label="History & Audit log" onPress={() => { haptic.light(); router.push('/history'); }} />
      </View>

      {/* About — tap version 7× to open developer storage screen */}
      <Text style={styles.sectionTitle}>About</Text>
      <View style={styles.card}>
        <TouchableOpacity
          onPress={() => {
            const next = devTaps + 1;
            setDevTaps(next);
            if (next >= 7) {
              setDevTaps(0);
              haptic.success();
              router.push('/storage');
            }
          }}
          activeOpacity={0.7}
          accessibilityLabel="App version"
        >
          <Text style={styles.aboutText}>BudgetSplit v2.0</Text>
          <Text style={styles.aboutSub}>Offline-first · No accounts · No tracking</Text>
          <Text style={styles.aboutHint}>Tap version 7× to unlock storage</Text>
        </TouchableOpacity>
      </View>

      <SheetModal visible={showName} onClose={() => setShowName(false)} title="Your name">
        <Input value={nameText} onChangeText={setNameText} placeholder="Your name" autoFocus maxLength={30} autoCapitalize="words" returnKeyType="done" onSubmitEditing={saveName} style={styles.nameInputGap} />
        <PrimaryButton label="Save" onPress={saveName} disabled={!nameText.trim()} />
      </SheetModal>

      <SheetModal visible={showCadence} onClose={() => setShowCadence(false)} title="Default budget cadence" scroll={false}>
        {CADENCE_KEYS.map(c => (
          <TouchableOpacity key={c} style={[styles.cadOption, defaultCadence === c && styles.cadOptionActive]} onPress={() => pickCadence(c)} accessibilityRole="button">
            <Text style={[styles.cadOptionText, defaultCadence === c && { color: colors.accent, fontFamily: 'Inter_600SemiBold' }]}>{CADENCE_LABELS[c]}</Text>
            {defaultCadence === c && <Feather name="check" size={18} color={colors.accent} />}
          </TouchableOpacity>
        ))}
      </SheetModal>

      {reminders && (
        <TimePickerSheet
          visible={timeEditing !== null}
          title={timeEditing === 'daily' ? 'Daily reminder time' : 'Renewal reminder time'}
          value={timeEditing === 'daily' ? reminders.dailyTime : reminders.renewalTime}
          onClose={() => setTimeEditing(null)}
          onSave={onSaveTime}
        />
      )}

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
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, paddingHorizontal: space.md, minHeight: 52 },
  toggleIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  toggleLabel: { ...type.body, color: colors.textPrimary, flex: 1 },
  featureCaption: { ...type.caption, color: colors.textMuted, paddingHorizontal: space.xs, marginTop: space.sm, marginBottom: space.xs, lineHeight: 17 },
  cadOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.md, paddingHorizontal: space.md, borderRadius: radius.md },
  cadOptionActive: { backgroundColor: colors.accentMuted },
  cadOptionText: { ...type.body, color: colors.textPrimary },
  cadOptionExample: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  sheetHint: { ...type.caption, color: colors.textSecondary, marginBottom: space.sm },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, paddingHorizontal: space.md, minHeight: 52 },
  stepperLabel: { ...type.body, color: colors.textPrimary, flex: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepperBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bgMuted, alignItems: 'center', justifyContent: 'center' },
  stepperVal: { ...type.body, color: colors.textPrimary, fontFamily: 'SpaceMono_400Regular', minWidth: 18, textAlign: 'center' },
});

