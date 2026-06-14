import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Switch, TouchableOpacity,
  TextInput, ScrollView, Alert,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../../src/constants/colors';
import { type } from '../../src/constants/typography';
import { space, layout, radius } from '../../src/constants/layout';
import { formatRupees, parseToPaise } from '../../src/lib/money';

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [globalMonthly, setGlobalMonthly] = useState('');
  const [globalYearly, setGlobalYearly] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const bio = await AsyncStorage.getItem('biometric_enabled');
      setBiometricEnabled(bio === 'true');
      const gm = await AsyncStorage.getItem('global_limit_monthly');
      const gy = await AsyncStorage.getItem('global_limit_yearly');
      if (gm) setGlobalMonthly((parseInt(gm, 10) / 100).toString());
      if (gy) setGlobalYearly((parseInt(gy, 10) / 100).toString());
    })();
  }, []);

  async function saveGlobalLimits() {
    await AsyncStorage.setItem('global_limit_monthly', parseToPaise(globalMonthly).toString());
    await AsyncStorage.setItem('global_limit_yearly', parseToPaise(globalYearly).toString());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function toggleBiometric(val: boolean) {
    setBiometricEnabled(val);
    await AsyncStorage.setItem('biometric_enabled', val ? 'true' : 'false');
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

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

      <Text style={styles.sectionTitle}>About</Text>
      <View style={styles.card}>
        <Text style={styles.aboutText}>BudgetSplit v1.0</Text>
        <Text style={styles.aboutSub}>Offline-first · No accounts · No tracking</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, paddingBottom: 60 },
  header: { paddingTop: space.xl, marginBottom: space.lg },
  title: { ...type.heading, color: colors.textPrimary },
  sectionTitle: { ...type.label, color: colors.textSecondary, marginBottom: space.sm, marginTop: space.md, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fieldLabel: { ...type.body, color: colors.textPrimary },
  input: { ...type.body, color: colors.textPrimary, textAlign: 'right', minWidth: 80 },
  sep: { height: 1, backgroundColor: colors.border },
  saveBtn: { height: 44, backgroundColor: colors.accent, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginTop: space.xs },
  saveBtnText: { ...type.button, color: colors.bg },
  aboutText: { ...type.body, color: colors.textPrimary },
  aboutSub: { ...type.caption, color: colors.textSecondary },
});
