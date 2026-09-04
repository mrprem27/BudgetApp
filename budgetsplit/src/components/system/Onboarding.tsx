import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, layout } from '../../theme';
import { PERSONA_OPTIONS, personaTrims, type OnboardingIntent } from '../../lib/personaDefaults';
import { useOnboardingForm, stepPosition } from '../../hooks/useOnboardingForm';
import { GROUP_COLORS } from '../../constants/palette';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import { FadeIn } from '../ui/FadeIn';
import { Collapse } from '../ui/anim/Collapse';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { Divider } from '../ui/Divider';
import { Input } from '../ui/Input';
import { ListRow } from '../ui/ListRow';
import { DayOfMonthGrid } from '../ui/DayOfMonthGrid';
import { IconCircle } from '../ui/IconCircle';
import { OptionRow } from '../ui/OptionRow';
import { SectionHeader } from '../ui/SectionHeader';
import { MemberAvatar } from '../finance/MemberAvatar';
import { PayMethodSelector } from '../finance/PayMethodSelector';
import { StepScaffold } from './onboarding/StepScaffold';
import { StepFooter } from './onboarding/StepFooter';
import { StepAmountField } from './onboarding/StepAmountField';
import { MoneyRow } from './onboarding/MoneyRow';
import { SummaryStage } from './onboarding/SummaryStage';
import { haptic } from '../../lib/haptics';
import { LogoAssembly } from './LogoAssembly';
import { VOICE_ONE_WAY_NAME, VOICE_SHORTCUT_URL, SHORTCUTS_APP_URL } from '../../lib/voiceShortcut';
import { ensureVoiceInbox } from '../../lib/voiceDrain';
import { useFeatureFlags } from './FeatureFlagsProvider';

// The persona type is owned by lib/personaDefaults, which maps it to feature flags.
type IntentKey = OnboardingIntent;

const INTENT_OPTIONS = PERSONA_OPTIONS;

