import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Switch, TouchableOpacity,
  TextInput, ScrollView, Alert, KeyboardAvoidingView, Platform,
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
import { getMe, updatePersonName } from '../../src/db/queries/persons';
import { MemberAvatar } from '../../src/components/finance/MemberAvatar';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { PrimaryButton } from '../../src/components/ui/PrimaryButton';
import { SettingsRow, settingsRowDivider } from '../../src/components/ui/SettingsRow';
import { CURRENCIES, DEFAULT_CURRENCY, type CurrencyCode } from '../../src/constants/currencies';
import type { Person } from '../../src/db/queries/persons';
import type { BudgetCadence } from '../../src/db/queries/categoryBudgets';

const CADENCE_LABELS: Record<BudgetCadence, string> = { once: 'One-time', daily: 'Daily', monthly: 'Monthly', yearly: 'Yearly' };
const CADENCE_KEYS: BudgetCadence[] = ['once', 'daily', 'monthly', 'yearly'];

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [me, setMe] = useState<Person | null>(null);
  const [showName, setShowName] = useState(false);
  const [nameText, setNameText] = useState('');

  const [biometric, setBiometric] = useState(false);
  const [privacyScreen, setPrivacyScreen] = useState(true);
  const [saveLocation, setSaveLocation] = useState(false);

  const [defaultCadence, setDefaultCadence] = useState<BudgetCadence>('monthly');
  const [showCadence, setShowCadence] = useState(false);
  const [defaultCurrency, setDefaultCurrency] = useState<CurrencyCode>(DEFAULT_CURRENCY);
  const [showCurrency, setShowCurrency] = useState(false);

  useEffect(() => {
    (async () => {
      setMe(await getMe(db));
      setBiometric((await AsyncStorage.getItem('biometric_enabled')) === 'true');
      setPrivacyScreen((await AsyncStorage.getItem('privacy_screen')) !== 'false');
      setSaveLocation((await AsyncStorage.getItem('save_location')) === 'true');
      const dc = await AsyncStorage.getItem('default_cadence');
      if (dc) setDefaultCadence(dc as BudgetCadence);
      const cur = await AsyncStorage.getItem('default_currency');
      if (cur) setDefaultCurrency(cur as CurrencyCode);
    })();
  }, []);

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
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Text style={styles.title}>Settings</Text>
      </View>

      {/* Profile */}
      <Text style={styles.sectionTitle}>Account</Text>
      <TouchableOpacity style={styles.profileCard} onPress={() => { setNameText(me?.name ?? ''); setShowName(true); }} accessibilityRole="button">
        <MemberAvatar name={me?.name ?? '?'} color={me?.avatar_color ?? colors.accent} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={styles.profileName}>{me?.name ?? '—'}</Text>
          <Text style={styles.profileSub}>{me?.email ?? 'Tap to edit your name'}</Text>
        </View>
        <Feather name="edit-2" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      {/* Privacy & Security */}
      <Text style={styles.sectionTitle}>Privacy & Security</Text>
      <View style={styles.card}>
        <ToggleRow icon="lock" label="Face ID / Touch ID lock" value={biometric} onValueChange={(v) => toggle('biometric_enabled', v, setBiometric)} />
        <View style={settingsRowDivider} />
        <ToggleRow icon="eye-off" label="Privacy screen in app switcher" value={privacyScreen} onValueChange={(v) => toggle('privacy_screen', v, setPrivacyScreen)} />
        <View style={settingsRowDivider} />
        <ToggleRow icon="map-pin" label="Save transaction location" value={saveLocation} onValueChange={(v) => toggle('save_location', v, setSaveLocation)} />
      </View>

      {/* Preferences */}
      <Text style={styles.sectionTitle}>Preferences</Text>
      <View style={styles.card}>
        <SettingsRow icon="repeat" label="Default budget cadence" value={CADENCE_LABELS[defaultCadence]} onPress={() => setShowCadence(true)} />
        <View style={settingsRowDivider} />
        <SettingsRow icon="dollar-sign" label="Currency" value={`${CURRENCIES.find(c => c.code === defaultCurrency)?.symbol ?? '₹'} ${CURRENCIES.find(c => c.code === defaultCurrency)?.name ?? 'Indian Rupee'}`} onPress={() => setShowCurrency(true)} />
      </View>

      {/* Manage */}
      <Text style={styles.sectionTitle}>Manage</Text>
      <View style={styles.card}>
        <SettingsRow icon="tag" label="Categories" onPress={() => { haptic.light(); router.push('/categories'); }} />
        <View style={settingsRowDivider} />
        <SettingsRow icon="clock" label="History" onPress={() => { haptic.light(); router.push('/history'); }} />
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
        <TextInput style={styles.nameInput} value={nameText} onChangeText={setNameText} placeholder="Your name" placeholderTextColor={colors.textMuted} autoFocus maxLength={30} returnKeyType="done" onSubmitEditing={saveName} />
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

      <SheetModal visible={showCurrency} onClose={() => setShowCurrency(false)} title="Default currency" scroll>
        {CURRENCIES.map(c => (
          <TouchableOpacity
            key={c.code}
            style={[styles.cadOption, defaultCurrency === c.code && styles.cadOptionActive]}
            onPress={async () => { setDefaultCurrency(c.code); setShowCurrency(false); await AsyncStorage.setItem('default_currency', c.code); haptic.selection(); }}
            accessibilityRole="button"
          >
            <Text style={[styles.cadOptionText, defaultCurrency === c.code && { color: colors.accent, fontFamily: 'Inter_600SemiBold' }]}>{c.symbol}  {c.name} ({c.code})</Text>
            {defaultCurrency === c.code && <Feather name="check" size={18} color={colors.accent} />}
          </TouchableOpacity>
        ))}
      </SheetModal>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ToggleRow({ icon, label, value, onValueChange }: { icon: keyof typeof Feather.glyphMap; label: string; value: boolean; onValueChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleIcon}><Feather name={icon} size={18} color={colors.accent} /></View>
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
  sectionTitle: { ...type.label, color: colors.textSecondary, marginBottom: space.xs, marginTop: space.md, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: space.xs, gap: 2, ...shadow.sm },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, ...shadow.sm },
  profileName: { ...type.subheading, color: colors.textPrimary },
  profileSub: { ...type.caption, color: colors.textMuted, marginTop: 2 },

  aboutText: { ...type.body, color: colors.textPrimary },
  aboutSub: { ...type.caption, color: colors.textSecondary },
  nameInput: { ...type.body, fontSize: 18, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, minHeight: 56 },
  toggleIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  toggleLabel: { ...type.body, color: colors.textPrimary, flex: 1 },
  cadOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.md, paddingHorizontal: space.md, borderRadius: radius.md },
  cadOptionActive: { backgroundColor: colors.accentMuted },
  cadOptionText: { ...type.body, color: colors.textPrimary },
});
