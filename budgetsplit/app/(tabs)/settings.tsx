import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Switch, TouchableOpacity,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../../src/constants/colors';
import { type } from '../../src/constants/typography';
import { space, layout, radius, shadow } from '../../src/constants/layout';
import { haptic } from '../../src/lib/haptics';
import { getMe, updatePersonName, setPersonImage } from '../../src/db/queries/persons';
import { pickAndSaveAvatar } from '../../src/lib/avatar';
import { AUTO_SWEEP_KEY } from '../../src/db/queries/savings';
import { requestNotificationPermission } from '../../src/lib/notifications';
import { getReminderPrefs, rescheduleReminders, REMINDER_KEYS } from '../../src/lib/reminders';
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

  const [biometric, setBiometric] = useState(false);
  const [privacyScreen, setPrivacyScreen] = useState(true);
  const [saveLocation, setSaveLocation] = useState(false);
  const [autoSweep, setAutoSweep] = useState(false);

  const [defaultCadence, setDefaultCadence] = useState<BudgetCadence>('monthly');
  const [showCadence, setShowCadence] = useState(false);

  const [remindRenewals, setRemindRenewals] = useState(false);
  const [remindDaily, setRemindDaily] = useState(false);

  useEffect(() => {
    (async () => {
      setMe(await getMe(db));
      setBiometric((await AsyncStorage.getItem('biometric_enabled')) === 'true');
      setPrivacyScreen((await AsyncStorage.getItem('privacy_screen')) !== 'false');
      setSaveLocation((await AsyncStorage.getItem('save_location')) === 'true');
      setAutoSweep((await AsyncStorage.getItem(AUTO_SWEEP_KEY)) === 'true');
      const prefs = await getReminderPrefs();
      setRemindRenewals(prefs.renewals);
      setRemindDaily(prefs.daily);
      const dc = await AsyncStorage.getItem('default_cadence');
      if (dc) setDefaultCadence(dc as BudgetCadence);
    })();
  }, []);

  // Toggling a reminder on requests permission first; either way we persist the
  // pref and rebuild the schedule. In Expo Go this is a harmless no-op.
  async function toggleReminder(key: string, val: boolean, setter: (v: boolean) => void) {
    haptic.selection();
    if (val) {
      const ok = await requestNotificationPermission();
      if (!ok) {
        Alert.alert('Notifications off', 'Enable notifications for BudgetSplit in your phone’s Settings to get reminders.');
        return;
      }
    }
    setter(val);
    await AsyncStorage.setItem(key, val ? 'true' : 'false');
    await rescheduleReminders(db);
  }

  async function toggle(key: string, val: boolean, setter: (v: boolean) => void) {
    haptic.selection();
    setter(val);
    await AsyncStorage.setItem(key, val ? 'true' : 'false');
  }

  async function pickCadence(c: BudgetCadence) {
    setDefaultCadence(c);
    setShowCadence(false);
    await AsyncStorage.setItem('default_cadence', c);
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

      {/* Profile */}
      <Text style={styles.sectionTitle}>Account</Text>
      <TouchableOpacity style={styles.profileCard} onPress={() => { setNameText(me?.name ?? ''); setShowName(true); }} accessibilityRole="button">
        <View>
          <MemberAvatar
            name={me?.name ?? '?'}
            color={me?.avatar_color ?? colors.accent}
            size={44}
            imageUri={me?.image_uri}
            onPress={me ? async () => { const uri = await pickAndSaveAvatar(me.id); if (uri) { await setPersonImage(db, me.id, uri); haptic.success(); setMe({ ...me, image_uri: uri }); } } : undefined}
          />
          <View style={styles.cameraBadge} pointerEvents="none">
            <Feather name="camera" size={10} color={colors.bg} />
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.profileName}>{me?.name ?? '—'}</Text>
          <Text style={styles.profileSub}>Tap photo to change · name to rename</Text>
        </View>
        <Feather name="edit-2" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      {/* Security */}
      <Text style={styles.sectionTitle}>Security</Text>
      <View style={styles.card}>
        <ToggleRow icon="lock" label="Face ID / Touch ID lock" value={biometric} onValueChange={(v) => toggle('biometric_enabled', v, setBiometric)} />
        <View style={settingsRowDivider} />
        <ToggleRow icon="eye-off" label="Privacy screen in app switcher" value={privacyScreen} onValueChange={(v) => toggle('privacy_screen', v, setPrivacyScreen)} />
      </View>

      {/* Reminders — local, on-device notifications (work in a dev build) */}
      <Text style={styles.sectionTitle}>Reminders</Text>
      <View style={styles.card}>
        <ToggleRow icon="bell" label="Renewal reminders" value={remindRenewals} onValueChange={(v) => toggleReminder(REMINDER_KEYS.renewals, v, setRemindRenewals)} />
        <View style={settingsRowDivider} />
        <ToggleRow icon="calendar" label="Daily log reminder" value={remindDaily} onValueChange={(v) => toggleReminder(REMINDER_KEYS.daily, v, setRemindDaily)} />
      </View>
      <Text style={styles.featureCaption}>A day before a recurring charge, and a gentle evening nudge to log. All on-device — nothing leaves your phone.</Text>

      {/* Budget & Data */}
      <Text style={styles.sectionTitle}>Budget & Data</Text>
      <View style={styles.card}>
        <SettingsRow icon="repeat" label="Default budget cadence" value={CADENCE_LABELS[defaultCadence]} onPress={() => setShowCadence(true)} />
        <View style={settingsRowDivider} />
        <ToggleRow icon="map-pin" label="Save transaction location" value={saveLocation} onValueChange={(v) => toggle('save_location', v, setSaveLocation)} />
        <View style={settingsRowDivider} />
        <SettingsRow icon="sliders" label="Feature management" onPress={() => { haptic.light(); router.push('/features'); }} />
      </View>

      {/* Manage */}
      <Text style={styles.sectionTitle}>Manage</Text>
      <View style={styles.card}>
        <SettingsRow icon="search" label="Search transactions" onPress={() => { haptic.light(); router.push('/search'); }} />
        <View style={settingsRowDivider} />
        <SettingsRow icon="tag" label="Categories" onPress={() => { haptic.light(); router.push('/categories'); }} />
        <View style={settingsRowDivider} />
        <SettingsRow icon="clock" label="History" onPress={() => { haptic.light(); router.push('/history'); }} />
        <View style={settingsRowDivider} />
        <SettingsRow icon="hard-drive" label="Storage" onPress={() => { haptic.light(); router.push('/storage'); }} />
      </View>

      {/* Help & Support */}
      <Text style={styles.sectionTitle}>Help & Support</Text>
      <View style={styles.card}>
        <SettingsRow icon="help-circle" label="Help & Guide" onPress={() => { haptic.light(); router.push('/help'); }} />
        <View style={settingsRowDivider} />
        <SettingsRow icon="play-circle" label="Replay welcome tour" onPress={async () => { await AsyncStorage.removeItem('onboarding_done'); haptic.light(); Alert.alert('Welcome tour reset', 'Fully close and reopen BudgetSplit to see the intro again.'); }} />
      </View>

      {/* About */}
      <Text style={styles.sectionTitle}>About</Text>
      <View style={styles.card}>
        <Text style={styles.aboutText}>BudgetSplit v2.0</Text>
        <Text style={styles.aboutSub}>Offline-first · No accounts · No tracking</Text>
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
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, ...shadow.sm },
  profileName: { ...type.subheading, color: colors.textPrimary },
  profileSub: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  cameraBadge: { position: 'absolute', right: -2, bottom: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bgCard },

  aboutText: { ...type.body, color: colors.textPrimary, paddingHorizontal: space.md, paddingTop: space.md },
  aboutSub: { ...type.caption, color: colors.textSecondary, paddingHorizontal: space.md, paddingBottom: space.md, paddingTop: 2 },
  nameInputGap: { marginBottom: space.md },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, paddingHorizontal: space.md, minHeight: 52 },
  toggleIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  toggleLabel: { ...type.body, color: colors.textPrimary, flex: 1 },
  featureCaption: { ...type.caption, color: colors.textMuted, marginLeft: 32 + space.md + space.md, marginTop: -space.sm, marginBottom: space.xs },
  cadOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.md, paddingHorizontal: space.md, borderRadius: radius.md },
  cadOptionActive: { backgroundColor: colors.accentMuted },
  cadOptionText: { ...type.body, color: colors.textPrimary },
});

