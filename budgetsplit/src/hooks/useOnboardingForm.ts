import { useRef, useState, useEffect } from 'react';
import { Animated, Easing, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import * as Location from 'expo-location';
import { settings } from '../lib/settings';
import { haptic } from '../lib/haptics';
import { requestNotificationPermission } from '../lib/notifications';
import { setReminderPrefs } from '../lib/reminders';
import { finalizeOnboarding } from '../lib/onboarding';
import type { OnboardingIntent } from '../lib/personaDefaults';

export type OnboardingStage =
  | 'hero' | 'intent' | 'features' | 'name' | 'income' | 'money' | 'budget' | 'people' | 'permissions';

/** The setup steps after the name screen — these drive the progress dots. */
export const SETUP_STEPS: OnboardingStage[] = ['income', 'money', 'budget', 'people', 'permissions'];

/**
 * Someone who told us they only track their own spending is never asked who they
 * split with — the step can only produce contacts they'd never use, and the dots
 * shouldn't count a screen they'll never see.
 */
export function setupSteps(intent: OnboardingIntent): OnboardingStage[] {
  return intent === 'personal' ? SETUP_STEPS.filter(s => s !== 'people') : SETUP_STEPS;
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
 *
 * `slideCount` and `width` come from the caller because they're presentation facts
 * (how many carousel slides exist, how wide the window is) that the paging math needs.
 */
export function useOnboardingForm({
  onDone, slideCount, width,
}: { onDone: () => void; slideCount: number; width: number }) {
  const db = useSQLiteContext();

  const [stage, setStage] = useState<OnboardingStage>('hero');
  const [page, setPage] = useState(0);
  const [intent, setIntent] = useState<OnboardingIntent>('both');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [incomeText, setIncomeText] = useState('');            // free take-home entry (rupees)
  const [payday, setPayday] = useState(1);                     // day of month salary lands
  const [budgetText, setBudgetText] = useState('');            // free monthly-budget entry (rupees)
  const [cashText, setCashText] = useState('');                // total cash available (rupees)
  const [investText, setInvestText] = useState('');            // total investments (rupees)
  const [creditLimitText, setCreditLimitText] = useState('');  // credit card limit (rupees)
  const [creditUsedText, setCreditUsedText] = useState('');    // credit already used (rupees)
  const [people, setPeople] = useState<string[]>([]);          // contacts added during onboarding
  const [personDraft, setPersonDraft] = useState('');
  const [notifPerm, setNotifPerm] = useState(false);
  const [locPerm, setLocPerm] = useState(false);
  const addFirstRef = useRef(false);

  // Parsed numeric views of the free-text amounts (0 when blank/invalid).
  const incomeNum = toRupees(incomeText);
  const budgetNum = toRupees(budgetText);

  const scrollRef = useRef<any>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(1 / slideCount)).current; // top progress bar fill
  // Source of truth for the current page. `page` state drives the dots/button label,
  // but navigation reads this ref so the "last slide → name" transition fires even
  // after a slow drag-release (which never emits onMomentumScrollEnd).
  const pageRef = useRef(0);

  // The 'people' step is skipped for the personal-only persona, in both directions —
  // so Back from permissions must land on budget, not on the skipped screen.
  const afterBudget: OnboardingStage = intent === 'personal' ? 'permissions' : 'people';
  const beforePermissions: OnboardingStage = intent === 'personal' ? 'budget' : 'people';

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
    // The persona is persisted (with the flags it implies) by finalizeOnboarding, so
    // it lands in the same commit as everything else and can't be half-applied by
    // someone who abandons setup on a later step.
    pageRef.current = 0;
    setPage(0);
    setStage('features');
  }

  function advance() {
    if (pageRef.current < slideCount - 1) {
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
      toValue: (page + 1) / slideCount,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [page, progress, slideCount]);

  /** Single commit point for the whole questionnaire — see lib/onboarding.ts. */
  async function finalize() {
    setSaving(true);
    const ok = await finalizeOnboarding(db, {
      intent, name, incomeNum, payday, budgetNum, people, addFirst: addFirstRef.current,
      money: {
        openingCash: toPaise(cashText),
        investments: toPaise(investText),
        creditLimit: toPaise(creditLimitText),
        creditUsed: toPaise(creditUsedText),
      },
    });
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
    // carousel
    page, scrollRef, scrollX, progress, syncPage, advance, backFromFeatures,
    // persona
    intent, setIntent, enterIntent, enterFeatures,
    // fields
    name, setName, incomeText, setIncomeText, incomeNum, payday, setPayday,
    budgetText, setBudgetText, budgetNum,
    cashText, setCashText, investText, setInvestText,
    creditLimitText, setCreditLimitText, creditUsedText, setCreditUsedText,
    people, setPeople, personDraft, setPersonDraft, addPerson,
    // permissions
    notifPerm, locPerm, allowNotifications, allowLocation,
    // commit
    addFirstRef, saving, finalize,
  };
}
