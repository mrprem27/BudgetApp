import React from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  useWindowDimensions, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, layout } from '../../theme';
import { PERSONA_OPTIONS, personaTrims, type OnboardingIntent } from '../../lib/personaDefaults';
import { useOnboardingForm, stepPosition } from '../../hooks/useOnboardingForm';
import { GROUP_COLORS } from '../../constants/palette';
import { PrimaryButton } from '../ui/PrimaryButton';
import { FadeIn } from '../ui/FadeIn';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { Divider } from '../ui/Divider';
import { ListRow } from '../ui/ListRow';
import { PayMethod, PAY_METHOD_LABEL, PAY_METHOD_ICON } from '../../constants/enums';
import { IconCircle } from '../ui/IconCircle';
import { OptionRow } from '../ui/OptionRow';
import { SectionHeader } from '../ui/SectionHeader';
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

/** Fallback budget presets when no income was given (nothing to derive from). */
const BUDGET_PRESETS_FLAT = [20000, 30000, 40000, 50000];
const PAYDAY_OPTIONS = [1, 5, 7, 10, 15, 25, 30];
const GROUP_NAME_OPTIONS = ['Home', 'Trip', 'Friends'];

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
    payMethod, setPayMethod,
    people, setPeople, personDraft, setPersonDraft, addPerson,
    groupName, setGroupName,
    notifPerm, locPerm, allowNotifications, allowLocation,
    saving, finalize, finishAndAddFirst, onDone: done,
  } = useOnboardingForm({ onDone });

  // Budget chips derive from the income just given (50/60/70% of take-home) so
  // the suggestion is about THIS user, not four round numbers.
  const budgetPresets = incomeNum > 0
    ? [0.5, 0.6, 0.7].map(f => Math.round((incomeNum * f) / 1000) * 1000).filter(v => v > 0)
    : BUDGET_PRESETS_FLAT;

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
          {/* Reveals once the mark has visibly FORMED — not over it, and not after
              the whole physics run.

              Three positions have been tried here. Waiting for the full ~3.7s
              assembly put the first tap 4.8s away, which is why it was moved to
              900ms. But at 900ms the words arrive on top of a logo still visibly
              assembling, and it reads as a mistake rather than as a sequence.

              2.4s is where the mark is legible and the animation is only settling.
              The name lands on a finished logo, and the first tap is ~2.8s — most
              of the speed, none of the overlap.

              ⛔ LogoAssembly itself is untouched, as it always must be. Only these
              three delays moved. */}
          <View style={[styles.heroBottom, { paddingBottom: bottomPad }]}>
            <FadeIn delay={1400} offset={14}>
              <Text style={styles.brand}>BudgetSplit</Text>
            </FadeIn>
            <FadeIn delay={1550} offset={10} style={styles.taglineWrap}>
              {/* "No bank login" leads, ahead of "nothing in the cloud". It is the
                  concrete, checkable version of the same promise — every competitor
                  in this market either asks for a bank connection or reads your SMS,
                  and this is the one line that separates the app from both. The
                  vaguer cloud claim follows it rather than standing alone. */}
              <Text style={styles.tagline}>Budget your money and split bills — no bank login, no sign-up, and nothing is uploaded unless you ask.</Text>
            </FadeIn>
            <FadeIn delay={1700} style={styles.footer}>
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
          <TextInput
            style={styles.nameInput}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.textMuted}
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

          <SectionHeader title="When do you get paid?" />
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
          {/* What the answer DOES — not a vague promise. */}
          <Text style={styles.helpLine}>
            Becomes a salary entry on the {ordinal(payday)} of each month — you&apos;ll see it under Plan → Recurring, and it powers &quot;Can I afford this?&quot;.
          </Text>
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

          <SectionHeader title="Anything else?" />
          <Card clip>
            <MoneyRow icon="trending-up" label="Investments" value={investText} onChangeText={(t) => setInvestText(t.replace(/[^0-9]/g, ''))} tint={colors.income} accessibilityLabel="Investments" />
            <Divider indent="text" />
            <MoneyRow icon="credit-card" label="Credit limit" value={creditLimitText} onChangeText={(t) => setCreditLimitText(t.replace(/[^0-9]/g, ''))} tint={colors.settle} accessibilityLabel="Credit card limit" />
            <Divider indent="text" />
            <MoneyRow icon="activity" label="Credit used" value={creditUsedText} onChangeText={(t) => setCreditUsedText(t.replace(/[^0-9]/g, ''))} tint={colors.expense} accessibilityLabel="Credit already used" />
          </Card>
          <Text style={styles.helpLine}>Leave any of these at zero if they don&apos;t apply.</Text>

          {/* One extra question rather than a tenth step: it belongs with "what do
              you have", and it is the only answer here that changes what the Add
              screen opens on. Purely a capture default — it never moves money. */}
          <SectionHeader title="How do you usually pay?" />
          <PayMethodSelector value={payMethod} onChange={setPayMethod} />
        </StepScaffold>
      )}

      {/* BUDGET STEP — presets derive from the income just entered. */}
      {/*
        How you usually pay.
        
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
          <Card clip>
            {PAY_CHOICES.map((m, i) => (
              <React.Fragment key={m}>
                {i > 0 && <Divider indent="text" />}
                <ListRow
                  icon={PAY_METHOD_ICON[m]}
                  iconColor={payMethod === m ? colors.accent : colors.textSecondary}
                  title={PAY_METHOD_LABEL[m]}
                  chevron={false}
                  value={payMethod === m
                    ? <Feather name="check" size={18} color={colors.accent} />
                    : undefined}
                  onPress={() => { haptic.selection(); setPayMethod(m); }}
                />
              </React.Fragment>
            ))}
          </Card>
          <Text style={styles.helpLine}>Autopay and other methods are still available on each transaction.</Text>
        </StepScaffold>
      )}

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

      {/* PEOPLE STEP — contacts AND the group they live in, so the Groups tab is
          real on landing instead of "No groups yet". */}
      {stage === 'people' && (
        <StepScaffold
          stageKey="people"
          onBack={() => setStage('budget')}
          {...(stepPosition('people', intent) ?? {})}
          title="Anyone you split with?"
          subtitle="Add flatmates, friends or family — they become a group you can bill straight away."
          footer={
            <StepFooter
              primaryLabel={people.length > 0 ? `Create “${groupName}” with ${people.length}` : 'Continue'}
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
            <>
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

              <SectionHeader title="Call the group" />
              <View style={styles.chipRowLeft}>
                {GROUP_NAME_OPTIONS.map(g => (
                  <Chip
                    key={g}
                    label={g}
                    selected={groupName === g}
                    onPress={() => { haptic.selection(); setGroupName(g); }}
                  />
                ))}
              </View>
              <TextInput
                style={styles.groupNameInput}
                value={GROUP_NAME_OPTIONS.includes(groupName) ? '' : groupName}
                onChangeText={(t) => setGroupName(t || 'Friends')}
                placeholder="…or type a name"
                placeholderTextColor={colors.textMuted}
                maxLength={30}
                accessibilityLabel="Group name"
              />
            </>
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
            {flags.voiceEntry && (
              <OptionRow
                label="Log spends by talking to Siri"
                description={`Say "Hey Siri, ${VOICE_ONE_WAY_NAME}", then how much and what for — it opens here with everything filled in. Set up now or later in Settings.`}
                selected={false}
                onPress={openVoiceSetup}
                accent={colors.income}
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
            people={people}
            groupName={groupName}
            notifPerm={notifPerm}
          />
        </StepScaffold>
      )}

    </View>
  );
}

/**
 * Offered as a default, in the order they are likely in this market.
 *
 * Deliberately not every `PayMethod`. Autopay is set by a mandate rather than
 * chosen at the till, and "Other" is a fallback, not a habit — defaulting every
 * future expense to either would be worse than a wrong guess between the four
 * real ones. Both stay selectable on an individual transaction.
 */
const PAY_CHOICES: PayMethod[] = [PayMethod.Upi, PayMethod.Card, PayMethod.Cash, PayMethod.Bank, PayMethod.Wallet];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // ⛔ HERO ONLY — do not touch these styles. The FadeIn delays in the hero block
  // are tuned to LogoAssembly's ~3.7s physics run (they reveal at 2.4s, once the
  // mark has formed); `footer` and `bottomPad` are shared with it, which is why
  // the step components fork their own rather than reusing these.
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
  intentNote: { ...type.caption, color: colors.textMuted, textAlign: 'center', paddingHorizontal: space.md, marginTop: space.md, lineHeight: 16 },

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
  groupNameInput: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.smd, borderWidth: 1, borderColor: colors.border, alignSelf: 'stretch', marginTop: space.sm },

  // Permissions step
  permList: { gap: space.sm },
  dataNote: { ...type.caption, color: colors.textMuted, marginTop: space.lg, paddingHorizontal: space.xs, lineHeight: 16 },
});
