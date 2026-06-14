import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { colors } from '../constants/colors';
import { type } from '../constants/typography';
import { space, radius, layout } from '../constants/layout';
import { getMe, updatePersonName } from '../db/queries/persons';
import { PrimaryButton } from './PrimaryButton';

const FEATURES: Array<{ icon: keyof typeof Feather.glyphMap; title: string; body: string }> = [
  { icon: 'pie-chart', title: 'Track every rupee', body: 'Log expenses and income, see where your money goes.' },
  { icon: 'users', title: 'Split with anyone', body: 'Share bills, split itemized receipts, settle up in a tap.' },
  { icon: 'shield', title: 'Private by design', body: 'Everything stays on your phone. No accounts, no tracking.' },
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const db = useSQLiteContext();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  async function finish() {
    setSaving(true);
    try {
      const trimmed = name.trim();
      if (trimmed) {
        const me = await getMe(db);
        if (me) await updatePersonName(db, me.id, trimmed);
      }
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {step === 0 ? (
        <View style={styles.welcome}>
          <View style={styles.logoCircle}>
            <Feather name="bar-chart-2" size={44} color={colors.bg} />
          </View>
          <Text style={styles.brand}>BudgetSplit</Text>
          <Text style={styles.tagline}>Money, budgets & bill splitting — all offline.</Text>

          <View style={styles.featureList}>
            {FEATURES.map(f => (
              <View key={f.title} style={styles.featureRow}>
                <View style={styles.featureIcon}>
                  <Feather name={f.icon} size={20} color={colors.accent} />
                </View>
                <View style={styles.featureText}>
                  <Text style={styles.featureTitle}>{f.title}</Text>
                  <Text style={styles.featureBody}>{f.body}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.footer}>
            <PrimaryButton label="Get Started" onPress={() => setStep(1)} />
          </View>
        </View>
      ) : (
        <View style={styles.namePage}>
          <View style={styles.nameTop}>
            <Text style={styles.nameTitle}>What should we call you?</Text>
            <Text style={styles.nameSub}>This is how you'll appear in shared groups.</Text>

            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={colors.textMuted}
              autoFocus
              returnKeyType="done"
              maxLength={30}
              onSubmitEditing={() => name.trim() && finish()}
              accessibilityLabel="Your name"
            />
          </View>

          <View style={styles.footer}>
            <PrimaryButton
              label="Start using BudgetSplit"
              onPress={finish}
              disabled={!name.trim()}
              loading={saving}
            />
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  welcome: { flex: 1, paddingHorizontal: layout.screenPaddingH, paddingTop: 80, paddingBottom: 40 },
  logoCircle: {
    width: 84, height: 84, borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: space.lg,
  },
  brand: { ...type.heading, fontSize: 30, color: colors.textPrimary },
  tagline: { ...type.body, color: colors.textSecondary, marginTop: space.xs, marginBottom: space.xl },
  featureList: { gap: space.lg, marginTop: space.md },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  featureIcon: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: colors.bgCard,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  featureText: { flex: 1, gap: 2 },
  featureTitle: { ...type.subheading, color: colors.textPrimary },
  featureBody: { ...type.body, color: colors.textSecondary },
  footer: { marginTop: 'auto' },
  namePage: { flex: 1, paddingHorizontal: layout.screenPaddingH, paddingTop: 120, paddingBottom: 40 },
  nameTop: { gap: space.sm },
  nameTitle: { ...type.heading, color: colors.textPrimary },
  nameSub: { ...type.body, color: colors.textSecondary, marginBottom: space.lg },
  nameInput: {
    ...type.body,
    fontSize: 20,
    color: colors.textPrimary,
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    paddingHorizontal: space.md, paddingVertical: space.md,
    borderWidth: 1, borderColor: colors.border,
  },
});
