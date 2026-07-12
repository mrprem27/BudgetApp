import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, KeyboardAvoidingView, Platform, TouchableOpacity,
  Animated, Easing, ScrollView, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { settings } from '../../lib/settings';
import { colors } from '../../constants/colors';
import { type } from '../../constants/typography';
import { space, radius, layout, shadow } from '../../constants/layout';
import * as Location from 'expo-location';
import { requestNotificationPermission } from '../../lib/notifications';
import { setReminderPrefs } from '../../lib/reminders';
import { finalizeOnboarding } from '../../lib/onboarding';
import { setMoneyProfile } from '../../db/queries/moneyProfile';
import { GROUP_COLORS } from '../../constants/palette';
import { PrimaryButton } from '../ui/PrimaryButton';
import { FadeIn } from '../ui/FadeIn';
import { haptic } from '../../lib/haptics';
import { LogoAssembly } from './LogoAssembly';

type AnimKind = 'spend' | 'split' | 'budget' | 'privacy';

type Slide = {
  anim: AnimKind;
  tint: string;
  title: string;
  body: string;
  points: { icon: keyof typeof Feather.glyphMap; text: string }[];
};

const SLIDES: Slide[] = [
  {
    anim: 'spend', tint: colors.accent,
    title: 'Know where it goes',
    body: 'Log a spend in two taps and see the full picture.',
    points: [
      { icon: 'tag', text: 'Categories built for life in India' },
      { icon: 'pie-chart', text: 'Charts for the day, month and year' },
      { icon: 'repeat', text: 'Rent & bills repeat on their own' },
    ],
  },
  {
    anim: 'split', tint: colors.coral,
    title: 'Split, minus the math',
    body: 'Add people to a group and share any bill.',
    points: [
      { icon: 'divide', text: 'Equal, exact, percentage or shares' },
      { icon: 'list', text: 'Itemise a bill, assign each dish' },
      { icon: 'shuffle', text: 'Settle up in the fewest payments' },
    ],
  },
  {
    anim: 'budget', tint: colors.healthAmber,
    title: 'Budgets that hold',
    body: 'Give each category a limit and track it live.',
    points: [
      { icon: 'sliders', text: 'One-time, daily, monthly or yearly' },
      { icon: 'trending-up', text: 'See what’s left and the trend' },
      { icon: 'alert-triangle', text: 'A heads-up before you overspend' },
    ],
  },
  {
    anim: 'privacy', tint: colors.settle,
    title: 'Yours alone',
    body: 'No account, no cloud, no tracking.',
    points: [
      { icon: 'wifi-off', text: 'Works fully offline' },
      { icon: 'shield', text: 'Lock it behind Face ID' },
      { icon: 'download', text: 'Export to CSV or PDF anytime' },
    ],
  },
];

const ART_SIZE = 156;

/** A coin glyph in a tinted disc — the shared unit for the finance animations. */
function Coin({ tint, size = 40, icon = 'dollar-sign' as keyof typeof Feather.glyphMap }: { tint: string; size?: number; icon?: keyof typeof Feather.glyphMap }) {
  return (
    <View style={[styles.coin, { width: size, height: size, borderRadius: size / 2, backgroundColor: tint + '26', borderColor: tint + '55' }]}>
      <Feather name={icon} size={size * 0.5} color={tint} />
    </View>
  );
}

/** ① Coins dropping into a pie — "where it goes". */
function SpendArt({ tint, active }: { tint: string; active: boolean }) {
  const drops = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const loops = drops.map((v, i) =>
      Animated.loop(Animated.sequence([
        Animated.delay(i * 360),
        Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(900),
      ])),
    );
    const p = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loops.forEach(l => l.start()); p.start();
    return () => { loops.forEach(l => l.stop()); p.stop(); };
  }, [active]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  return (
    <View style={styles.artBox}>
      {drops.map((v, i) => {
        const x = (i - 1) * 34;
        const ty = v.interpolate({ inputRange: [0, 1], outputRange: [-58, 6] });
        const op = v.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 1, 1, 0] });
        return (
          <Animated.View key={i} style={[styles.artFloat, { transform: [{ translateX: x }, { translateY: ty }], opacity: op }]}>
            <Coin tint={tint} size={30} />
          </Animated.View>
        );
      })}
      <Animated.View style={{ transform: [{ scale }], marginTop: 36 }}>
        <View style={[styles.bigDisc, { backgroundColor: tint + '1A', borderColor: tint + '44' }]}>
          <Feather name="pie-chart" size={48} color={tint} />
        </View>
      </Animated.View>
    </View>
  );
}

