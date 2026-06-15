import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, KeyboardAvoidingView, Platform, TouchableOpacity,
  ScrollView, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { colors, gradients } from '../../constants/colors';
import { type } from '../../constants/typography';
import { space, radius, layout, shadow } from '../../constants/layout';
import { getMe, updatePersonName } from '../../db/queries/persons';
import { PrimaryButton } from '../ui/PrimaryButton';
import { FadeIn } from '../ui/FadeIn';
import { haptic } from '../../lib/haptics';

type Slide = {
  icon: keyof typeof Feather.glyphMap;
  tint: string;
  title: string;
  body: string;
  points: { icon: keyof typeof Feather.glyphMap; text: string }[];
};

const SLIDES: Slide[] = [
  {
    icon: 'edit-3', tint: colors.accent,
    title: 'Know where it goes',
    body: 'Log a spend in two taps and see the full picture.',
    points: [
      { icon: 'tag', text: 'Categories built for life in India' },
      { icon: 'pie-chart', text: 'Charts for the day, month and year' },
      { icon: 'repeat', text: 'Rent & bills repeat on their own' },
    ],
  },
  {
    icon: 'users', tint: colors.coral,
    title: 'Split, minus the math',
    body: 'Add people to a group and share any bill.',
    points: [
      { icon: 'divide', text: 'Equal, exact, percentage or shares' },
      { icon: 'list', text: 'Itemise a bill, assign each dish' },
      { icon: 'shuffle', text: 'Settle up in the fewest payments' },
    ],
  },
  {
    icon: 'target', tint: colors.healthAmber,
    title: 'Budgets that hold',
    body: 'Give each category a limit and track it live.',
    points: [
      { icon: 'sliders', text: 'One-time, daily, monthly or yearly' },
      { icon: 'trending-up', text: 'See what’s left and the trend' },
      { icon: 'alert-triangle', text: 'A heads-up before you overspend' },
    ],
  },
  {
    icon: 'lock', tint: colors.settle,
    title: 'Yours alone',
    body: 'No account, no cloud, no tracking.',
    points: [
      { icon: 'wifi-off', text: 'Works fully offline' },
      { icon: 'shield', text: 'Lock it behind Face ID' },
      { icon: 'download', text: 'Export to CSV or PDF anytime' },
    ],
  },
];

type Stage = 'hero' | 'features' | 'name';

