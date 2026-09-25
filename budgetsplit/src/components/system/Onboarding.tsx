import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { isSameDay } from 'date-fns';
import { colors, type, space, radius, layout } from '../../theme';
import { fullDate } from '../../lib/dateFormat';
import { PERSONA_OPTIONS, personaTrims, type OnboardingIntent } from '../../lib/personaDefaults';
import { useOnboardingForm, stepPosition } from '../../hooks/useOnboardingForm';
import { PrimaryButton } from '../ui/PrimaryButton';
import { FadeIn } from '../ui/FadeIn';
import { Collapse } from '../ui/anim/Collapse';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { Divider } from '../ui/Divider';
import { Input } from '../ui/Input';
import { DatePickerSheet } from '../ui/DatePickerSheet';
import { IconCircle } from '../ui/IconCircle';
import { OptionRow } from '../ui/OptionRow';
import { PressableScale } from '../ui/PressableScale';
import { SectionHeader } from '../ui/SectionHeader';
import { PayMethodSelector } from '../finance/PayMethodSelector';
import { StepScaffold } from './onboarding/StepScaffold';
import { StepFooter } from './onboarding/StepFooter';
import { StepAmountField } from './onboarding/StepAmountField';
import { MoneyRow } from './onboarding/MoneyRow';
import { SummaryStage } from './onboarding/SummaryStage';
import { WelcomeStage } from './onboarding/WelcomeStage';
import { SignInStage } from './onboarding/SignInStage';
import { serverConfigured } from '../../lib/serverApi';
import { haptic } from '../../lib/haptics';
import { LogoAssembly } from './LogoAssembly';
import { VOICE_SHORTCUT_URL, SHORTCUTS_APP_URL } from '../../lib/voiceShortcut';
import { ensureVoiceInbox } from '../../lib/voiceDrain';

// The persona type is owned by lib/personaDefaults, which maps it to feature flags.
type IntentKey = OnboardingIntent;

const INTENT_OPTIONS = PERSONA_OPTIONS;

/**
 * When the hero's words appear, and the gap between them.
 *
 * ⛔ `LogoAssembly` is off limits (`AGENTS.md` §11) — this is the only knob, and
 * it is **derived from** the animation rather than guessed at, which is why it is
 * one named constant and not three literals buried in the JSX.
 *
 * The mark's timeline, read off `LogoAssembly.tsx`: the ring holds, the physics
 * loop starts at `startDelay = 1850`, the wedges begin snapping to centre one
 * second in (`TENSION_S = 1.0`) and the loop runs until `TENSION_S + SNAP_S`
 * (`SNAP_S = 0.4`), where it hard-sets the final positions. So **the mark is
 * formed at 1850 + 1000 + 400 = 3250ms** — the snap is where it *starts* landing,
 * not where it has landed. The fan spin (150 + 1250ms, ending ~4.25s) carries on
 * over a finished mark and is not waited for.
 *
 * ### Six sets of numbers, every one of which shipped
 *
 * `1900/2120/2360` → `4300/4520/4760` → `900/1050/1200` → `2400/2550/2700` →
 * `1400/1550/1700` → this one. The literals kept moving while the prose explaining
 * them stayed put: `2400` arrived with a comment claiming the mark was legible by
 * then, and the drop to `1400` updated nothing — which put the brand name on
 * screen **450ms before the physics loop even started**, the overlap the earlier
 * change existed to remove.
 *
 * The first version of *this* comment continued the tradition twice over: it said
 * three sets had existed when there were five, and it used the snap (2850) as the
 * formation time, which put `HERO_REVEAL_MS = 2900` a further 350ms early. The
 * guard in `onboardingConsistency.test.ts` now reads `startDelay`, `TENSION_S` and
 * `SNAP_S` out of `LogoAssembly.tsx` and checks the arithmetic, so a number here
 * can no longer disagree with the animation it claims to follow.
 */
const HERO_REVEAL_MS = 3300;
const HERO_STEP_MS = 150;