/** ② A coin travels wallet → wallet — "split". */
function SplitArt({ tint, active }: { tint: string; active: boolean }) {
  const tx = useRef(new Animated.Value(0)).current;
  const op = useRef(new Animated.Value(0)).current;
  const arrive = useRef(new Animated.Value(0)).current;
  const TRAVEL = 96;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(op, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(tx, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      Animated.timing(arrive, { toValue: 1, duration: 260, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
      Animated.timing(op, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(tx, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.timing(arrive, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
      Animated.delay(360),
    ]));
    loop.start();
    return () => loop.stop();
  }, [active]);
  const translateX = tx.interpolate({ inputRange: [0, 1], outputRange: [-TRAVEL / 2, TRAVEL / 2] });
  const lift = tx.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -22, 0] });
  const toScale = arrive.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  return (
    <View style={[styles.artBox, styles.rowArt]}>
      <View style={[styles.bigDisc, { backgroundColor: tint + '1A', borderColor: tint + '44' }]}>
        <Feather name="credit-card" size={34} color={tint} />
      </View>
      <Animated.View style={[styles.travelCoin, { opacity: op, transform: [{ translateX }, { translateY: lift }] }]}>
        <Coin tint={colors.income} size={34} />
      </Animated.View>
      <Animated.View style={{ transform: [{ scale: toScale }] }}>
        <View style={[styles.bigDisc, { backgroundColor: colors.income + '1A', borderColor: colors.income + '44' }]}>
          <Feather name="credit-card" size={34} color={colors.income} />
        </View>
      </Animated.View>
    </View>
  );
}

/** ③ A budget bar fills green → amber — "budgets". */
function BudgetArt({ tint, active }: { tint: string; active: boolean }) {
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(fill, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
      Animated.delay(600),
      Animated.timing(fill, { toValue: 0, duration: 500, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      Animated.delay(300),
    ]));
    loop.start();
    return () => loop.stop();
  }, [active]);
  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['4%', '88%'] });
  const barColor = fill.interpolate({ inputRange: [0, 0.7, 1], outputRange: [colors.income, colors.income, colors.healthAmber] });
  return (
    <View style={styles.artBox}>
      <View style={[styles.bigDisc, { backgroundColor: tint + '1A', borderColor: tint + '44', marginBottom: space.lg }]}>
        <Feather name="target" size={44} color={tint} />
      </View>
      <View style={styles.budgetTrack}>
        <Animated.View style={[styles.budgetFill, { width, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

/** ④ A shield pulses with a glow ring — "privacy". */
function PrivacyArt({ tint, active }: { tint: string; active: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      Animated.delay(200),
    ]));
    loop.start();
    return () => loop.stop();
  }, [active]);
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.6] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.4, 0] });
  return (
    <View style={styles.artBox}>
      <Animated.View style={[styles.glowRing, { borderColor: tint, transform: [{ scale: ringScale }], opacity: ringOpacity }]} />
      <View style={[styles.bigDisc, { backgroundColor: tint + '1A', borderColor: tint + '44' }]}>
        <Feather name="shield" size={46} color={tint} />
      </View>
    </View>
  );
}

function SlideArt({ kind, tint, active }: { kind: AnimKind; tint: string; active: boolean }) {
  if (kind === 'spend') return <SpendArt tint={tint} active={active} />;
  if (kind === 'split') return <SplitArt tint={tint} active={active} />;
  if (kind === 'budget') return <BudgetArt tint={tint} active={active} />;
  return <PrivacyArt tint={tint} active={active} />;
}

type Stage = 'hero' | 'intent' | 'features' | 'name' | 'income' | 'money' | 'budget' | 'people' | 'permissions';
type IntentKey = 'personal' | 'split' | 'both';

// The four setup steps after the name screen drive the progress dots.
const SETUP_STEPS: Stage[] = ['income', 'money', 'budget', 'people', 'permissions'];

const INTENT_OPTIONS: { key: IntentKey; emoji: string; label: string; desc: string }[] = [
  { key: 'personal', emoji: '💰', label: 'Track my own spending', desc: 'Budgets, categories, goals, health score' },
  { key: 'split',    emoji: '👥', label: 'Split with people',      desc: 'Groups, shared tabs, settle up' },
  { key: 'both',     emoji: '✨', label: 'Both',                   desc: 'Full experience — most popular' },
];

const INCOME_PRESETS = [
  { label: '₹30k', value: 30000 },
  { label: '₹45k', value: 45000 },
  { label: '₹60k', value: 60000 },
  { label: '₹1L', value: 100000 },
];