export function Onboarding({ onDone }: { onDone: () => void }) {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [stage, setStage] = useState<Stage>('hero');
  const [page, setPage] = useState(0);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const p = Math.round(e.nativeEvent.contentOffset.x / width);
    if (p !== page) { setPage(p); haptic.selection(); }
  }

  function advance() {
    haptic.light();
    if (page < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: (page + 1) * width, animated: true });
      setPage(page + 1);
    } else {
      setStage('name');
    }
  }

  function backFromFeatures() {
    haptic.light();
    if (page > 0) {
      scrollRef.current?.scrollTo({ x: (page - 1) * width, animated: true });
      setPage(page - 1);
    } else {
      setStage('hero');
    }
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

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.lg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* HERO */}
      {stage === 'hero' && (
        <FadeIn key="hero" style={styles.page}>
          <View style={styles.heroTop}>
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.logo}>
              <Feather name="bar-chart-2" size={46} color="#fff" />
            </LinearGradient>
            <Text style={styles.brand}>BudgetSplit</Text>
            <Text style={styles.tagline}>Budget your money and split bills — all on your phone, nothing in the cloud.</Text>
          </View>
          <View style={styles.footer}>
            <PrimaryButton label="Get Started" onPress={() => { haptic.light(); setStage('features'); }} />
            <Text style={styles.footNote}>Takes 20 seconds · no sign-up</Text>
          </View>
        </FadeIn>
      )}

      {/* FEATURE CAROUSEL (swipeable) */}
      {stage === 'features' && (
        <View style={{ flex: 1 }}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={backFromFeatures} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
              <Feather name="chevron-left" size={26} color={colors.textSecondary} />
            </TouchableOpacity>
            <View style={styles.dots}>
              {SLIDES.map((_, i) => (
                <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
              ))}
            </View>
            <TouchableOpacity onPress={() => { haptic.light(); setStage('name'); }} hitSlop={10} accessibilityRole="button">
              <Text style={styles.skip}>Skip</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScroll}
            scrollEventThrottle={16}
            style={{ flex: 1 }}
          >
            {SLIDES.map(slide => (
              <View key={slide.title} style={[styles.slide, { width }]}>
                <View style={styles.slideTop}>
                  <View style={[styles.slideIcon, { backgroundColor: slide.tint + '22' }]}>
                    <Feather name={slide.icon} size={38} color={slide.tint} />
                  </View>
                  <Text style={styles.slideTitle}>{slide.title}</Text>
                  <Text style={styles.slideBody}>{slide.body}</Text>
                  <View style={styles.pointsCard}>
                    {slide.points.map((p, i) => (
                      <View key={p.text} style={[styles.pointRow, i < slide.points.length - 1 && styles.pointBorder]}>
                        <View style={[styles.pointIcon, { backgroundColor: slide.tint + '22' }]}>
                          <Feather name={p.icon} size={15} color={slide.tint} />
                        </View>
                        <Text style={styles.pointText}>{p.text}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={[styles.footer, { paddingHorizontal: layout.screenPaddingH }]}>
            <PrimaryButton label={page === SLIDES.length - 1 ? 'Continue' : 'Next'} onPress={advance} />
          </View>
        </View>
      )}

      {/* NAME ENTRY */}
      {stage === 'name' && (
        <FadeIn key="name" style={styles.page}>
          <TouchableOpacity onPress={() => { haptic.light(); setStage('features'); }} hitSlop={10} style={styles.nameBack} accessibilityRole="button" accessibilityLabel="Back">
            <Feather name="chevron-left" size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={styles.nameTop}>
            <View style={[styles.slideIcon, { backgroundColor: colors.accentMuted }]}>
              <Feather name="user" size={34} color={colors.accent} />
            </View>
            <Text style={styles.slideTitle}>First, your name</Text>
            <Text style={styles.slideBody}>It’s shown when you split bills with others.</Text>
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
            <PrimaryButton label="Start using BudgetSplit" onPress={finish} disabled={!name.trim()} loading={saving} />
          </View>
        </FadeIn>
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
  skip: { ...type.label, color: colors.textSecondary, width: 36, textAlign: 'right' },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.accent, width: 22 },

  page: { flex: 1, paddingHorizontal: layout.screenPaddingH, paddingBottom: space.md },

  heroTop: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  logo: {
    width: 92, height: 92, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: space.lg,
    ...shadow.lg,
  },
  brand: { ...type.title, fontSize: 36, color: colors.textPrimary, textAlign: 'center' },
  tagline: { ...type.body, fontSize: 16, color: colors.textSecondary, marginTop: space.md, lineHeight: 24, textAlign: 'center', paddingHorizontal: space.md },

  slide: { flex: 1 },
  slideTop: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: layout.screenPaddingH },
  slideIcon: {
    width: 80, height: 80, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: space.lg,
  },
  slideTitle: { ...type.title, color: colors.textPrimary, textAlign: 'center' },
  slideBody: { ...type.body, fontSize: 16, color: colors.textSecondary, marginTop: space.xs, marginBottom: space.xl, lineHeight: 23, textAlign: 'center', paddingHorizontal: space.md },

  pointsCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: space.md,
    ...shadow.sm,
  },
  pointRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  pointBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  pointIcon: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  pointText: { ...type.body, color: colors.textPrimary, flex: 1 },

  footer: { gap: space.md },
  footNote: { ...type.caption, color: colors.textMuted, textAlign: 'center' },

  nameBack: { height: 40, justifyContent: 'center', marginLeft: -6 },
  nameTop: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  nameInput: {
    ...type.body,
    fontSize: 20,
    color: colors.textPrimary,
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    paddingHorizontal: space.md, paddingVertical: space.md,
    borderWidth: 1, borderColor: colors.border,
    marginTop: space.lg,
    alignSelf: 'stretch',
    textAlign: 'center',
  },
});
