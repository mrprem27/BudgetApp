import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, KeyboardAvoidingView, Platform, TouchableOpacity,
  Animated, Easing, ScrollView, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { colors } from '../../constants/colors';
import { type } from '../../constants/typography';
import { space, radius, layout, shadow } from '../../constants/layout';
import { getMe, updatePersonName } from '../../db/queries/persons';
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

type Stage = 'hero' | 'features' | 'name';

export function Onboarding({ onDone }: { onDone: () => void }) {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [stage, setStage] = useState<Stage>('hero');
  const [page, setPage] = useState(0);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
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

  function enterFeatures() {
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
      setStage('hero');
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
              <PrimaryButton label="Get Started" onPress={enterFeatures} />
              <Text style={styles.footNote}>Takes 20 seconds · no sign-up</Text>
            </FadeIn>
          </View>
        </View>
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
              onSubmitEditing={() => name.trim() && finish()}
              accessibilityLabel="Your name"
            />
          </ScrollView>
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
});
