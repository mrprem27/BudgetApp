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
import { parseToPaise } from '../../src/lib/money';
import { haptic } from '../../src/lib/haptics';
import { getMe, updatePersonName } from '../../src/db/queries/persons';
import { MemberAvatar } from '../../src/components/MemberAvatar';
import { SheetModal } from '../../src/components/SheetModal';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import type { Person } from '../../src/db/queries/persons';

const FEATURES: { icon: string; title: string; desc: string }[] = [
  { icon: 'edit-3', title: 'Log in seconds', desc: 'Add an expense or income with the + button. Pick a category, add a note, done.' },
  { icon: 'users', title: 'Split with anyone', desc: 'Create a group, add people, and split bills equally, by exact amount, %, or shares.' },
  { icon: 'shuffle', title: 'Smart settle up', desc: 'BudgetSplit nets everyone out so you settle with the fewest payments possible.' },
  { icon: 'list', title: 'Itemized bills', desc: 'Enter a restaurant bill line by line and assign each item to whoever had it.' },
  { icon: 'pie-chart', title: 'See where it goes', desc: 'The dashboard shows spending by category and over time for today, month, or year.' },
  { icon: 'target', title: 'Budgets & alerts', desc: 'Set daily, monthly, or yearly limits per group and get warned before you overspend.' },
  { icon: 'repeat', title: 'Recurring entries', desc: 'Mark rent or subscriptions as repeating and they appear automatically each period.' },
  { icon: 'download', title: 'Export anytime', desc: 'Export any month to CSV or a formatted PDF from the Reports tab.' },
  { icon: 'lock', title: 'Private by design', desc: 'Everything stays on your phone — no account, no servers, optional Face ID lock.' },
];

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [globalMonthly, setGlobalMonthly] = useState('');
  const [globalYearly, setGlobalYearly] = useState('');
  const [saved, setSaved] = useState(false);
  const [me, setMe] = useState<Person | null>(null);
  const [showName, setShowName] = useState(false);
  const [nameText, setNameText] = useState('');

  useEffect(() => {
    (async () => {
      const bio = await AsyncStorage.getItem('biometric_enabled');
      setBiometricEnabled(bio === 'true');
      const gm = await AsyncStorage.getItem('global_limit_monthly');
      const gy = await AsyncStorage.getItem('global_limit_yearly');
      if (gm) setGlobalMonthly((parseInt(gm, 10) / 100).toString());
      if (gy) setGlobalYearly((parseInt(gy, 10) / 100).toString());
      const meRow = await getMe(db);
      setMe(meRow);
    })();
  }, []);

  async function saveName() {
    const trimmed = nameText.trim();
    if (!trimmed || !me) return;
    await updatePersonName(db, me.id, trimmed);
    setMe({ ...me, name: trimmed });
    haptic.success();
    setShowName(false);
  }

  async function saveGlobalLimits() {
    await AsyncStorage.setItem('global_limit_monthly', parseToPaise(globalMonthly).toString());
    await AsyncStorage.setItem('global_limit_yearly', parseToPaise(globalYearly).toString());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function toggleBiometric(val: boolean) {
    haptic.selection();
    setBiometricEnabled(val);
    await AsyncStorage.setItem('biometric_enabled', val ? 'true' : 'false');
  }

  async function replayTour() {
    await AsyncStorage.removeItem('onboarding_done');
    haptic.light();
    Alert.alert('Welcome tour reset', 'Fully close and reopen BudgetSplit to see the intro again.');
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <Text style={styles.sectionTitle}>You</Text>
      <TouchableOpacity
        style={styles.profileCard}
        onPress={() => { setNameText(me?.name ?? ''); setShowName(true); }}
        accessibilityRole="button"
        accessibilityLabel="Edit your name"
      >
        <MemberAvatar name={me?.name ?? '?'} color={me?.avatar_color ?? colors.accent} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={styles.profileName}>{me?.name ?? '—'}</Text>
          <Text style={styles.profileSub}>Tap to edit your name</Text>
        </View>
        <Feather name="edit-2" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Personal Budget Limits</Text>
      <View style={styles.card}>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Monthly limit</Text>
          <TextInput
            style={styles.input}
            value={globalMonthly}
            onChangeText={setGlobalMonthly}
            keyboardType="decimal-pad"
            placeholder="₹0"
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <View style={styles.sep} />
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Yearly limit</Text>
          <TextInput
            style={styles.input}
            value={globalYearly}
            onChangeText={setGlobalYearly}
            keyboardType="decimal-pad"
            placeholder="₹0"
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <TouchableOpacity style={styles.saveBtn} onPress={saveGlobalLimits} accessibilityRole="button">
          <Text style={styles.saveBtnText}>{saved ? 'Saved!' : 'Save Limits'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Manage</Text>
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.navRow}
          onPress={() => { haptic.light(); router.push('/categories'); }}
          accessibilityRole="button"
          accessibilityLabel="Manage categories"
        >
          <View style={styles.navIcon}><Feather name="tag" size={16} color={colors.accent} /></View>
          <Text style={styles.navLabel}>Categories</Text>
          <Feather name="chevron-right" size={18} color={colors.textMuted} />
        </TouchableOpacity>
        <View style={styles.sep} />
        <TouchableOpacity
          style={styles.navRow}
          onPress={() => { haptic.light(); router.push('/history'); }}
          accessibilityRole="button"
          accessibilityLabel="History"
        >
          <View style={styles.navIcon}><Feather name="clock" size={16} color={colors.accent} /></View>
          <Text style={styles.navLabel}>History</Text>
          <Feather name="chevron-right" size={18} color={colors.textMuted} />
        </TouchableOpacity>
        <View style={styles.sep} />
        <TouchableOpacity
          style={styles.navRow}
          onPress={replayTour}
          accessibilityRole="button"
          accessibilityLabel="Replay welcome tour"
        >
          <View style={styles.navIcon}><Feather name="play-circle" size={16} color={colors.accent} /></View>
          <Text style={styles.navLabel}>Replay welcome tour</Text>
          <Feather name="chevron-right" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Security</Text>
      <View style={styles.card}>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Face ID / Touch ID lock</Text>
          <Switch
            value={biometricEnabled}
            onValueChange={toggleBiometric}
            trackColor={{ true: colors.accent, false: colors.bgMuted }}
            thumbColor={colors.textPrimary}
            accessibilityLabel="Enable biometric lock"
          />
        </View>
      </View>

      <Text style={styles.sectionTitle}>How BudgetSplit works</Text>
      <View style={styles.card}>
        {FEATURES.map((f, i) => (
          <View key={f.title} style={[styles.featureRow, i < FEATURES.length - 1 && styles.featureBorder]}>
            <View style={styles.featureIcon}>
              <Feather name={f.icon as any} size={16} color={colors.accent} />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>{f.title}</Text>
              <Text style={styles.featureDesc}>{f.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>About</Text>
      <View style={styles.card}>
        <Text style={styles.aboutText}>BudgetSplit v1.0</Text>
        <Text style={styles.aboutSub}>Offline-first · No accounts · No tracking</Text>
      </View>

      <SheetModal visible={showName} onClose={() => setShowName(false)} title="Your name">
        <TextInput
          style={styles.nameInput}
          value={nameText}
          onChangeText={setNameText}
          placeholder="Your name"
          placeholderTextColor={colors.textMuted}
          autoFocus
          maxLength={30}
          returnKeyType="done"
          onSubmitEditing={saveName}
        />
        <PrimaryButton label="Save" onPress={saveName} disabled={!nameText.trim()} />
      </SheetModal>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, paddingBottom: 60 },
  header: { marginBottom: space.lg },
  title: { ...type.title, color: colors.textPrimary },
  sectionTitle: { ...type.label, color: colors.textSecondary, marginBottom: space.sm, marginTop: space.md, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm, ...shadow.sm },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fieldLabel: { ...type.body, color: colors.textPrimary },
  input: { ...type.body, color: colors.textPrimary, textAlign: 'right', minWidth: 80 },
  sep: { height: 1, backgroundColor: colors.border },
  saveBtn: { height: 44, backgroundColor: colors.accent, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginTop: space.xs },
  saveBtnText: { ...type.button, color: colors.bg },
  aboutText: { ...type.body, color: colors.textPrimary },
  aboutSub: { ...type.caption, color: colors.textSecondary },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, ...shadow.sm },
  profileName: { ...type.subheading, color: colors.textPrimary },
  profileSub: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  nameInput: { ...type.body, fontSize: 18, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  navIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  navLabel: { ...type.body, color: colors.textPrimary, flex: 1 },
  featureRow: { flexDirection: 'row', gap: space.md, paddingVertical: space.sm },
  featureBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  featureIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  featureText: { flex: 1, gap: 2 },
  featureTitle: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  featureDesc: { ...type.caption, color: colors.textSecondary, lineHeight: 16 },
});