const BUDGET_PRESETS = [20000, 30000, 40000, 50000];
const PAYDAY_OPTIONS = [1, 5, 7, 10, 15, 25, 30];

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Progress dots across the four setup steps (income → budget → people → permissions). */
function SetupDots({ step }: { step: Stage }) {
  const idx = SETUP_STEPS.indexOf(step);
  return (
    <View style={styles.budgetDots}>
      {SETUP_STEPS.map((s, i) => (
        <View key={s} style={[styles.budgetDot, { backgroundColor: i === idx ? colors.accent : colors.bgMuted, width: i === idx ? 20 : 8 }]} />
      ))}
    </View>
  );
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [stage, setStage] = useState<Stage>('hero');
  const [page, setPage] = useState(0);
  const [intent, setIntent] = useState<IntentKey>('both');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [incomeText, setIncomeText] = useState('');     // free take-home entry (rupees)
  const [payday, setPayday] = useState(1);              // day of month salary lands
  const [budgetText, setBudgetText] = useState('');     // free monthly-budget entry (rupees)
  const [cashText, setCashText] = useState('');         // total cash available (rupees)
  const [investText, setInvestText] = useState('');     // total investments (rupees)
  const [creditLimitText, setCreditLimitText] = useState(''); // credit card limit (rupees)
  const [creditUsedText, setCreditUsedText] = useState('');   // credit already used (rupees)
  const [people, setPeople] = useState<string[]>([]);   // contacts added during onboarding
  const [personDraft, setPersonDraft] = useState('');
  const [notifPerm, setNotifPerm] = useState(false);
  const [locPerm, setLocPerm] = useState(false);
  const addFirstRef = useRef(false);
  // Parsed numeric views of the free-text amounts (0 when blank/invalid).
  const incomeNum = Math.max(0, Math.round(Number(incomeText.replace(/[^0-9.]/g, '')) || 0));
  const budgetNum = Math.max(0, Math.round(Number(budgetText.replace(/[^0-9.]/g, '')) || 0));
  const scrollRef = useRef<any>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(1 / SLIDES.length)).current; // top progress bar fill
  // Source of truth for the current page. `page` state drives the dots/button
  // label, but navigation reads this ref so the "last slide → name" transition
  // fires even after a slow drag-release (which never emits onMomentumScrollEnd).
  const pageRef = useRef(0);
  const bottomPad = insets.bottom + space.xl;

  // Synced on BOTH drag-end and momentum-end so a slow drag can't leave us stale.
  function syncPage(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const p = Math.round(e.nativeEvent.contentOffset.x / width);
    pageRef.current = p;
    setPage(prev => (prev === p ? prev : p));
  }

  function goToPage(p: number) {
    pageRef.current = p;
    setPage(p);
    scrollRef.current?.scrollTo?.({ x: p * width, animated: true });
  }

  function enterIntent() {
    setStage('intent');
  }

  function enterFeatures() {
    // Capture the persona as a soft preference. Not wired to feature flags yet —
    // stored so a later pass can tailor default toggles to it.
    settings.setOnboardingIntent(intent).catch(() => { /* best-effort */ });
    pageRef.current = 0;
    setPage(0);
    setStage('features');
  }

  function advance() {
    if (pageRef.current < SLIDES.length - 1) {
      goToPage(pageRef.current + 1);
    } else {
      setStage('name'); // always reach the (mandatory) name screen
    }
  }

  function backFromFeatures() {
    if (pageRef.current > 0) {
      goToPage(pageRef.current - 1);
    } else {
      setStage('intent');
    }
  }

  // Animate the top progress bar as the slide changes.
  useEffect(() => {
    Animated.timing(progress, {
      toValue: (page + 1) / SLIDES.length,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [page, progress]);

  // Single commit point for the whole questionnaire — see lib/onboarding.ts.
  // rupees text → integer paise
  const toPaise = (t: string) => Math.max(0, Math.round((Number(t.replace(/[^0-9.]/g, '')) || 0) * 100));

  async function finalize() {
    setSaving(true);
    const ok = await finalizeOnboarding(db, {
      name, incomeNum, payday, budgetNum, people, addFirst: addFirstRef.current,
    });
    await setMoneyProfile(db, {
      openingCash: toPaise(cashText),
      investments: toPaise(investText),
      creditLimit: toPaise(creditLimitText),
      creditUsed: toPaise(creditUsedText),
    }).catch(() => { /* best-effort */ });
    if (ok) haptic.success(); else haptic.error();
    setSaving(false);
    onDone();
  }

  function addPerson() {
    const t = personDraft.trim();
    if (!t) return;
    haptic.selection();
    setPeople(prev => (prev.some(p => p.toLowerCase() === t.toLowerCase()) ? prev : [...prev, t]));
    setPersonDraft('');
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + space.sm }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* HERO — the brand mark assembles, then the name + tagline reveal */}
      {stage === 'hero' && (
        <View style={styles.heroRoot}>
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <LogoAssembly width={width} height={height} cy={height * 0.38} />
          </View>
          <View style={[styles.heroBottom, { paddingBottom: bottomPad }]}>
            <FadeIn delay={4300} offset={14}>
              <Text style={styles.brand}>BudgetSplit</Text>
            </FadeIn>
            <FadeIn delay={4520} offset={10} style={styles.taglineWrap}>
              <Text style={styles.tagline}>Budget your money and split bills — all on your phone, nothing in the cloud.</Text>
            </FadeIn>
            <FadeIn delay={4760} style={styles.footer}>
              <PrimaryButton label="Get Started" onPress={enterIntent} />
              <Text style={styles.footNote}>Takes 20 seconds · no sign-up</Text>
            </FadeIn>
          </View>
        </View>
      )}

      {/* INTENT — "What brings you here?" */}
      {stage === 'intent' && (
        <FadeIn key="intent" style={[styles.page, { paddingBottom: bottomPad }]}>
          <TouchableOpacity onPress={() => setStage('hero')} hitSlop={10} style={styles.nameBack} accessibilityRole="button" accessibilityLabel="Back">
            <Feather name="chevron-left" size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.intentScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.intentLogoWrap}>
              <LinearGradient colors={['#20C4B8', '#15A89D']} style={styles.intentLogo} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <Text style={styles.intentRupee}>₹</Text>
              </LinearGradient>
            </View>
            <Text style={[styles.slideTitle, { marginBottom: space.xs }]}>What brings you here?</Text>
            <Text style={[styles.slideBody, { marginBottom: space.xl }]}>We'll set things up to match.{'\n'}You can change this any time.</Text>
            <View style={styles.intentCards}>
              {INTENT_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.intentCard, intent === opt.key && styles.intentCardActive]}
                  onPress={() => { haptic.selection(); setIntent(opt.key); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: intent === opt.key }}
                >
                  <View style={[styles.intentEmoji, intent === opt.key && styles.intentEmojiActive]}>
                    <Text style={{ fontSize: 20 }}>{opt.emoji}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.intentLabel}>{opt.label}</Text>
                    <Text style={styles.intentDesc}>{opt.desc}</Text>
                  </View>
                  {intent === opt.key && (
                    <View style={styles.intentCheck}>
                      <Feather name="check" size={12} color={colors.bg} />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.intentNote}>This is a soft preference, not a lock. All features always available.</Text>
          </ScrollView>
          <View style={[styles.footer, { paddingHorizontal: layout.screenPaddingH }]}>
            <PrimaryButton label="Get started" onPress={() => { haptic.selection(); enterFeatures(); }} />
          </View>
        </FadeIn>
      )}

      {/* FEATURE CAROUSEL (swipeable, animated) */}
      {stage === 'features' && (
        <View style={{ flex: 1 }}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={backFromFeatures} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
              <Feather name="chevron-left" size={26} color={colors.textSecondary} />
            </TouchableOpacity>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
            </View>
            <TouchableOpacity onPress={() => setStage('name')} hitSlop={10} accessibilityRole="button">
              <Text style={styles.skip}>Skip</Text>
            </TouchableOpacity>
          </View>

          <Animated.ScrollView
            ref={scrollRef as any}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
            onMomentumScrollEnd={syncPage}
            onScrollEndDrag={syncPage}
            scrollEventThrottle={16}
            style={{ flex: 1 }}
          >
            {SLIDES.map((slide, i) => {
              const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
              const artTranslate = scrollX.interpolate({ inputRange, outputRange: [width * 0.3, 0, -width * 0.3], extrapolate: 'clamp' });
              const artOpacity = scrollX.interpolate({ inputRange, outputRange: [0, 1, 0], extrapolate: 'clamp' });
              const textTranslate = scrollX.interpolate({ inputRange, outputRange: [width * 0.15, 0, -width * 0.15], extrapolate: 'clamp' });
              const scale = scrollX.interpolate({ inputRange, outputRange: [0.9, 1, 0.9], extrapolate: 'clamp' });
              return (
                <View key={slide.title} style={[styles.slide, { width }]}>
                  <View style={styles.slideTop}>
                    <Animated.View style={{ opacity: artOpacity, transform: [{ translateX: artTranslate }, { scale }] }}>
                      <SlideArt kind={slide.anim} tint={slide.tint} active={page === i} />
                    </Animated.View>
                    <Animated.View style={{ alignItems: 'center', alignSelf: 'stretch', transform: [{ translateX: textTranslate }, { scale }] }}>
                      <Text style={styles.slideTitle}>{slide.title}</Text>
                      <Text style={styles.slideBody}>{slide.body}</Text>
                      <View style={styles.pointsCard}>
                        {slide.points.map((p, j) => (
                          <View key={p.text} style={[styles.pointRow, j < slide.points.length - 1 && styles.pointBorder]}>
                            <View style={[styles.pointIcon, { backgroundColor: slide.tint + '22' }]}>
                              <Feather name={p.icon} size={15} color={slide.tint} />
                            </View>
                            <Text style={styles.pointText}>{p.text}</Text>
                          </View>
                        ))}
                      </View>
                    </Animated.View>
                  </View>
                </View>
              );
            })}
          </Animated.ScrollView>

          <View style={[styles.footer, { paddingHorizontal: layout.screenPaddingH, paddingBottom: bottomPad }]}>
            <PrimaryButton label={page === SLIDES.length - 1 ? 'Continue' : 'Next'} onPress={advance} />
          </View>
        </View>
      )}

      {/* NAME ENTRY */}
      {stage === 'name' && (
        <FadeIn key="name" style={[styles.page, { paddingBottom: bottomPad }]}>
          <TouchableOpacity onPress={enterFeatures} hitSlop={10} style={styles.nameBack} accessibilityRole="button" accessibilityLabel="Back">
            <Feather name="chevron-left" size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.nameScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.bigDisc, { backgroundColor: colors.accentMuted, borderColor: colors.accent + '44' }]}>
              <Feather name="user" size={34} color={colors.accent} />
            </View>
            <Text style={[styles.slideTitle, { marginTop: space.lg }]}>First, your name</Text>
            <Text style={styles.slideBody}>It’s shown when you split bills with others.</Text>
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
              maxLength={30}
              onSubmitEditing={() => name.trim() && (addFirstRef.current = true, setStage('income'))}
              accessibilityLabel="Your name"
            />
          </ScrollView>
          <View style={styles.footer}>
            <PrimaryButton label="Continue" onPress={() => { addFirstRef.current = true; setStage('income'); }} disabled={!name.trim()} loading={saving} />
            <TouchableOpacity onPress={() => { addFirstRef.current = false; setStage('income'); }} disabled={!name.trim() || saving} hitSlop={8} accessibilityRole="button" style={styles.skipBtn}>
              <Text style={[styles.skipText, !name.trim() && { opacity: 0.4 }]}>Skip — just explore</Text>
            </TouchableOpacity>
          </View>
        </FadeIn>
      )}
      {/* INCOME + PAY-DAY STEP */}
      {stage === 'income' && (
        <FadeIn key="income" style={[styles.page, { paddingBottom: bottomPad }]}>
          <TouchableOpacity onPress={() => setStage('name')} hitSlop={10} style={styles.nameBack} accessibilityRole="button" accessibilityLabel="Back">
            <Feather name="chevron-left" size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.nameScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <SetupDots step="income" />
            <Text style={[styles.slideTitle, { marginTop: space.lg }]}>What's your monthly take-home?</Text>
            <Text style={styles.slideBody}>A rough number is fine — it just sets up your income. You can change it any time.</Text>

            <View style={styles.amtField}>
              <Text style={styles.amtRupee}>₹</Text>
              <TextInput
                style={styles.amtInput}
                value={incomeText}
                onChangeText={(t) => setIncomeText(t.replace(/[^0-9]/g, ''))}
                placeholder="45,000"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={9}
                accessibilityLabel="Monthly take-home"
              />
            </View>
            <View style={styles.budgetPresets}>
              {INCOME_PRESETS.map(p => (
                <TouchableOpacity key={p.label} style={[styles.budgetPresetChip, incomeNum === p.value && styles.budgetPresetChipActive]} onPress={() => { haptic.selection(); setIncomeText(String(p.value)); }} accessibilityRole="button">
                  <Text style={[styles.budgetPresetText, incomeNum === p.value && styles.budgetPresetTextActive]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldHeading}>WHEN DO YOU GET PAID?</Text>
            <Text style={styles.slideBodyTight}>We'll add it as a recurring income each month.</Text>
            <View style={styles.dayWrap}>
              {PAYDAY_OPTIONS.map(d => (
                <TouchableOpacity key={d} style={[styles.dayChip, payday === d && styles.dayChipActive]} onPress={() => { haptic.selection(); setPayday(d); }} accessibilityRole="button" accessibilityState={{ selected: payday === d }}>
                  <Text style={[styles.dayChipText, payday === d && styles.dayChipTextActive]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.daySub}>Salary lands on the {ordinal(payday)} of each month.</Text>
          </ScrollView>
          <View style={styles.footer}>
            <PrimaryButton label="Continue" onPress={() => { if (!budgetText) setBudgetText(incomeNum > 0 ? String(incomeNum) : ''); setStage('money'); }} />
            <TouchableOpacity onPress={() => setStage('money')} hitSlop={8} accessibilityRole="button" style={styles.skipBtn}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          </View>
        </FadeIn>
      )}

      {/* MONEY STEP — what you have right now: cash, investments, credit */}
      {stage === 'money' && (
        <FadeIn key="money" style={[styles.page, { paddingBottom: bottomPad }]}>
          <TouchableOpacity onPress={() => setStage('income')} hitSlop={10} style={styles.nameBack} accessibilityRole="button" accessibilityLabel="Back">
            <Feather name="chevron-left" size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.nameScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <SetupDots step="money" />
            <Text style={[styles.slideTitle, { marginTop: space.lg }]}>What do you have right now?</Text>
            <Text style={styles.slideBody}>Sets up your “Total Money”. Rough numbers are fine — you can edit anytime on the Plan screen.</Text>

            <Text style={styles.fieldHeading}>CASH AVAILABLE</Text>
            <View style={styles.amtField}>
              <Text style={styles.amtRupee}>₹</Text>
              <TextInput style={styles.amtInput} value={cashText} onChangeText={(t) => setCashText(t.replace(/[^0-9]/g, ''))} placeholder="50,000" placeholderTextColor={colors.textMuted} keyboardType="number-pad" maxLength={10} accessibilityLabel="Cash available" />
            </View>

            <Text style={styles.fieldHeading}>INVESTMENTS</Text>
            <View style={styles.amtField}>
              <Text style={styles.amtRupee}>₹</Text>
              <TextInput style={styles.amtInput} value={investText} onChangeText={(t) => setInvestText(t.replace(/[^0-9]/g, ''))} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="number-pad" maxLength={10} accessibilityLabel="Investments" />
            </View>

            <Text style={styles.fieldHeading}>CREDIT CARD LIMIT</Text>
            <View style={styles.amtField}>
              <Text style={styles.amtRupee}>₹</Text>
              <TextInput style={styles.amtInput} value={creditLimitText} onChangeText={(t) => setCreditLimitText(t.replace(/[^0-9]/g, ''))} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="number-pad" maxLength={10} accessibilityLabel="Credit card limit" />
            </View>

            <Text style={styles.fieldHeading}>CREDIT ALREADY USED</Text>
            <View style={styles.amtField}>
              <Text style={styles.amtRupee}>₹</Text>
              <TextInput style={styles.amtInput} value={creditUsedText} onChangeText={(t) => setCreditUsedText(t.replace(/[^0-9]/g, ''))} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="number-pad" maxLength={10} accessibilityLabel="Credit already used" />
            </View>
          </ScrollView>
          <View style={styles.footer}>
            <PrimaryButton label="Continue" onPress={() => setStage('budget')} />
            <TouchableOpacity onPress={() => setStage('budget')} hitSlop={8} accessibilityRole="button" style={styles.skipBtn}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          </View>
        </FadeIn>
      )}

      {/* BUDGET STEP — whole amount, the user's own number (no % of income) */}
      {stage === 'budget' && (
        <FadeIn key="budget" style={[styles.page, { paddingBottom: bottomPad }]}>
          <TouchableOpacity onPress={() => setStage('money')} hitSlop={10} style={styles.nameBack} accessibilityRole="button" accessibilityLabel="Back">
            <Feather name="chevron-left" size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.nameScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <SetupDots step="budget" />
            <Text style={[styles.slideTitle, { marginTop: space.lg }]}>Set your monthly budget</Text>
            <Text style={styles.slideBody}>How much do you want to cap your spending at each month? Enter whatever works for you.</Text>

            <View style={styles.amtField}>
              <Text style={styles.amtRupee}>₹</Text>
              <TextInput
                style={styles.amtInput}
                value={budgetText}
                onChangeText={(t) => setBudgetText(t.replace(/[^0-9]/g, ''))}
                placeholder="30,000"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={9}
                accessibilityLabel="Monthly budget"
              />
            </View>
            <View style={styles.budgetPresets}>
              {BUDGET_PRESETS.map(v => (
                <TouchableOpacity key={v} style={[styles.budgetPresetChip, budgetNum === v && styles.budgetPresetChipActive]} onPress={() => { haptic.selection(); setBudgetText(String(v)); }} accessibilityRole="button">
                  <Text style={[styles.budgetPresetText, budgetNum === v && styles.budgetPresetTextActive]}>₹{v >= 100000 ? '1L' : `${Math.round(v / 1000)}k`}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {incomeNum > 0 && (
              <View style={styles.budgetSuggest}>
                <View style={styles.budgetSuggestDot} />
                <Text style={styles.budgetSuggestText}>
                  Heads-up: that's{' '}
                  <Text style={styles.budgetSuggestAmt}>{budgetNum > 0 ? `${Math.round((budgetNum / incomeNum) * 100)}%` : '—'}</Text>
                  {' '}of your take-home.
                </Text>
              </View>
            )}
          </ScrollView>
          <View style={styles.footer}>
            <PrimaryButton label="Continue" onPress={() => setStage('people')} />
            <TouchableOpacity onPress={() => { setBudgetText(''); setStage('people'); }} hitSlop={8} accessibilityRole="button" style={styles.skipBtn}>
              <Text style={styles.skipText}>Skip — I'll set it later</Text>
            </TouchableOpacity>
          </View>
        </FadeIn>
      )}

      {/* PEOPLE STEP — add contacts you split with */}
      {stage === 'people' && (
        <FadeIn key="people" style={[styles.page, { paddingBottom: bottomPad }]}>
          <TouchableOpacity onPress={() => setStage('budget')} hitSlop={10} style={styles.nameBack} accessibilityRole="button" accessibilityLabel="Back">
            <Feather name="chevron-left" size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.nameScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <SetupDots step="people" />
            <Text style={[styles.slideTitle, { marginTop: space.lg }]}>Anyone you split with?</Text>
            <Text style={styles.slideBody}>Add flatmates, friends or family now — or skip and add them later.</Text>

            <View style={styles.personAddRow}>
              <TextInput
                style={styles.personInput}
                value={personDraft}
                onChangeText={setPersonDraft}
                placeholder="Name"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
                maxLength={30}
                returnKeyType="done"
                onSubmitEditing={addPerson}
                accessibilityLabel="Person name"
              />
              <TouchableOpacity style={[styles.personAddBtn, !personDraft.trim() && { opacity: 0.4 }]} onPress={addPerson} disabled={!personDraft.trim()} accessibilityRole="button" accessibilityLabel="Add person">
                <Feather name="plus" size={20} color={colors.bg} />
              </TouchableOpacity>
            </View>

            {people.length > 0 && (
              <View style={styles.peopleList}>
                {people.map((p, i) => (
                  <View key={`${p}-${i}`} style={[styles.personRow, i < people.length - 1 && styles.personRowBorder]}>
                    <View style={[styles.personAvatar, { backgroundColor: GROUP_COLORS[i % GROUP_COLORS.length] }]}>
                      <Text style={styles.personAvatarText}>{p.charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text style={styles.personName} numberOfLines={1}>{p}</Text>
                    <TouchableOpacity onPress={() => { haptic.selection(); setPeople(prev => prev.filter((_, j) => j !== i)); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${p}`}>
                      <Feather name="x" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
          <View style={styles.footer}>
            <PrimaryButton label={people.length > 0 ? `Continue with ${people.length}` : 'Continue'} onPress={() => setStage('permissions')} />
            <TouchableOpacity onPress={() => setStage('permissions')} hitSlop={8} accessibilityRole="button" style={styles.skipBtn}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          </View>
        </FadeIn>
      )}

      {/* PERMISSIONS STEP — notifications + location priming */}
      {stage === 'permissions' && (
        <FadeIn key="permissions" style={[styles.page, { paddingBottom: bottomPad }]}>
          <TouchableOpacity onPress={() => setStage('people')} hitSlop={10} style={styles.nameBack} accessibilityRole="button" accessibilityLabel="Back">
            <Feather name="chevron-left" size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.nameScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <SetupDots step="permissions" />
            <Text style={[styles.slideTitle, { marginTop: space.lg }]}>Stay on top of things</Text>
            <Text style={styles.slideBody}>Both are optional and fully on-device. You can change them in Settings any time.</Text>

            <TouchableOpacity
              style={[styles.permCard, notifPerm && styles.permCardOn]}
              onPress={async () => { haptic.selection(); const ok = await requestNotificationPermission(); setNotifPerm(ok); if (ok) { try { await setReminderPrefs({ renewals: true }); } catch { /* best-effort */ } } }}
              disabled={notifPerm}
              accessibilityRole="button"
            >
              <View style={[styles.permIcon, { backgroundColor: colors.accent + '22' }]}><Feather name="bell" size={18} color={colors.accent} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.permTitle}>Bill & renewal reminders</Text>
                <Text style={styles.permBody}>A heads-up before a recurring charge or a budget runs out.</Text>
              </View>
              {notifPerm ? <Feather name="check-circle" size={20} color={colors.income} /> : <Text style={styles.permAllow}>Allow</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.permCard, locPerm && styles.permCardOn]}
              onPress={async () => {
                haptic.selection();
                const { status } = await Location.requestForegroundPermissionsAsync();
                const ok = status === 'granted';
                setLocPerm(ok);
                if (ok) { try { await settings.setSaveLocation(true); } catch { /* best-effort */ } }
              }}
              disabled={locPerm}
              accessibilityRole="button"
            >
              <View style={[styles.permIcon, { backgroundColor: colors.settle + '22' }]}><Feather name="map-pin" size={18} color={colors.settle} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.permTitle}>Tag where you spend</Text>
                <Text style={styles.permBody}>Save each expense's location so you can see it on a map later.</Text>
              </View>
              {locPerm ? <Feather name="check-circle" size={20} color={colors.income} /> : <Text style={styles.permAllow}>Allow</Text>}
            </TouchableOpacity>
          </ScrollView>
          <View style={styles.footer}>
            <PrimaryButton label="Finish setup" onPress={finalize} loading={saving} />
            <TouchableOpacity onPress={finalize} disabled={saving} hitSlop={8} accessibilityRole="button" style={styles.skipBtn}>
              <Text style={styles.skipText}>Not now</Text>
            </TouchableOpacity>
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
  progressTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.bgMuted, marginHorizontal: space.md, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2, backgroundColor: colors.accent },

  page: { flex: 1, paddingHorizontal: layout.screenPaddingH },

  heroRoot: { flex: 1 },
  heroBottom: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: layout.screenPaddingH, gap: space.md },
  brand: { ...type.title, fontSize: 36, color: colors.textPrimary, textAlign: 'center' },
  taglineWrap: { alignSelf: 'stretch' },
  tagline: { ...type.body, fontSize: 16, color: colors.textSecondary, marginTop: space.md, lineHeight: 24, textAlign: 'center', paddingHorizontal: space.md },

  slide: { flex: 1 },
  slideTop: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: layout.screenPaddingH },
  slideTitle: { ...type.title, color: colors.textPrimary, textAlign: 'center' },
  slideBody: { ...type.body, fontSize: 16, color: colors.textSecondary, marginTop: space.xs, marginBottom: space.xl, lineHeight: 23, textAlign: 'center', paddingHorizontal: space.md },

  // Animated illustration
  artBox: { height: ART_SIZE, alignItems: 'center', justifyContent: 'center', marginBottom: space.xl },
  rowArt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xl },
  artFloat: { position: 'absolute', top: 0 },
  bigDisc: {
    width: 92, height: 92, borderRadius: 28,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  coin: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  travelCoin: { position: 'absolute', zIndex: 2 },
  budgetTrack: { width: 200, height: 12, borderRadius: 6, backgroundColor: colors.bgMuted, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  budgetFill: { height: '100%', borderRadius: 6 },
  glowRing: { position: 'absolute', width: 92, height: 92, borderRadius: 28, borderWidth: 2 },

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

  footer: { gap: space.md, paddingTop: space.md },
  footNote: { ...type.caption, color: colors.textMuted, textAlign: 'center' },
  skipBtn: { alignSelf: 'center', paddingVertical: space.xs },
  skipText: { ...type.body, color: colors.textSecondary },

  nameBack: { height: 40, justifyContent: 'center', marginLeft: -6 },
  nameScroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: space.xl },
  nameInput: {
    ...type.body,
    fontSize: 20,
    color: colors.textPrimary,
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    paddingHorizontal: space.md, paddingVertical: space.md + 2,
    borderWidth: 1, borderColor: colors.border,
    marginTop: space.lg,
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  // Intent stage
  intentScroll: { flexGrow: 1, paddingVertical: space.xl, alignItems: 'stretch' },
  intentLogoWrap: { alignItems: 'center', marginBottom: space.lg },
  intentLogo: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  intentRupee: { fontFamily: 'SpaceMono_400Regular', fontSize: 22, fontWeight: '700', color: '#0A0F11', letterSpacing: -1 },
  intentCards: { gap: space.sm, marginBottom: space.md },
  intentCard: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    backgroundColor: colors.bgCard, borderRadius: radius.lg,
    borderWidth: 1.5, borderColor: colors.border,
    padding: space.md,
  },
  intentCardActive: { backgroundColor: colors.bgMuted, borderColor: colors.accent },
  intentEmoji: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.bgMuted, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  intentEmojiActive: { backgroundColor: colors.accent },
  intentLabel: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  intentDesc: { ...type.caption, color: colors.textSecondary },
  intentCheck: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  intentNote: { ...type.caption, color: colors.textMuted, textAlign: 'center', paddingHorizontal: space.md, marginTop: space.sm },

  // Budget stage
  budgetDots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 28 },
  budgetDot: { height: 6, borderRadius: 3, backgroundColor: colors.bgMuted },
  budgetAmtCard: { backgroundColor: colors.bgCard, borderRadius: 20, paddingVertical: 24, paddingHorizontal: 20, marginBottom: 16, borderWidth: 1.5, borderColor: colors.accent, alignItems: 'center', alignSelf: 'stretch' },
  budgetAmtText: { fontFamily: 'SpaceMono_400Regular', fontSize: 44, color: colors.textPrimary, letterSpacing: -2, lineHeight: 48 },
  budgetAmtSub: { fontSize: 12, color: colors.textMuted, marginTop: 6 },
  budgetPresets: { flexDirection: 'row', gap: 8, marginBottom: 20, justifyContent: 'center', flexWrap: 'wrap' },
  budgetPresetChip: { paddingVertical: 8, paddingHorizontal: 16, backgroundColor: colors.bgCard, borderRadius: 100, borderWidth: 1, borderColor: colors.border },
  budgetPresetChipActive: { backgroundColor: colors.accent },
  budgetPresetText: { fontFamily: 'SpaceMono_400Regular', fontSize: 13, color: colors.textSecondary },
  budgetPresetTextActive: { color: colors.bg, fontFamily: 'Inter_600SemiBold' },
  budgetSuggest: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#081F16', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: '#0C3D22', alignSelf: 'stretch' },
  budgetSuggestDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.income, flexShrink: 0 },
  budgetSuggestText: { fontSize: 12, color: colors.income, fontFamily: 'Inter_400Regular', flex: 1 },
  budgetSuggestAmt: { fontFamily: 'SpaceMono_400Regular', fontWeight: '700' },

  // Amount entry (income / budget)
  amtField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, alignSelf: 'stretch', backgroundColor: colors.bgCard, borderRadius: 20, borderWidth: 1.5, borderColor: colors.accent, paddingVertical: 18, paddingHorizontal: 20, marginBottom: space.md },
  amtRupee: { fontFamily: 'SpaceMono_400Regular', fontSize: 32, color: colors.textSecondary, letterSpacing: -1 },
  amtInput: { fontFamily: 'SpaceMono_400Regular', fontSize: 40, color: colors.textPrimary, letterSpacing: -2, padding: 0, minWidth: 80, textAlign: 'center' },
  fieldHeading: { alignSelf: 'stretch', textAlign: 'left', fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Inter_600SemiBold', marginTop: space.lg, marginBottom: 6 },
  slideBodyTight: { ...type.body, fontSize: 13, color: colors.textSecondary, alignSelf: 'stretch', textAlign: 'left', marginBottom: space.sm, lineHeight: 18 },

  // Pay-day chips
  dayWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignSelf: 'stretch' },
  dayChip: { minWidth: 44, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  dayChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  dayChipText: { ...type.body, color: colors.textSecondary, fontFamily: 'SpaceMono_400Regular' },
  dayChipTextActive: { color: colors.bg, fontFamily: 'Inter_600SemiBold' },
  daySub: { ...type.caption, color: colors.textMuted, alignSelf: 'stretch', textAlign: 'left', marginTop: space.sm },

  // People step
  personAddRow: { flexDirection: 'row', gap: space.sm, alignSelf: 'stretch', marginTop: space.md },
  personInput: { flex: 1, ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.md, borderWidth: 1, borderColor: colors.border },
  personAddBtn: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  peopleList: { alignSelf: 'stretch', marginTop: space.md, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingVertical: space.sm + 2 },
  personRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  personAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  personAvatarText: { fontFamily: 'Inter_600SemiBold', color: '#fff', fontSize: 14 },
  personName: { ...type.body, color: colors.textPrimary, flex: 1 },

  // Permissions step
  permCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, alignSelf: 'stretch', backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, marginBottom: space.sm },
  permCardOn: { borderColor: colors.income, backgroundColor: colors.income + '11' },
  permIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  permTitle: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  permBody: { ...type.caption, color: colors.textSecondary, lineHeight: 16 },
  permAllow: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
});
