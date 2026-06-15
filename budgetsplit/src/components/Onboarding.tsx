import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, KeyboardAvoidingView, Platform, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { colors } from '../constants/colors';
import { type } from '../constants/typography';
import { space, radius, layout } from '../constants/layout';
import { getMe, updatePersonName } from '../db/queries/persons';
import { PrimaryButton } from './PrimaryButton';
import { haptic } from '../lib/haptics';

type Slide = {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
  points: { icon: keyof typeof Feather.glyphMap; text: string }[];
};

const SLIDES: Slide[] = [
  {
    icon: 'edit-3',
    title: 'Know where it goes',
    body: 'Log a spend in two taps and see the full picture.',
    points: [
      { icon: 'tag', text: 'Categories built for life in India' },
      { icon: 'pie-chart', text: 'Charts for the day, month and year' },
      { icon: 'repeat', text: 'Rent & bills repeat on their own' },
    ],
  },
  {
    icon: 'users',
    title: 'Split, minus the math',
    body: 'Add people to a group and share any bill.',
    points: [
      { icon: 'divide', text: 'Equal, exact, percentage or shares' },
      { icon: 'list', text: 'Itemise a bill, assign each dish' },
      { icon: 'shuffle', text: 'Settle up in the fewest payments' },
    ],
  },
  {
    icon: 'target',
    title: 'Budgets that hold',
    body: 'Give each category a limit and track it live.',
    points: [
      { icon: 'sliders', text: 'Set a budget per category' },
      { icon: 'trending-up', text: 'See what’s left and days remaining' },
      { icon: 'alert-triangle', text: 'A heads-up before you overspend' },
    ],
  },
  {
    icon: 'lock',
    title: 'Yours alone',
    body: 'No account, no cloud, no tracking.',
    points: [
      { icon: 'wifi-off', text: 'Works fully offline' },
      { icon: 'shield', text: 'Lock it behind Face ID' },
      { icon: 'download', text: 'Export to CSV or PDF anytime' },
    ],
  },
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  // step 0 = hero, 1..SLIDES.length = feature slides, last = name entry
  const NAME_STEP = SLIDES.length + 1;
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  function next() {
    haptic.light();
    setStep(s => s + 1);
  }
  function back() {
    haptic.light();
    setStep(s => Math.max(0, s - 1));
  }

  async function finish() {
    setSaving(true);
    try {
      const trimmed = name.trim();
      if (trimmed) {
        const me = await getMe(db);
        if (me) await updatePersonName(db, me.id, trimmed);
      }
      haptic.success();
      onDone();
    } finally {
      setSaving(false);
    }
  }

  const slide = step >= 1 && step <= SLIDES.length ? SLIDES[step - 1] : null;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + space.lg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Top bar: back + skip */}
      {step > 0 && step < NAME_STEP && (
        <View style={styles.topBar}>
          <TouchableOpacity onPress={back} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
            <Feather name="chevron-left" size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { haptic.light(); setStep(NAME_STEP); }} hitSlop={10} accessibilityRole="button">
            <Text style={styles.skip}>Skip</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* HERO */}
      {step === 0 && (
        <View style={styles.page}>
          <View style={styles.heroTop}>
            <View style={styles.logoCircle}>
              <Feather name="bar-chart-2" size={44} color={colors.bg} />
            </View>
            <Text style={styles.brand}>BudgetSplit</Text>
            <Text style={styles.tagline}>Budget your money and split bills — all on your phone, nothing in the cloud.</Text>
          </View>
          <View style={styles.footer}>
            <PrimaryButton label="Get Started" onPress={next} />
            <Text style={styles.footNote}>Takes 20 seconds · no sign-up</Text>
          </View>
        </View>
      )}

      {/* FEATURE SLIDES */}
      {slide && (
        <View style={styles.page}>
          <View style={styles.slideTop}>
            <View style={styles.slideIcon}>
              <Feather name={slide.icon} size={40} color={colors.accent} />
            </View>
            <Text style={styles.slideTitle}>{slide.title}</Text>
            <Text style={styles.slideBody}>{slide.body}</Text>

            <View style={styles.points}>
              {slide.points.map(p => (
                <View key={p.text} style={styles.pointRow}>
                  <View style={styles.pointIcon}>
                    <Feather name={p.icon} size={15} color={colors.accent} />
                  </View>
                  <Text style={styles.pointText}>{p.text}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.footer}>
            <View style={styles.dots}>
              {SLIDES.map((_, i) => (
                <View key={i} style={[styles.dot, i === step - 1 && styles.dotActive]} />
              ))}
            </View>
            <PrimaryButton
              label={step === SLIDES.length ? 'Continue' : 'Next'}
              onPress={next}
            />
          </View>
        </View>
      )}

      {/* NAME ENTRY */}
      {step === NAME_STEP && (
        <View style={styles.page}>
          {step > 0 && (
            <TouchableOpacity onPress={back} hitSlop={10} style={styles.nameBack} accessibilityRole="button" accessibilityLabel="Back">
              <Feather name="chevron-left" size={26} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
          <View style={styles.nameTop}>
            <View style={styles.slideIcon}>
              <Feather name="user" size={36} color={colors.accent} />
            </View>
            <Text style={styles.slideTitle}>First, your name</Text>
            <Text style={styles.slideBody}>It's shown when you split bills with others.</Text>
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
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: layout.screenPaddingH,
    height: 40,
  },
  skip: { ...type.label, color: colors.textSecondary },
  page: { flex: 1, paddingHorizontal: layout.screenPaddingH, paddingBottom: space.md },

  heroTop: { flex: 1, justifyContent: 'center', alignItems: 'flex-start' },
  logoCircle: {
    width: 84, height: 84, borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: space.lg,
  },
  brand: { ...type.title, fontSize: 34, color: colors.textPrimary },
  tagline: { ...type.body, fontSize: 16, color: colors.textSecondary, marginTop: space.sm, lineHeight: 23 },

  slideTop: { flex: 1, justifyContent: 'center' },
  slideIcon: {
    width: 76, height: 76, borderRadius: 22,
    backgroundColor: colors.accentMuted,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: space.lg,
  },
  slideTitle: { ...type.title, color: colors.textPrimary },
  slideBody: { ...type.body, fontSize: 16, color: colors.textSecondary, marginTop: space.xs, marginBottom: space.xl, lineHeight: 23 },
  points: { gap: space.md },
  pointRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  pointIcon: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.bgCard,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  pointText: { ...type.body, color: colors.textPrimary, flex: 1 },

  footer: { gap: space.md },
  footNote: { ...type.caption, color: colors.textMuted, textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: space.xs },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.accent, width: 20 },

  nameBack: { height: 40, justifyContent: 'center', marginLeft: -6 },
  nameTop: { flex: 1, justifyContent: 'center' },
  nameInput: {
    ...type.body,
    fontSize: 20,
    color: colors.textPrimary,
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    paddingHorizontal: space.md, paddingVertical: space.md,
    borderWidth: 1, borderColor: colors.border,
    marginTop: space.lg,
  },
});