function fmtK(v: number): string {
  return `₹${v >= 100000 ? `${(v / 100000).toFixed(1).replace(/\.0$/, '')}L` : `${Math.round(v / 1000)}k`}`;
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();

  /**
   * Parked until Siri Intents — see TRACKER §8.
   *
   * No longer called from anywhere in this file: the permissions step's Siri
   * row is gone (`SPEC-2026-09-FEEDBACK.md` §2 O7), and Settings → Voice has its own, separate
   * hand-off. Kept rather than deleted because the day App Intents lands is
   * the day this step is worth a row again, and the folder-creation reasoning
   * below is the part that would otherwise have to be re-derived.
   *
   * Hand off to Shortcuts so the user can install the voice command.
   *
   * Creates the capture folder first — Shortcuts' folder picker can only choose a folder that
   * already exists, so without this the install appears to work and then silently never
   * files anything. Falls back to opening the Shortcuts app when there is no install link
   * yet; either way onboarding is left exactly as it was and "Finish setup" still commits.
   */
  function openVoiceSetup() {
    ensureVoiceInbox();
    haptic.light();
    Linking.openURL(VOICE_SHORTCUT_URL ?? SHORTCUTS_APP_URL).catch(() => {});
  }
  const { width, height } = useWindowDimensions();
  const bottomPad = insets.bottom + space.xl;

  // All state, the stage machine and the commit live in the hook — this component is
  // render-only (AUDIT DEBT-12), matching useAddTxnForm / useItemizedForm.
  const {
    stage, setStage,
    intent, setIntent,
    name, setName, incomeText, setIncomeText, incomeNum, firstPayDate, setFirstPayDate,
    showPayDateSheet, setShowPayDateSheet,
    budgetText, setBudgetText, budgetNum,
    bankText, setBankText, cashText, setCashText, walletText, setWalletText,
    investText, setInvestText,
    creditLimitText, setCreditLimitText, creditUsedText, setCreditUsedText,
    hasBank, hasWallet, hasInvest, hasCredit,
    toggleBank, toggleWallet, toggleInvest, toggleCredit,
    payMethod, setPayMethod,
    notifPerm, locPerm, allowNotifications, allowLocation,
    saving, finalize, finishAndAddFirst, onDone: done,
  } = useOnboardingForm({ onDone });

  /**
   * Budget suggestions, 50/60/70% of the take-home just given.
   *
   * **No income, no chips.** There used to be a flat fallback —
   * `[20000, 30000, 40000, 50000]` — sitting four lines below a comment promising
   * the suggestion was "about THIS user, not four round numbers". Four numbers
   * invented from nothing are not a suggestion; presented as chips next to the
   * field, they read as a recommendation the app is in no position to make.
   *
   * Deduped, and not only for tidiness: rounding to the nearest ₹1,000 collapses
   * the three fractions into one value at low incomes (₹2,000 → `1000, 1000,
   * 1000`), which rendered three identical "₹1k" chips on duplicate React keys.
   */
  const budgetPresets = incomeNum > 0
    ? [...new Set([0.5, 0.6, 0.7].map(f => Math.round((incomeNum * f) / 1000) * 1000))].filter(v => v > 0)
    : [];

  const trims = personaTrims(intent);

  /**
   * The money step's active EXTRA rows (cash is the hero field, not one of
   * these), in the order the chips are offered — built once here rather than
   * four hand-written `{hasX && <>...}` blocks, so interleaving a `Divider`
   * between whichever subset is ticked is one `.map` instead of the pairwise
   * `{hasInvest && hasCredit && <Divider/>}` check that only worked because
   * there were exactly two optional fields to pair. Bank/Wallet share the
   * default accent — they're places money sits, not signed like investments
   * (income-tinted) or credit (settle/expense).
   */
  const moneyRows: { key: string; node: React.ReactNode }[] = [
    ...(hasBank ? [{ key: 'bank', node: (
      <MoneyRow icon="briefcase" label="Bank balance" value={bankText} onChangeText={(t: string) => setBankText(t.replace(/[^0-9]/g, ''))} accessibilityLabel="Bank balance" />
    ) }] : []),
    ...(hasWallet ? [{ key: 'wallet', node: (
      <MoneyRow icon="shopping-bag" label="Wallet" value={walletText} onChangeText={(t: string) => setWalletText(t.replace(/[^0-9]/g, ''))} accessibilityLabel="Wallet" />
    ) }] : []),
    ...(hasInvest ? [{ key: 'invest', node: (
      <MoneyRow icon="trending-up" label="Investments" value={investText} onChangeText={(t: string) => setInvestText(t.replace(/[^0-9]/g, ''))} tint={colors.income} accessibilityLabel="Investments" />
    ) }] : []),
    ...(hasCredit ? [
      { key: 'creditLimit', node: (
        <MoneyRow icon="credit-card" label="Credit limit" value={creditLimitText} onChangeText={(t: string) => setCreditLimitText(t.replace(/[^0-9]/g, ''))} tint={colors.settle} accessibilityLabel="Credit card limit" />
      ) },
      { key: 'creditUsed', node: (
        <MoneyRow icon="activity" label="Credit used" value={creditUsedText} onChangeText={(t: string) => setCreditUsedText(t.replace(/[^0-9]/g, ''))} tint={colors.expense} accessibilityLabel="Credit already used" />
      ) },
    ] : []),
  ];

  // No KeyboardAvoidingView: `StepScaffold`'s scroll view adjusts its own keyboard
  // inset instead, so a focused field never reflows the page.
  return (
    <View style={[styles.container, { paddingTop: insets.top + space.sm }]}>
      {/* HERO — the brand mark assembles, then the name + tagline reveal */}
      {stage === 'hero' && (
        <View style={styles.heroRoot}>
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <LogoAssembly width={width} height={height} cy={height * 0.38} />
          </View>
          <View style={[styles.heroBottom, { paddingBottom: bottomPad }]}>
            <FadeIn delay={HERO_REVEAL_MS} offset={14}>
              <Text style={styles.brand}>BudgetSplit</Text>
            </FadeIn>
            <FadeIn delay={HERO_REVEAL_MS + HERO_STEP_MS} offset={10} style={styles.taglineWrap}>
              {/* "No bank login" leads, ahead of "nothing in the cloud". It is the
                  concrete, checkable version of the same promise — every competitor
                  in this market either asks for a bank connection or reads your SMS,
                  and this is the one line that separates the app from both. The
                  vaguer cloud claim follows it rather than standing alone. */}
              <Text style={styles.tagline}>Budget your money and split bills — no bank login, no sign-up, and nothing is uploaded unless you ask.</Text>
            </FadeIn>
            <FadeIn delay={HERO_REVEAL_MS + 2 * HERO_STEP_MS} style={styles.footer}>
              <PrimaryButton label="Get Started" onPress={() => setStage('welcome')} />
              <Text style={styles.footNote}>Takes 20 seconds · no sign-up</Text>
            </FadeIn>
          </View>
        </View>
      )}

      {/* INTENT — "What brings you here?" Each card says what it TRIMS, derived
          live from the persona's real flag patch — the old copy said "all
          features stay available" while 'split' silently disabled five. */}
      {/* WELCOME — new vs. existing user, right after the hero. */}
      {stage === 'welcome' && (
        <StepScaffold
          stageKey="welcome"
          onBack={() => setStage('hero')}
          title="Welcome"
          subtitle="Let's get you set up."
          footer={null}
        >
          <WelcomeStage
            onNew={() => setStage('intent')}
            onExisting={() => setStage('signin')}
            showExisting={serverConfigured()}
          />
        </StepScaffold>
      )}

      {/* SIGN IN — reached only from Welcome's "I have an account". An account
          with data restores onto this phone and skips the questionnaire, which
          it has already answered (`DQ-89`, `SPEC-SERVER.md` §4). An empty one
          lands back in the questionnaire, signed in. */}
      {stage === 'signin' && (
        <SignInStage
          onBack={() => setStage('welcome')}
          onVerified={(user, { restored }) => {
            if (restored) { done(); return; }
            // Prefill, don't overwrite — harmless defensively even though
            // `name` can't be non-blank yet this early in the flow.
            if (user.name && !name) setName(user.name);
            setStage('intent');
          }}
        />
      )}

      {stage === 'intent' && (
        <StepScaffold
          stageKey="intent"
          onBack={() => setStage('welcome')}
          {...(stepPosition('intent') ?? {})}
          title="What brings you here?"
          subtitle={"We'll shape the app to match. Change it any time in Settings → Features."}
          art={
            <LinearGradient colors={[colors.accent, colors.accentDeep]} style={styles.intentLogo} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Text style={styles.intentRupee}>₹</Text>
            </LinearGradient>
          }
          footer={<StepFooter primaryLabel="Continue" onPrimary={() => { haptic.selection(); setStage('name'); }} />}
        >
          <View style={styles.intentCards}>
            {INTENT_OPTIONS.map(opt => (
              <OptionRow
                key={opt.key}
                label={opt.label}
                description={opt.desc}
                selected={intent === opt.key}
                onPress={() => { haptic.selection(); setIntent(opt.key); }}
                leading={<IconCircle icon={opt.icon} size={32} color={colors.accent} />}
              />
            ))}
          </View>
          <Text style={styles.intentNote}>
            {trims.length > 0
              ? `This trims: ${trims.join(', ')} — each one tap away in Settings → Features.`
              : 'The full app. Trim features any time in Settings → Features.'}
          </Text>
        </StepScaffold>
      )}

      {/* NAME ENTRY — the only step that needs the keyboard, and the one step
          with no Skip: a group of people is identified by name in every ledger
          and every split, so "Anonymous" isn't a real answer the way a rough
          income or a blank money step is. */}
      {stage === 'name' && (
        <StepScaffold
          stageKey="name"
          onBack={() => setStage('intent')}
          {...(stepPosition('name') ?? {})}
          title="First, your name"
          subtitle="It's shown when you split bills with others. You can change any of this later in Settings."
          art={<IconCircle icon="user" size={72} color={colors.accent} bg={colors.accentMuted} iconSize={32} />}
          footer={
            <StepFooter
              primaryLabel="Continue"
              onPrimary={() => setStage('income')}
              disabled={!name.trim()}
            />
          }
        >
          <Input
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            icon="user"
            autoCapitalize="words"
            returnKeyType="done"
            maxLength={30}
            autoFocus
            // Guarded like the button: the return key is the same path as
            // Continue, so a blank submit must be a no-op on both.
            onSubmitEditing={() => { if (name.trim()) setStage('income'); }}
            accessibilityLabel="Your name"
          />
        </StepScaffold>
      )}

      {/* INCOME + PAY-DAY STEP */}
      {stage === 'income' && (
        <StepScaffold
          stageKey="income"
          onBack={() => setStage('name')}
          {...(stepPosition('income') ?? {})}
          title="What's your monthly take-home?"
          subtitle="A rough number is fine."
          footer={
            <StepFooter
              primaryLabel="Continue"
              onPrimary={() => { if (!budgetText) setBudgetText(incomeNum > 0 ? String(Math.round((incomeNum * 0.6) / 1000) * 1000) : ''); setStage(incomeNum > 0 ? 'payday' : 'money'); }}
              skipLabel="Skip"
              // Same routing as Continue, not a fixed 'money': incomeText isn't
              // cleared by Skip, so whether a payday question makes sense
              // depends on incomeNum either way — `finalizeOnboarding` writes
              // the salary rule under the same condition, from either button.
              onSkip={() => setStage(incomeNum > 0 ? 'payday' : 'money')}
            />
          }
        >
          {/* Typing only — no preset row (`DQ-88`, reversed 2026-09-23: presets
              were tried and cut, not asked for). One field, no chips to
              maintain against a number that's different for everyone. */}
          <StepAmountField
            value={incomeText}
            onChangeText={(t) => setIncomeText(t.replace(/[^0-9]/g, ''))}
            placeholder="45,000"
            accessibilityLabel="Monthly take-home"
            maxLength={9}
          />
        </StepScaffold>
      )}

      {/* PAYDAY STEP — the exact date, not a day-of-month. Only reached when
          `incomeNum > 0` (see the income step's routing above); Back always
          lands on income, whatever the income step's exit path was. */}
      {stage === 'payday' && (
        <StepScaffold
          stageKey="payday"
          onBack={() => setStage('income')}
          {...(stepPosition('payday') ?? {})}
          title="When are you going to receive your next payment?"
          subtitle="Becomes a salary entry that day, and repeats monthly."
          footer={<StepFooter primaryLabel="Continue" onPrimary={() => setStage('money')} />}
        >
          <PressableScale
            style={styles.payDateCard}
            onPress={() => setShowPayDateSheet(true)}
            accessibilityLabel={`Next payment date, ${isSameDay(firstPayDate, Date.now()) ? 'today' : fullDate(firstPayDate)}. Change`}
          >
            <IconCircle icon="calendar" size={72} color={colors.accent} bg={colors.accentMuted} iconSize={32} />
            <Text style={styles.payDateText}>
              {isSameDay(firstPayDate, Date.now()) ? 'Today' : fullDate(firstPayDate)}
            </Text>
            <Text style={styles.payDateHint}>Tap to change</Text>
          </PressableScale>
        </StepScaffold>
      )}

      {/* MONEY STEP — cash leads as the one open hero field; bank, wallet,
          investments and credit sit behind a pick, so the fast path still
          costs one number, not five (`SPEC-2026-09-FEEDBACK.md` §2 O5, cut back 2026-09-23:
          "friction to ask everything on onboarding" — the five-chip version
          asked MORE up front than the four-field layout it replaced, which
          was the opposite of the point). */}
      {stage === 'money' && (
        <StepScaffold
          stageKey="money"
          onBack={() => setStage('income')}
          {...(stepPosition('money') ?? {})}
          title="What do you have right now?"
          subtitle="Sets up Available Money on the Plan screen — and what's yours to spend on Home. Rough numbers are fine."
          footer={
            <StepFooter
              primaryLabel="Continue"
              onPrimary={() => setStage('pay')}
              skipLabel="Skip"
              onSkip={() => setStage('pay')}
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
          <View style={styles.chipRowLeft}>
            {/* Toggles, so no trailing affordance — AGENTS §9. Genuinely
                multi-select; a question that is never asked cannot be
                answered wrong, so nothing here defaults to ticked. */}
            <Chip label="Bank balance" icon="briefcase" selected={hasBank} onPress={toggleBank} />
            <Chip label="Wallet" icon="shopping-bag" selected={hasWallet} onPress={toggleWallet} />
            <Chip label="Investments" icon="trending-up" selected={hasInvest} accent={colors.income} onPress={toggleInvest} />
            <Chip label="Credit card" icon="credit-card" selected={hasCredit} accent={colors.settle} onPress={toggleCredit} />
          </View>

          {/* One `Collapse` around the whole card rather than one per row: the
              card appearing and disappearing is the visible event. */}
          <Collapse visible={moneyRows.length > 0}>
            <Card clip style={styles.moneyCard}>
              {moneyRows.map((r, i) => (
                <React.Fragment key={r.key}>
                  {i > 0 && <Divider indent="text" />}
                  {r.node}
                </React.Fragment>
              ))}
            </Card>
          </Collapse>
          <Text style={styles.helpLine}>Tick only what you have — anything you skip can be added later in Plan → Your money.</Text>
        </StepScaffold>
      )}

      {/*
        PAY STEP — how you usually pay.

        This was already being SAVED — defaulted to UPI, never asked — so every
        transaction carried a payment method the user had not chosen and would
        have no reason to suspect. Asking makes the default theirs, and it is the
        one question here whose answer shows up on literally every entry.

        Skippable, and skipping keeps UPI: it is the right guess for this market,
        and a required question about a preference is a worse trade than a good
        default. The Settings row stays the way to change it later.
      */}
      {stage === 'pay' && (
        <StepScaffold
          stageKey="pay"
          onBack={() => setStage('money')}
          {...(stepPosition('pay') ?? {})}
          title="How do you usually pay?"
          subtitle="Filled in for you on every new expense, so the common case takes no taps. You can change it on any single one."
          footer={
            <StepFooter
              primaryLabel="Continue"
              onPrimary={() => setStage('budget')}
              skipLabel="Skip"
              onSkip={() => setStage('budget')}
            />
          }
        >
          {/* The shared picker, and — now — the only place the question is asked.
              Two rounds of collapsing got here. This step hand-rolled its own list
              while `PayMethodSelector` scrolled tiles sideways elsewhere, so the
              component became the list; but the *money* step had been rendering the
              picker too, one screen earlier, under the identical heading. Deleting
              one hand-roll left two identical call sites, which is a duplication the
              first fix could not see. `payMethod.test.ts` covers the enum half of
              this; `onboardingConsistency.test.ts` covers this half. */}
          {/* No help line here on purpose (`SPEC-2026-09-FEEDBACK.md` §2 O8) — the subtitle's
              second clause ("You can change it on any single one") already
              says this; a line below the picker repeating it in five fewer
              words was the duplication the copy pass exists to remove. */}
          <PayMethodSelector value={payMethod} onChange={setPayMethod} />
        </StepScaffold>
      )}

      {/* BUDGET STEP — presets derive from the income just entered, or there are
          none at all. */}
      {stage === 'budget' && (
        <StepScaffold
          stageKey="budget"
          onBack={() => setStage('pay')}
          {...(stepPosition('budget') ?? {})}
          title="Set your monthly budget"
          subtitle={incomeNum > 0
            ? 'Most people cap spending at 50–70% of take-home. Pick one or type your own.'
            : 'What do you want to cap your spending at each month?'}
          footer={
            <StepFooter
              primaryLabel="Continue"
              onPrimary={() => setStage('permissions')}
              skipLabel="Skip — I'll set it later"
              onSkip={() => { setBudgetText(''); setStage('permissions'); }}
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
            {budgetPresets.map(v => (
              <Chip
                key={v}
                label={fmtK(v)}
                selected={budgetNum === v}
                onPress={() => { haptic.selection(); setBudgetText(String(v)); }}
              />
            ))}
          </View>
          {/* Both operands guarded: with budget 0 this rendered "that's — of your take-home". */}
          {incomeNum > 0 && budgetNum > 0 && (
            <Text style={styles.budgetPct}>
              That&apos;s {Math.round((budgetNum / incomeNum) * 100)}% of your take-home — it shows as the pace bar on Home.
            </Text>
          )}
        </StepScaffold>
      )}

      {/* PERMISSIONS STEP — notifications + location priming + data safety. */}
      {stage === 'permissions' && (
        <StepScaffold
          stageKey="permissions"
          onBack={() => setStage('budget')}
          {...(stepPosition('permissions') ?? {})}
          title="Stay on top of things"
          subtitle="All optional and fully on-device. You can change any of them in Settings any time."
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
              label="Reminders for upcoming charges"
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
            {/* Siri set-up is parked, not deleted — see openVoiceSetup below and
                TRACKER §8. It used to sit here as a door out to Shortcuts once
                the flow had shown its value; that's real estate a step this
                early can't spend on a feature few people will use yet. */}
          </View>
          {/* V2-02: without an account everything lives only on this phone, and the
              backup nudge is the one mitigation for losing it. Stated here, defaulted
              on in the commit. */}
          {/* The permissions step is where a user is deciding how much to trust this,
              so it is the right place to say what will *never* be asked for — next to
              what is being asked for right now. */}
          <Text style={styles.dataNote}>
            Nothing is uploaded unless you sign in. We never ask for your bank login and never read your messages. We&apos;ll nudge you monthly to back up (Settings → Backup), because without an account a lost phone is the one thing this can&apos;t survive.
          </Text>
        </StepScaffold>
      )}

      {/* SUMMARY — what the answers actually created, then straight into the app. */}
      {stage === 'summary' && (
        <StepScaffold
          stageKey="summary"
          onBack={done}
          title="You're set"
          subtitle="Here's what your answers just set up — each one is live in the app right now."
          art={<IconCircle icon="check-circle" size={72} color={colors.income} bg={colors.bgMuted} iconSize={32} />}
          footer={
            <StepFooter
              primaryLabel="Log your first expense"
              onPrimary={finishAndAddFirst}
              skipLabel="Go to Home"
              onSkip={done}
            />
          }
        >
          <SummaryStage
            incomeNum={incomeNum}
            firstPayDate={firstPayDate}
            budgetNum={budgetNum}
            notifPerm={notifPerm}
            splits={intent !== 'personal'}
          />
        </StepScaffold>
      )}

      {/* The payday step's picker. A sheet, not inline (AGENTS §9: one value,
          one decision) — mounted once here rather than inside the `payday`
          stage block, so it isn't torn down and rebuilt if the stage changes
          while it's open. `minDate` is today: "next payment" stops meaning
          anything for a date already behind you (`SPEC-2026-09-FEEDBACK.md` §2 O4). */}
      <DatePickerSheet
        visible={showPayDateSheet}
        value={firstPayDate}
        minDate={Date.now()}
        onClose={() => setShowPayDateSheet(false)}
        onChange={setFirstPayDate}
      />
    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // ⛔ HERO ONLY — do not touch these styles. `footer` and `bottomPad` are shared
  // with the hero block, which is why the step components fork their own rather
  // than reusing these. (The reveal timing lives at `HERO_REVEAL_MS` and is stated
  // there only — this comment used to carry its own copy of the numbers, and was
  // still quoting 2.4s two changes after that stopped being true.)
  heroRoot: { flex: 1 },
  heroBottom: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: layout.screenPaddingH, gap: space.md },
  brand: { ...type.title, fontSize: 36, color: colors.textPrimary, textAlign: 'center' },
  taglineWrap: { alignSelf: 'stretch' },
  tagline: { ...type.body, fontSize: 16, color: colors.textSecondary, marginTop: space.md, lineHeight: 24, textAlign: 'center', paddingHorizontal: space.md },
  footer: { gap: space.md, paddingTop: space.md },
  footNote: { ...type.caption, color: colors.textMuted, textAlign: 'center' },


  // ---- step content (chrome itself lives in onboarding/Step*) ----------------
  /** One shared help/caption line. */
  helpLine: { ...type.caption, color: colors.textMuted, alignSelf: 'stretch', marginTop: space.sm, lineHeight: 16 },
  chipRow: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', justifyContent: 'center' },
  chipRowLeft: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  // Intent stage
  intentLogo: { width: 64, height: 64, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  intentRupee: { ...type.amountLG, color: colors.bg },
  intentCards: { gap: space.sm },
  intentNote: { ...type.caption, color: colors.textMuted, textAlign: 'center', paddingHorizontal: space.md, marginTop: space.md, lineHeight: 16 },

  // Payday stage — a tappable hero, not a form field, since the whole step is
  // one decision with an already-sensible default already showing.
  payDateCard: { alignItems: 'center', gap: space.sm, paddingVertical: space.lg },
  payDateText: { ...type.title, color: colors.textPrimary, textAlign: 'center' },
  payDateHint: { ...type.caption, color: colors.textMuted },

  // Budget stage
  budgetPct: { ...type.label, color: colors.income, textAlign: 'center', marginTop: space.md },

  // Money step
  moneyCard: { marginTop: space.md },

  // Permissions step
  permList: { gap: space.sm },
  dataNote: { ...type.caption, color: colors.textMuted, marginTop: space.lg, paddingHorizontal: space.xs, lineHeight: 16 },
});
