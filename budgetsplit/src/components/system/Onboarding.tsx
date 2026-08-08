import React from 'react';
import {
  View, Text, StyleSheet, TextInput, KeyboardAvoidingView, Platform, TouchableOpacity,
  Animated, ScrollView, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { type } from '../../constants/typography';
import { space, radius, layout, shadow } from '../../constants/layout';
import { PERSONA_OPTIONS, type OnboardingIntent } from '../../lib/personaDefaults';
import {
  useOnboardingForm, setupSteps, type OnboardingStage,
} from '../../hooks/useOnboardingForm';
import { GROUP_COLORS } from '../../constants/palette';
import { PrimaryButton } from '../ui/PrimaryButton';
import { FadeIn } from '../ui/FadeIn';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { Divider } from '../ui/Divider';
import { IconCircle } from '../ui/IconCircle';
import { OptionRow } from '../ui/OptionRow';
import { SectionHeader } from '../ui/SectionHeader';
import { StepScaffold } from './onboarding/StepScaffold';
import { StepFooter } from './onboarding/StepFooter';
import { StepProgress } from './onboarding/StepProgress';
import { StepBack } from './onboarding/StepBack';
import { StepAmountField } from './onboarding/StepAmountField';
import { MoneyRow } from './onboarding/MoneyRow';
import { PayoffStage } from './onboarding/PayoffStage';
import { payoffFor } from '../../lib/onboardingPayoff';
import { CommitStage } from './onboarding/CommitStage';
import { haptic } from '../../lib/haptics';
import { formatRupees } from '../../lib/money';
import { LogoAssembly } from './LogoAssembly';
import { SlideArt, bigDiscStyle, type AnimKind } from './onboarding/SlideArt';
import { alpha } from '../../theme';


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

// The stage machine and the persona→steps rule live with the state, in the hook.
type Stage = OnboardingStage;
// The persona type is owned by lib/personaDefaults, which maps it to feature flags.
type IntentKey = OnboardingIntent;

const INTENT_OPTIONS = PERSONA_OPTIONS;

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

/**
 * Where a setup step sits in the flow, 1-based, for `StepProgress`.
 *
 * Derived from `setupSteps(intent)` so the `personal` persona — which skips `people` —
 * reports "3 of 4" rather than a gap. Returns null for stages outside the numbered
 * flow (hero, intent, features), which show no progress at all.
 */
function stepPosition(stage: Stage, intent: IntentKey): { step: number; total: number } | null {
  const steps = setupSteps(intent);
  const idx = steps.indexOf(stage);
  // `name` precedes the setup steps and is part of the same count.
  if (stage === 'name') return { step: 1, total: steps.length + 1 };
  if (idx < 0) return null;
  return { step: idx + 2, total: steps.length + 1 };
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const bottomPad = insets.bottom + space.xl;

  // All state, the stage machine and the commit live in the hook — this component is
  // render-only (AUDIT DEBT-12), matching useAddTxnForm / useItemizedForm.
  const {
    stage, setStage, afterBudget, beforePermissions,
    page, scrollRef, scrollX, progress, syncPage, advance, backFromFeatures,
    intent, setIntent, enterIntent, enterFeatures,
    name, setName, incomeText, setIncomeText, incomeNum, payday, setPayday,
    budgetText, setBudgetText, budgetNum,
    cashText, setCashText, investText, setInvestText,
    creditLimitText, setCreditLimitText, creditUsedText, setCreditUsedText,
    people, setPeople, personDraft, setPersonDraft, addPerson,
    notifPerm, locPerm, allowNotifications, allowLocation,
    addFirstRef, saving, finalize, afterBudgetOrPayoff,
  } = useOnboardingForm({ onDone, slideCount: SLIDES.length, width });

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
        <StepScaffold
          stageKey="intent"
          onBack={() => setStage('hero')}
          title="What brings you here?"
          subtitle={"We'll set things up to match. You can change this any time."}
          art={
            <LinearGradient colors={[colors.accent, colors.accentDeep]} style={styles.intentLogo} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Text style={styles.intentRupee}>₹</Text>
            </LinearGradient>
          }
          footer={<StepFooter primaryLabel="Get started" onPrimary={() => { haptic.selection(); enterFeatures(); }} />}
        >
          <View style={styles.intentCards}>
            {INTENT_OPTIONS.map(opt => (
              <OptionRow
                key={opt.key}
                label={opt.label}
                description={opt.desc}
                selected={intent === opt.key}
                onPress={() => { haptic.selection(); setIntent(opt.key); }}
                leading={<Text style={styles.intentEmoji}>{opt.emoji}</Text>}
              />
            ))}
          </View>
          <Text style={styles.intentNote}>This is a soft preference, not a lock. All features stay available.</Text>
        </StepScaffold>
      )}

      {/* FEATURE CAROUSEL (swipeable, animated) */}
      {stage === 'features' && (
        <View style={{ flex: 1 }}>
          {/* Same top row as every other step: back + one progress bar. The fill is
              driven by the carousel's own Animated value so it tracks mid-swipe,
              rather than snapping per page. No count — "3 of 4" on a browsable
              carousel implies a required sequence it doesn't have. */}
          <View style={styles.topBar}>
            <StepBack onPress={backFromFeatures} />
            <StepProgress
              step={page + 1}
              total={SLIDES.length}
              showCount={false}
              animated={progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })}
            />
            <TouchableOpacity onPress={() => setStage('name')} hitSlop={10} accessibilityRole="button">
              <Text style={styles.skip}>Skip</Text>
            </TouchableOpacity>
          </View>

          <Animated.ScrollView
            // Animated.ScrollView's ref type doesn't unify with ScrollView's.
            // Third-party typing gap; the runtime ref is a real ScrollView.
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
                            <View style={[styles.pointIcon, { backgroundColor: alpha(slide.tint, 13) }]}>
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

      {/* NAME ENTRY — the only step that needs the keyboard. */}
      {stage === 'name' && (
        <StepScaffold
          stageKey="name"
          onBack={enterFeatures}
          {...(stepPosition('name', intent) ?? {})}
          title="First, your name"
          subtitle="It's shown when you split bills with others. You can change any of this later in Settings."
          art={<IconCircle icon="user" size={72} color={colors.accent} bg={colors.accentMuted} iconSize={32} />}
          footer={
            <StepFooter
              primaryLabel="Continue"
              onPrimary={() => { addFirstRef.current = true; setStage('income'); }}
              loading={saving}
              skipLabel="Skip — just explore"
              onSkip={() => { addFirstRef.current = false; setStage('income'); }}
              skipDisabled={saving}
            />
          }
        >
          <TextInput
            style={styles.nameInput}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
            maxLength={30}
            autoFocus
            onSubmitEditing={() => { addFirstRef.current = true; setStage('income'); }}
            accessibilityLabel="Your name"
          />
        </StepScaffold>
      )}

      {/* INCOME + PAY-DAY STEP */}
      {stage === 'income' && (
        <StepScaffold
          stageKey="income"
          onBack={() => setStage('name')}
          {...(stepPosition('income', intent) ?? {})}
          title="What's your monthly take-home?"
          subtitle="A rough number is fine — tap a preset or type your own. It only sets up your income."
          footer={
            <StepFooter
              primaryLabel="Continue"
              onPrimary={() => { if (!budgetText) setBudgetText(incomeNum > 0 ? String(incomeNum) : ''); setStage('money'); }}
              skipLabel="Skip"
              onSkip={() => setStage('money')}
            />
          }
        >
          <StepAmountField
            value={incomeText}
            onChangeText={(t) => setIncomeText(t.replace(/[^0-9]/g, ''))}
            placeholder="45,000"
            accessibilityLabel="Monthly take-home"
            maxLength={9}
          />
          <View style={styles.chipRow}>
            {INCOME_PRESETS.map(pr => (
              <Chip
                key={pr.label}
                label={pr.label}
                selected={incomeNum === pr.value}
                onPress={() => { haptic.selection(); setIncomeText(String(pr.value)); }}
              />
            ))}
          </View>

          <SectionHeader title="When do you get paid?" />
          <Text style={styles.helpLine}>We'll add it as a recurring income each month.</Text>
          <View style={styles.chipRowLeft}>
            {PAYDAY_OPTIONS.map(d => (
              <Chip
                key={d}
                label={String(d)}
                selected={payday === d}
                onPress={() => { haptic.selection(); setPayday(d); }}
                accessibilityLabel={`Paid on the ${ordinal(d)}`}
              />
            ))}
          </View>
          <Text style={styles.helpLine}>Salary lands on the {ordinal(payday)} of each month.</Text>
        </StepScaffold>
      )}

      {/* MONEY STEP — one hero figure, then three quiet rows. Was four 40px
          heroes stacked down the page (V2_PRODUCT_REVIEW §150-153). */}
      {stage === 'money' && (
        <StepScaffold
          stageKey="money"
          onBack={() => setStage('income')}
          {...(stepPosition('money', intent) ?? {})}
          title="What do you have right now?"
          subtitle="This sets up your Total Money. Rough numbers are fine — edit them any time on the Plan screen."
          footer={
            <StepFooter
              primaryLabel="Continue"
              onPrimary={() => setStage('budget')}
              skipLabel="Skip"
              onSkip={() => setStage('budget')}
            />
          }
        >
          <SectionHeader title="Cash available" first />
          <StepAmountField
            value={cashText}
            onChangeText={(t) => setCashText(t.replace(/[^0-9]/g, ''))}
            placeholder="50,000"
            accessibilityLabel="Cash available"
          />

          <SectionHeader title="Anything else?" />
          <Card clip>
            <MoneyRow icon="trending-up" label="Investments" value={investText} onChangeText={(t) => setInvestText(t.replace(/[^0-9]/g, ''))} tint={colors.income} accessibilityLabel="Investments" />
            <Divider indent="text" />
            <MoneyRow icon="credit-card" label="Credit limit" value={creditLimitText} onChangeText={(t) => setCreditLimitText(t.replace(/[^0-9]/g, ''))} tint={colors.settle} accessibilityLabel="Credit card limit" />
            <Divider indent="text" />
            <MoneyRow icon="activity" label="Credit used" value={creditUsedText} onChangeText={(t) => setCreditUsedText(t.replace(/[^0-9]/g, ''))} tint={colors.expense} accessibilityLabel="Credit already used" />
          </Card>
          <Text style={styles.helpLine}>Leave any of these at zero if they don't apply.</Text>
        </StepScaffold>
      )}

      {/* BUDGET STEP — whole amount, the user's own number (no % of income) */}
      {stage === 'budget' && (
        <StepScaffold
          stageKey="budget"
          onBack={() => setStage('money')}
          {...(stepPosition('budget', intent) ?? {})}
          title="Set your monthly budget"
          subtitle="What do you want to cap your spending at each month? Whatever works for you."
          footer={
            <StepFooter
              primaryLabel="Continue"
              onPrimary={() => setStage(afterBudgetOrPayoff)}
              skipLabel="Skip — I'll set it later"
              onSkip={() => { setBudgetText(''); setStage(afterBudget); }}
            />
          }
        >
          <StepAmountField
            value={budgetText}
            onChangeText={(t) => setBudgetText(t.replace(/[^0-9]/g, ''))}
            placeholder="30,000"
            accessibilityLabel="Monthly budget"
            maxLength={9}
          />
          <View style={styles.chipRow}>
            {BUDGET_PRESETS.map(v => (
              <Chip
                key={v}
                label={`₹${v >= 100000 ? '1L' : `${Math.round(v / 1000)}k`}`}
                selected={budgetNum === v}
                onPress={() => { haptic.selection(); setBudgetText(String(v)); }}
              />
            ))}
          </View>
          {/* Both operands guarded: with budget 0 this rendered "that's — of your take-home". */}
          {incomeNum > 0 && budgetNum > 0 && (
            <Text style={styles.budgetPct}>
              That's {Math.round((budgetNum / incomeNum) * 100)}% of your take-home.
            </Text>
          )}
        </StepScaffold>
      )}

      {/* PEOPLE STEP — add contacts you split with */}
      {stage === 'people' && (
        <StepScaffold
          stageKey="people"
          onBack={() => setStage('budget')}
          {...(stepPosition('people', intent) ?? {})}
          title="Anyone you split with?"
          subtitle="Add flatmates, friends or family now — or skip and add them later."
          footer={
            <StepFooter
              primaryLabel={people.length > 0 ? `Continue with ${people.length}` : 'Continue'}
              onPrimary={() => setStage('permissions')}
              skipLabel="Skip"
              onSkip={() => setStage('permissions')}
            />
          }
        >
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
            <TouchableOpacity style={[styles.personAddBtn, !personDraft.trim() && styles.personAddOff]} onPress={addPerson} disabled={!personDraft.trim()} accessibilityRole="button" accessibilityLabel="Add person">
              <Feather name="plus" size={20} color={colors.bg} />
            </TouchableOpacity>
          </View>

          {people.length > 0 && (
            <Card clip style={styles.peopleCard}>
              {people.map((pn, i) => (
                <View key={`${pn}-${i}`}>
                  {i > 0 && <Divider indent="text" />}
                  <View style={styles.personRow}>
                    <IconCircle icon="user" size={layout.avatarSize} color={GROUP_COLORS[i % GROUP_COLORS.length]} />
                    <Text style={styles.personName} numberOfLines={1}>{pn}</Text>
                    <TouchableOpacity onPress={() => { haptic.selection(); setPeople(prev => prev.filter((_, j) => j !== i)); }} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${pn}`}>
                      <Feather name="x" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </Card>
          )}
        </StepScaffold>
      )}

      {/* PERMISSIONS STEP — notifications + location priming */}
      {stage === 'permissions' && (
        <StepScaffold
          stageKey="permissions"
          onBack={() => setStage(beforePermissions)}
          {...(stepPosition('permissions', intent) ?? {})}
          title="Stay on top of things"
          subtitle="Both are optional and fully on-device. You can change them in Settings any time."
          footer={
            <StepFooter
              primaryLabel="Finish setup"
              onPrimary={finalize}
              loading={saving}
              skipLabel="Not now"
              onSkip={finalize}
              skipDisabled={saving}
            />
          }
        >
          <View style={styles.permList}>
            <OptionRow
              label="Bill & renewal reminders"
              description="A heads-up before a recurring charge, or before a budget runs out."
              selected={notifPerm}
              onPress={allowNotifications}
              accent={colors.income}
              leading={<IconCircle icon="bell" size={layout.avatarSize} color={colors.accent} />}
            />
            <OptionRow
              label="Tag where you spend"
              description="Save each expense's location so you can see it on a map later."
              selected={locPerm}
              onPress={allowLocation}
              accent={colors.income}
              leading={<IconCircle icon="map-pin" size={layout.avatarSize} color={colors.settle} />}
            />
          </View>
        </StepScaffold>
      )}

      {/* PAYOFF — reads the numbers just entered back at the user. Asks nothing.
          The flow previously returned nothing at all until the app opened. */}
      {stage === 'payoff' && (() => {
        const payoff = payoffFor(incomeNum, budgetNum);
        // Defensive: `afterBudgetOrPayoff` already skips this stage when both are 0,
        // so a null here would mean the numbers were cleared after routing.
        if (!payoff) { setStage(afterBudget); return null; }
        return (
          <StepScaffold
            stageKey="payoff"
            onBack={() => setStage('budget')}
            title={`${formatRupees(payoff.amountPaise)} ${payoff.headline}`}
            titlePosition="bottom"
            footer={<StepFooter primaryLabel="Keep going" onPrimary={() => setStage(afterBudget)} />}
          >
            <PayoffStage payoff={payoff} />
          </StepScaffold>
        );
      })()}

      {/* COMMITTING — covers the one atomic finalizeOnboarding write. No back, no
          skip: the commit is already running. */}
      {stage === 'committing' && (
        <View style={styles.commitPage}>
          <CommitStage saving={saving} />
        </View>
      )}

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: layout.screenPaddingH,
    height: layout.touchMin,
  },
  skip: { ...type.label, color: colors.textSecondary, width: 36, textAlign: 'right' },

  page: { flex: 1, paddingHorizontal: layout.screenPaddingH },

  // ⛔ HERO ONLY — do not touch. The FadeIn delays in the hero block are tuned to
  // LogoAssembly's ~3.7s physics run; `footer` and `bottomPad` are shared with it,
  // which is why the step components fork their own rather than reusing these.
  heroRoot: { flex: 1 },
  heroBottom: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: layout.screenPaddingH, gap: space.md },
  brand: { ...type.title, fontSize: 36, color: colors.textPrimary, textAlign: 'center' },
  taglineWrap: { alignSelf: 'stretch' },
  tagline: { ...type.body, fontSize: 16, color: colors.textSecondary, marginTop: space.md, lineHeight: 24, textAlign: 'center', paddingHorizontal: space.md },

  slide: { flex: 1 },
  slideTop: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: layout.screenPaddingH },
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

  footer: { gap: space.md, paddingTop: space.md },
  footNote: { ...type.caption, color: colors.textMuted, textAlign: 'center' },

  // ---- step content (chrome itself lives in onboarding/Step*) ----------------
  /** One shared help//caption line, replacing `slideBodyTight`, `daySub` and `intentNote`. */
  helpLine: { ...type.caption, color: colors.textMuted, alignSelf: 'stretch', marginTop: space.sm, lineHeight: 16 },
  chipRow: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', justifyContent: 'center' },
  chipRowLeft: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },

  nameInput: {
    ...type.heading,
    color: colors.textPrimary,
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    paddingHorizontal: space.md, paddingVertical: space.md,
    borderWidth: 1, borderColor: colors.border,
    alignSelf: 'stretch',
    textAlign: 'center',
  },

  // Intent stage
  intentLogo: { width: 64, height: 64, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  intentRupee: { ...type.amountLG, color: colors.bg },
  intentCards: { gap: space.sm },
  intentEmoji: { fontSize: 22 },
  intentNote: { ...type.caption, color: colors.textMuted, textAlign: 'center', paddingHorizontal: space.md, marginTop: space.md },

  // Budget stage
  budgetPct: { ...type.label, color: colors.income, textAlign: 'center', marginTop: space.md },

  // People step
  personAddRow: { flexDirection: 'row', gap: space.sm, alignSelf: 'stretch' },
  personInput: { flex: 1, ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.md, borderWidth: 1, borderColor: colors.border },
  personAddBtn: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  personAddOff: { opacity: 0.4 },
  peopleCard: { marginTop: space.md },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingVertical: space.smd },
  personName: { ...type.body, color: colors.textPrimary, flex: 1 },

  // Permissions step
  permList: { gap: space.sm },

  /** The commit stage has no back button and no footer — it isn't a step you can
   *  leave — so it centres its own content instead of using StepScaffold. */
  commitPage: { flex: 1, justifyContent: 'center', paddingHorizontal: layout.screenPaddingH },
});