const INCOME_PRESETS = [
  { label: '₹30k', value: 30000 },
  { label: '₹45k', value: 45000 },
  { label: '₹60k', value: 60000 },
  { label: '₹1L', value: 100000 },
];

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

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function fmtK(v: number): string {
  return `₹${v >= 100000 ? `${(v / 100000).toFixed(1).replace(/\.0$/, '')}L` : `${Math.round(v / 1000)}k`}`;
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const { flags } = useFeatureFlags();

  /**
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
    stage, setStage, afterBudget, beforePermissions,
    intent, setIntent,
    name, setName, incomeText, setIncomeText, incomeNum, payday, setPayday,
    budgetText, setBudgetText, budgetNum,
    cashText, setCashText, investText, setInvestText,
    creditLimitText, setCreditLimitText, creditUsedText, setCreditUsedText,
    hasInvest, hasCredit, toggleInvest, toggleCredit,
    payMethod, setPayMethod,
    people, personDraft, setPersonDraft, personEmailDraft, setPersonEmailDraft,
    addPerson, removePerson, skipPeople,
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
              <PrimaryButton label="Get Started" onPress={() => setStage('intent')} />
              <Text style={styles.footNote}>Takes 20 seconds · no sign-up</Text>
            </FadeIn>
          </View>
        </View>
      )}

      {/* INTENT — "What brings you here?" Each card says what it TRIMS, derived
          live from the persona's real flag patch — the old copy said "all
          features stay available" while 'split' silently disabled five. */}
      {stage === 'intent' && (
        <StepScaffold
          stageKey="intent"
          onBack={() => setStage('hero')}
          {...(stepPosition('intent', intent) ?? {})}
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

      {/* NAME ENTRY — the only step that needs the keyboard. */}
      {stage === 'name' && (
        <StepScaffold
          stageKey="name"
          onBack={() => setStage('intent')}
          {...(stepPosition('name', intent) ?? {})}
          title="First, your name"
          subtitle="It's shown when you split bills with others. You can change any of this later in Settings."
          art={<IconCircle icon="user" size={72} color={colors.accent} bg={colors.accentMuted} iconSize={32} />}
          footer={
            <StepFooter
              primaryLabel="Continue"
              onPrimary={() => setStage('income')}
              skipLabel="Skip"
              onSkip={() => setStage('income')}
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
            onSubmitEditing={() => setStage('income')}
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
          subtitle="A rough number is fine — tap a preset or type your own."
          footer={
            <StepFooter
              primaryLabel="Continue"
              onPrimary={() => { if (!budgetText) setBudgetText(incomeNum > 0 ? String(Math.round((incomeNum * 0.6) / 1000) * 1000) : ''); setStage('money'); }}
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

          {/* ⚠️ The grid renders UNCONDITIONALLY, and that is load-bearing.

              It was briefly wrapped in a `Collapse` keyed on `incomeNum > 0`, so it
              appeared when you typed. That reveal takes this step's content from
              ~298pt to ~651pt against a ~576pt viewport — across the threshold where
              `StepScaffold`'s `flexGrow: 1` + `justifyContent: 'center'` stops
              centring. The title, the ₹ field and the caret all jumped ~140pt on the
              FIRST DIGIT TYPED: exactly the failure `StepScaffold` removed the
              `KeyboardAvoidingView` to prevent, re-introduced from the content side
              instead of the container side.

              Always-on keeps the step taller than the viewport at all times, so it
              never centres and never moves. Asking before there is an income costs
              nothing — with no income no rule is written, so the answer is simply
              unused. The half that was genuinely lying is the help line, and that
              is what stays conditional. */}
          <SectionHeader title="When do you get paid?" />
          {/* All 31, not the seven someone thought to list — a person paid on the
              28th could not say so, and had to name a day their salary doesn't
              land on. `paydayAnchor` clamps 29–31 to the length of a short month. */}
          <DayOfMonthGrid
            value={payday}
            onChange={(d) => { haptic.selection(); setPayday(d); }}
            labelFor={(d) => `Paid on the ${ordinal(d)}`}
          />
          {/* What the answer DOES — and only once it will actually do it.
              `finalizeOnboarding` writes the salary rule for `incomeNum > 0` only,
              so with no amount this sentence would describe an entry that is never
              created. One line appearing under a grid does not move the grid. */}
          {incomeNum > 0 && (
            <Text style={styles.helpLine}>
              Becomes a salary entry on the {ordinal(payday)} of each month — you&apos;ll see it under Plan → Recurring, and it powers &quot;Can I afford this?&quot;.
            </Text>
          )}
        </StepScaffold>
      )}

      {/* MONEY STEP — cash leads; investments/credit sit behind a disclosure so
          the fast path costs one number, not four. */}
      {stage === 'money' && (
        <StepScaffold
          stageKey="money"
          onBack={() => setStage('income')}
          {...(stepPosition('money', intent) ?? {})}
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

          {/* PICK, THEN FILL.

              These three fields used to sit here open, so everyone was asked for a
              credit limit and a balance whether or not they hold a card — and the
              honest answer to a question that doesn't apply is not zero, it's
              nothing. What actually happened was either a typed 0 (a claim the app
              then treats as real) or a skip of the entire screen, including the cash
              figure that did apply.

              The cash figure above stays open because everybody has one; only the
              optional half is behind a pick. Un-ticking clears what was typed
              (`toggleInvest` / `toggleCredit`), so a figure can never be committed
              by a control the user can no longer see. */}
          <SectionHeader title="Anything else?" />
          <View style={styles.chipRowLeft}>
            {/* Toggles, so no trailing affordance — AGENTS §9. This is the one chip
                row in the flow that is genuinely multi-select. */}
            <Chip label="Investments" icon="trending-up" selected={hasInvest} accent={colors.income} onPress={toggleInvest} />
            <Chip label="Credit card" icon="credit-card" selected={hasCredit} accent={colors.settle} onPress={toggleCredit} />
          </View>

          {/* One `Collapse` around the whole card rather than one per row: the card
              appearing and disappearing is the visible event, and per-row wrapping
              would break the divider interleaving below. */}
          <Collapse visible={hasInvest || hasCredit}>
            <Card clip style={styles.moneyCard}>
              {hasInvest && (
                <MoneyRow icon="trending-up" label="Investments" value={investText} onChangeText={(t) => setInvestText(t.replace(/[^0-9]/g, ''))} tint={colors.income} accessibilityLabel="Investments" />
              )}
              {hasInvest && hasCredit && <Divider indent="text" />}
              {hasCredit && (
                <>
                  <MoneyRow icon="credit-card" label="Credit limit" value={creditLimitText} onChangeText={(t) => setCreditLimitText(t.replace(/[^0-9]/g, ''))} tint={colors.settle} accessibilityLabel="Credit card limit" />
                  <Divider indent="text" />
                  <MoneyRow icon="activity" label="Credit used" value={creditUsedText} onChangeText={(t) => setCreditUsedText(t.replace(/[^0-9]/g, ''))} tint={colors.expense} accessibilityLabel="Credit already used" />
                </>
              )}
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
          {...(stepPosition('pay', intent) ?? {})}
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
          <PayMethodSelector value={payMethod} onChange={setPayMethod} />
          <Text style={styles.helpLine}>You can change this on any transaction.</Text>
        </StepScaffold>
      )}

      {/* BUDGET STEP — presets derive from the income just entered, or there are
          none at all. */}
      {stage === 'budget' && (
        <StepScaffold
          stageKey="budget"
          onBack={() => setStage('pay')}
          {...(stepPosition('budget', intent) ?? {})}
          title="Set your monthly budget"
          subtitle={incomeNum > 0
            ? 'Most people cap spending at 50–70% of take-home. Pick one or type your own.'
            : 'What do you want to cap your spending at each month?'}
          footer={
            <StepFooter
              primaryLabel="Continue"
              onPrimary={() => setStage(afterBudget)}
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

      {/* PEOPLE STEP — contacts, and only contacts.

          It used to build a group here too: name picked from three chips *and* a
          free-text field editing the same value, icon inferred from that name
          string (`'Flat'` → the generic `users` glyph), colour hard-coded to
          `GROUP_COLORS[0]`. That bypassed `GroupForm`, which is the app's real
          group form, so onboarding was the one place a group could be made wrong
          and then not fixed without leaving the flow.

          The question this step asks is who you split with, and the answer to that
          is people. Which groups they belong in is a different question, asked
          where groups are made. What the step gains instead is the **email**:
          `person.email` is the only identifier that is the same string on both
          phones, so it is what lets a contact become a linked account later. */}
      {stage === 'people' && (
        <StepScaffold
          stageKey="people"
          onBack={() => setStage('budget')}
          {...(stepPosition('people', intent) ?? {})}
          title="Anyone you split with?"
          subtitle="Add flatmates, friends or family. An email is optional — it's what lets you link up with them later, if they use the app too."
          footer={
            <StepFooter
              primaryLabel={people.length > 0 ? `Continue with ${people.length}` : 'Continue'}
              // Flush the draft before advancing. Someone who types a name and taps
              // Continue plainly means "and this one" — without this, the person
              // they just typed is discarded silently, with the button even
              // counting the ones that did make it.
              onPrimary={() => { addPerson(); setStage('permissions'); }}
              skipLabel="Skip"
              // Records the decision as well as advancing — see `skipPeople`.
              onSkip={skipPeople}
            />
          }
        >
          <View style={styles.personForm}>
            <Input
              value={personDraft}
              onChangeText={setPersonDraft}
              placeholder="Name"
              icon="user"
              autoCapitalize="words"
              maxLength={30}
              // `done` + submit, not `next`: `ui/Input` exposes no ref, so nothing
              // can move focus to the email field and a key labelled "next" would
              // do nothing at all. Return adds the person, which is the fast path
              // for the common case of a name and no address.
              returnKeyType="done"
              onSubmitEditing={addPerson}
              accessibilityLabel="Person name"
            />
            <Input
              value={personEmailDraft}
              onChangeText={setPersonEmailDraft}
              placeholder="Email (optional)"
              icon="mail"
              keyboardType="email-address"
              autoCapitalize="none"
              // Off for identifiers: autocorrect will happily rewrite an address.
              autoCorrect={false}
              // 254, the RFC ceiling — and what `PersonNameSheet` uses for the same
              // field. 60 was mine and truncates legal addresses.
              maxLength={254}
              returnKeyType="done"
              onSubmitEditing={addPerson}
              accessibilityLabel="Person email, optional"
            />
            {/* `md`, not the default `lg`. At `lg` this is 52pt and full-width —
                the same weight as the "Continue" CTA pinned in the footer, so the
                step showed two equally loud accent buttons and no hierarchy
                (AGENTS §1/§5). It replaced a 52pt square `+`, which was subordinate
                by construction; this keeps that relationship with a real label. */}
            <SecondaryButton label="Add person" icon="plus" size="md" onPress={addPerson} disabled={!personDraft.trim()} />
          </View>

          {people.length > 0 && (
            <Card clip style={styles.peopleCard}>
              {people.map((p, i) => (
                <React.Fragment key={`${p.name}-${i}`}>
                  {i > 0 && <Divider indent="text" />}
                  {/* `MemberAvatar`, like every other person row in the app — the
                      generic `user` glyph here was the only one that didn't show
                      whose row it was.

                      ⚠️ NO `onPress` on the row. It briefly had one, wired straight
                      to `removePerson` — so tapping anywhere on a 64pt row that
                      shows a name over an email deleted the contact instantly, with
                      no confirm and no undo, while the ✕ beside it was decorative.
                      A row with a subtitle reads as "open this", and every other
                      removal in the app (`friends.tsx`, `group/[id]/members.tsx`)
                      goes through a destructive confirm. Only the ✕ removes. */}
                  <ListRow
                    leading={<MemberAvatar name={p.name} color={GROUP_COLORS[i % GROUP_COLORS.length]} size={layout.iconCircle} />}
                    title={p.name}
                    subtitle={p.email}
                    chevron={false}
                    value={
                      <TouchableOpacity
                        onPress={() => removePerson(i)}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${p.name}`}
                      >
                        <Feather name="x" size={18} color={colors.textMuted} />
                      </TouchableOpacity>
                    }
                  />
                </React.Fragment>
              ))}
            </Card>
          )}
        </StepScaffold>
      )}

      {/* PERMISSIONS STEP — notifications + location priming + data safety. */}
      {stage === 'permissions' && (
        <StepScaffold
          stageKey="permissions"
          onBack={() => setStage(beforePermissions)}
          {...(stepPosition('permissions', intent) ?? {})}
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
            {/* Voice sits with the other OS-level set-up rather than in a stage of its own:
                it needs no answer from the user, and installing the shortcut hands off to
                Apple's Shortcuts app — so it must be trivially skippable and must come after
                the flow has already shown its value. Tapping it leaves the app; onboarding
                state survives the trip because nothing is committed until "Finish setup". */}
            {/* No `selected`, so this draws a chevron rather than a radio. It was
                hard-coded `selected={false}` — a radio that could never fill, on the
                one row here whose tap leaves the app for Shortcuts. The two rows
                above are states; this is a door. */}
            {flags.voiceEntry && (
              <OptionRow
                label="Log spends by talking to Siri"
                description={`Say "Hey Siri, ${VOICE_ONE_WAY_NAME}", then how much and what for — it opens here with everything filled in. Set up now or later in Settings.`}
                onPress={openVoiceSetup}
                leading={<IconCircle icon="mic" size={layout.avatarSize} color={colors.accent} />}
              />
            )}
          </View>
          {/* V2-02: everything lives only on this phone, and the backup nudge is the
              one mitigation for losing it. Stated here, defaulted on in the commit. */}
          {/* The permissions step is where a user is deciding how much to trust this,
              so it is the right place to say what will *never* be asked for — next to
              what is being asked for right now. */}
          <Text style={styles.dataNote}>
            Everything stays on this phone — no account, nothing uploaded. We never ask for your bank login and never read your messages. We&apos;ll nudge you monthly to back up (Settings → Backup), because a lost phone is the one thing this can&apos;t survive.
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
            payday={payday}
            budgetNum={budgetNum}
            people={people.map(p => p.name)}
            notifPerm={notifPerm}
          />
        </StepScaffold>
      )}

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

  // Budget stage
  budgetPct: { ...type.label, color: colors.income, textAlign: 'center', marginTop: space.md },

  // Money step
  moneyCard: { marginTop: space.md },

  // People step
  personForm: { gap: space.sm, alignSelf: 'stretch' },
  peopleCard: { marginTop: space.lg },

  // Permissions step
  permList: { gap: space.sm },
  dataNote: { ...type.caption, color: colors.textMuted, marginTop: space.lg, paddingHorizontal: space.xs, lineHeight: 16 },
});
