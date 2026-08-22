import { useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import * as Location from 'expo-location';
import { settings } from '../lib/settings';
import { PayMethod } from '../constants/enums';
import { haptic } from '../lib/haptics';
import { requestNotificationPermission } from '../lib/notifications';
import { setReminderPrefs } from '../lib/reminders';
import { finalizeOnboarding } from '../lib/onboarding';
import type { OnboardingIntent } from '../lib/personaDefaults';

/**
 * The rebuilt first-run flow: every stage either asks something that visibly
 * changes the app, or (summary) shows exactly what the answers changed. The
 * feature carousel (asked nothing, changed nothing), the forward-only payoff
 * beat and the fake 1.7s "committing" checklist are gone — the write is a fast
 * local SQLite transaction and pretending otherwise was theatre.
 */
export type OnboardingStage =
  | 'hero' | 'intent' | 'name' | 'income' | 'money' | 'budget'
  | 'people' | 'permissions' | 'summary';

/** The numbered flow, intent onward. `summary` is a result, not a question. */
export const NUMBERED_STEPS: OnboardingStage[] = ['intent', 'name', 'income', 'money', 'budget', 'people', 'permissions'];

/**
 * Someone who told us they only track their own spending is never asked who they
 * split with — the step can only produce contacts they'd never use, and the dots
 * shouldn't count a screen they'll never see.
 */
export function numberedSteps(intent: OnboardingIntent): OnboardingStage[] {
  return intent === 'personal' ? NUMBERED_STEPS.filter(s => s !== 'people') : NUMBERED_STEPS;
}

/**
 * Where a step sits in the flow, 1-based. Known from the FIRST question — the
 * old flow showed no count until three screens had gone by, and the total
 * changed under the user when the persona shifted mid-flow.
 */
export function stepPosition(stage: OnboardingStage, intent: OnboardingIntent): { step: number; total: number } | null {
  const steps = numberedSteps(intent);
  const idx = steps.indexOf(stage);
  if (idx < 0) return null;
  return { step: idx + 1, total: steps.length };
}

/** rupees text → integer paise (0 when blank or unparseable). */
function toPaise(t: string): number {
  return Math.max(0, Math.round((Number(t.replace(/[^0-9.]/g, '')) || 0) * 100));
}

/** rupees text → whole rupees (0 when blank or unparseable). */
function toRupees(t: string): number {
  return Math.max(0, Math.round(Number(t.replace(/[^0-9.]/g, '')) || 0));
}

/**
 * All of the onboarding questionnaire's state, stage machine and commit — so the
 * screen is render-only, matching `useAddTxnForm` / `useItemizedForm` (AUDIT DEBT-12).
 */
export function useOnboardingForm({ onDone }: { onDone: () => void }) {
  const db = useSQLiteContext();

  const [stage, setStage] = useState<OnboardingStage>('hero');
  const [intent, setIntent] = useState<OnboardingIntent>('both');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [committed, setCommitted] = useState(false);           // finalize succeeded
  const [incomeText, setIncomeText] = useState('');            // free take-home entry (rupees)
  const [payday, setPayday] = useState(1);                     // day of month salary lands
  const [budgetText, setBudgetText] = useState('');            // free monthly-budget entry (rupees)
  const [cashText, setCashText] = useState('');                // total cash available (rupees)
  const [investText, setInvestText] = useState('');            // total investments (rupees)
  const [creditLimitText, setCreditLimitText] = useState('');  // credit card limit (rupees)
  const [creditUsedText, setCreditUsedText] = useState('');    // credit already used (rupees)
  const [payMethod, setPayMethod] = useState<PayMethod>(PayMethod.Upi);
  const [people, setPeople] = useState<string[]>([]);          // contacts added during onboarding
  const [personDraft, setPersonDraft] = useState('');
  const [groupName, setGroupName] = useState('Friends');       // the group the contacts land in
  const [notifPerm, setNotifPerm] = useState(false);
  const [locPerm, setLocPerm] = useState(false);

  // Parsed numeric views of the free-text amounts (0 when blank/invalid).
  const incomeNum = toRupees(incomeText);
  const budgetNum = toRupees(budgetText);

  // The 'people' step is skipped for the personal-only persona, in both directions —
  // so Back from permissions must land on budget, not on the skipped screen.
  const afterBudget: OnboardingStage = intent === 'personal' ? 'permissions' : 'people';
  const beforePermissions: OnboardingStage = intent === 'personal' ? 'budget' : 'people';

  /**
   * Commit, then land on the summary — which reads back what was actually set
   * up. The write is one atomic `finalizeOnboarding` call; no theatrical wait.
   */
  async function finalize() {
    setSaving(true);
    const ok = await finalizeOnboarding(db, {
      intent, name, incomeNum, payday, budgetNum, people, payMethod,
      groupName: people.length > 0 ? groupName : null,
      addFirst: false, // the summary's own CTA arms this explicitly
      money: {
        openingBank: toPaise(cashText),
        investments: toPaise(investText),
        creditLimit: toPaise(creditLimitText),
        creditUsed: toPaise(creditUsedText),
      },
    });
    if (ok) haptic.success(); else haptic.error();
    setCommitted(ok);
    setSaving(false);
    setStage('summary');
  }

  /** Summary CTA: open Quick Add once, right after the gate opens. */
  async function finishAndAddFirst() {
    try { await settings.setPendingFirstAdd(true); } catch { /* best-effort */ }
    onDone();
  }

  function addPerson() {
    const t = personDraft.trim();
    if (!t) return;
    haptic.selection();
    setPeople(prev => (prev.some(p => p.toLowerCase() === t.toLowerCase()) ? prev : [...prev, t]));
    setPersonDraft('');
  }

  async function allowNotifications() {
    haptic.selection();
    const ok = await requestNotificationPermission();
    setNotifPerm(ok);
    if (ok) { try { await setReminderPrefs({ renewals: true }); } catch { /* best-effort */ } }
  }

  async function allowLocation() {
    haptic.selection();
    const { status } = await Location.requestForegroundPermissionsAsync();
    const ok = status === 'granted';
    setLocPerm(ok);
    if (ok) { try { await settings.setSaveLocation(true); } catch { /* best-effort */ } }
  }

  return {
    // stage machine
    stage, setStage, afterBudget, beforePermissions,
    // persona
    intent, setIntent,
    // fields
    name, setName, incomeText, setIncomeText, incomeNum, payday, setPayday,
    budgetText, setBudgetText, budgetNum,
    cashText, setCashText, investText, setInvestText,
    creditLimitText, setCreditLimitText, creditUsedText, setCreditUsedText,
    payMethod, setPayMethod,
    people, setPeople, personDraft, setPersonDraft, addPerson,
    groupName, setGroupName,
    // permissions
    notifPerm, locPerm, allowNotifications, allowLocation,
    // commit + summary
    saving, committed, finalize, finishAndAddFirst, onDone,
  };
}
