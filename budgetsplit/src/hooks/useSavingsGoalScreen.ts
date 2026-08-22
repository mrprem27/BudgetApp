import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { parseToPaise, formatRupees, formatCompact, paiseToInput } from '../lib/money';
import type { AssetBucket } from '../constants/enums';
import { haptic } from '../lib/haptics';
import { confirmAsync } from '../lib/confirm';
import { PRIORITY_LABEL } from '../constants/enums';
import { settings } from '../lib/settings';
import {
  getGoalById, getGoalSavedMap, getTotalMoney, getGoalHistory, getGoalHistoryCount,
  fundGoal, withdrawFromGoal, fundedByAsset, setGoalLocked, deleteGoal, restoreGoal, updateGoal,
  type SavingsTxn, type SavingsFrequency, type Priority,
} from '../db/queries/savings';
import { useToast } from '../components/system/Toast';
import { useDataRefresh } from '../components/system/DataRefreshProvider';
import { useScreenData } from './useScreenData';

/**
 * State, data and write-handlers for the savings-goal detail screen.
 * Extracted from `app/savings/[id].tsx` (557 lines, 12 useState) so the screen
 * is composition + render. Mirrors the useItemizedForm / useAddTxnForm pattern.
 */
export function useSavingsGoalScreen(id: string) {
  const db = useSQLiteContext();
  const router = useRouter();
  const { showUndo } = useToast();
  const { refresh } = useDataRefresh();

  const [showAdd, setShowAdd] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustName, setAdjustName] = useState('');
  const [adjustTarget, setAdjustTarget] = useState('');
  const [adjustAlloc, setAdjustAlloc] = useState('');
  const [adjustFreq, setAdjustFreq] = useState<SavingsFrequency>('monthly');
  const [adjustDate, setAdjustDate] = useState<number | null>(null);
  const [adjustPriority, setAdjustPriority] = useState<Priority>('need');
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [amt, setAmt] = useState('');
  /**
   * Which bucket a withdrawal returns to, and which one funding comes out of.
   * Null means unattributed — the honest answer for a goal funded before buckets
   * existed, and the only case where the goal's own total is the right cap.
   */
  const [withdrawTo, setWithdrawTo] = useState<AssetBucket | null>(null);
  const [fundFrom, setFundFrom] = useState<AssetBucket>('bank');
  /** What this goal holds, per bucket — what bounds a withdrawal. */
  const [heldByAsset, setHeldByAsset] = useState<Record<string, number>>({});
  const [showLockExplainer, setShowLockExplainer] = useState(false);

  const { data, loading, error, refreshing, onRefresh, reload } = useScreenData(async (loadDb) => {
    const [g, savedMap, money, hist, histTotal] = await Promise.all([
      getGoalById(loadDb, id), getGoalSavedMap(loadDb), getTotalMoney(loadDb), getGoalHistory(loadDb, id),
      getGoalHistoryCount(loadDb, id),
    ]);
    return {
      goal: g,
      saved: savedMap[id] ?? 0,
      cashAvailable: money.cashAvailable,
      history: hist,
      historyTotal: histTotal,
    };
  }, [id]);

  const goal = data?.goal ?? null;
  const saved = data?.saved ?? 0;
  const cashAvailable = data?.cashAvailable ?? 0;
  const history: SavingsTxn[] = data?.history ?? [];
  const historyTotal = data?.historyTotal ?? 0;

  // Guard: bail back out if we somehow landed here without an id.
  useEffect(() => { if (!id) router.back(); }, [id]);

  async function handleAdd() {
    const a = parseToPaise(amt);
    if (a <= 0) return;
    try {
      // Fund the goal directly from Cash available.
      const justCompleted = goal !== null && saved < goal.target && saved + a >= goal.target;
      await fundGoal(db, id, a, 'manual', undefined, fundFrom);
      haptic.success();
      setAmt(''); setShowAdd(false);
      await reload();
      if (justCompleted) setCelebrate(true);
    } catch {
      haptic.error();
      Alert.alert('Something went wrong', 'Please try again.');
    }
  }

  // Refreshed as the sheet opens rather than held in the loader: it is only needed
  // here, and it must reflect a fund that happened moments ago.
  useEffect(() => {
    if (!showWithdraw) return;
    let alive = true;
    fundedByAsset(db, id).then((h: Record<string, number>) => {
      if (!alive) return;
      setHeldByAsset(h);
      // Default to the bucket holding the most — the one a withdrawal is most
      // likely meant for, and never a bucket that holds nothing.
      const best = Object.entries(h).sort((a, b) => b[1] - a[1])[0]?.[0];
      setWithdrawTo(best && best !== 'unknown' ? (best as AssetBucket) : null);
    }).catch(() => {});
    return () => { alive = false; };
  }, [showWithdraw, db, id]);

  async function handleWithdraw() {
    const a = parseToPaise(amt);
    if (a <= 0) return;
    try {
      /*
       * Bounded by the bucket, not by the goal's total.
       *
       * A goal funded ₹3,000 from bank and ₹2,000 from wallet holds ₹5,000, but
       * the bank may only take back ₹3,000 — taking more would hand the user money
       * the bank never gave, and every balance downstream would be wrong.
       * `fundedByAsset` is the only thing that knows this; the goal's own saved
       * total does not.
       */
      const held = await fundedByAsset(db, id);
      const cap = withdrawTo ? (held[withdrawTo] ?? 0) : saved;
      if (withdrawTo && a > cap) {
        haptic.error();
        Alert.alert(
          'More than that bucket holds',
          `This goal only holds ${formatCompact(cap)} that came from ${withdrawTo}. `
          + 'Withdraw that much, or pick where the rest should go.',
        );
        return;
      }
      await withdrawFromGoal(db, id, Math.min(a, cap), undefined, withdrawTo);
      haptic.warning();
      setAmt(''); setShowWithdraw(false);
      await reload();
    } catch {
      haptic.error();
      Alert.alert('Something went wrong', 'Please try again.');
    }
  }

  function openAdjust() {
    if (!goal) return;
    setAdjustName(goal.name);
    setAdjustTarget(paiseToInput(goal.target));
    // No `> 0 ?` guard needed — `paiseToInput` already returns '' for zero, which
    // is the whole reason it exists (an untouched field shows its placeholder).
    setAdjustAlloc(paiseToInput(goal.allocation));
    setAdjustFreq(goal.frequency ?? 'monthly');
    setAdjustDate(goal.target_date ?? null);
    setAdjustPriority(goal.priority);
    setShowAdjust(true);
  }

  async function handleAdjust() {
    if (!goal || adjustSaving) return;
    const newTarget = parseToPaise(adjustTarget);
    if (!adjustName.trim() || newTarget <= 0) return;

    /*
     * Priority is not a label — it decides whether an overspend may raid this goal
     * (`planOverspendRaid` filters `emergency` out entirely and takes `want` before
     * `need`). Changing it silently meant a goal could stop being protected, or
     * start being the first one drained, with nothing said.
     *
     * Only a real change is gated; re-tapping the current tag saves as before.
     */
    if (adjustPriority !== goal.priority) {
      const consequence = adjustPriority === 'emergency'
        ? 'Emergency goals are never dipped into to cover an overspend.'
        : adjustPriority === 'want'
          ? 'Want goals are the first ones an overspend dips into.'
          : 'Need goals are dipped into only after every Want goal is used up.';
      const ok = await confirmAsync(
        `Move “${goal.name}” to ${PRIORITY_LABEL[adjustPriority]}?`,
        consequence,
        'Move',
      );
      if (!ok) return;
    }

    setAdjustSaving(true);
    try {
      await updateGoal(db, id, {
        name: adjustName.trim(),
        target: newTarget,
        priority: adjustPriority,
        category: goal.category,
        icon: goal.icon,
        color: goal.color,
        allocation: adjustAlloc.trim() ? parseToPaise(adjustAlloc) : 0,
        frequency: adjustFreq,
        locked: goal.locked === 1,
        target_date: adjustDate,
      });
      haptic.success();
      setShowAdjust(false);
      await reload();
    } catch {
      haptic.error();
      Alert.alert('Something went wrong', 'Could not save changes.');
    } finally {
      setAdjustSaving(false);
    }
  }

  async function commitToggleLock() {
    await setGoalLocked(db, id, goal!.locked !== 1);
    haptic.selection();
    await reload();
  }

  async function toggleLock() {
    // Only gate the transition INTO protected — unprotecting needs no explainer.
    if (goal!.locked !== 1 && !(await settings.lockExplainerSeen())) {
      setShowLockExplainer(true);
      return;
    }
    await commitToggleLock();
  }

  async function confirmLockExplainer() {
    await settings.setLockExplainerSeen(true);
    setShowLockExplainer(false);
    await commitToggleLock();
  }

  function confirmDelete() {
    Alert.alert('Delete goal?', `“${goal!.name}” will be removed and its ${formatRupees(saved)} returns to your Cash available.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          // Capture the goal + its ledger so the delete can be undone.
          const snapshot = goal!;
          // null = no limit: undo must restore every row, not just the page.
          const ledger = await getGoalHistory(db, id, null);
          await deleteGoal(db, id);
          haptic.warning();
          router.back();
          showUndo({
            message: `Deleted “${snapshot.name}”`,
            onUndo: async () => { try { await restoreGoal(db, snapshot, ledger); refresh(); } catch { /* ignore */ } },
          });
        },
      },
    ]);
  }

  return {
    // data
    goal, saved, cashAvailable, history, historyTotal,
    loading, error, refreshing, onRefresh, reload,
    // add / withdraw sheets
    showAdd, setShowAdd, showWithdraw, setShowWithdraw, amt, setAmt,
    withdrawTo, setWithdrawTo, fundFrom, setFundFrom, heldByAsset,
    handleAdd, handleWithdraw,
    // adjust sheet
    showAdjust, setShowAdjust, adjustName, setAdjustName,
    adjustTarget, setAdjustTarget, adjustAlloc, setAdjustAlloc,
    adjustFreq, setAdjustFreq, adjustDate, setAdjustDate,
    adjustPriority, setAdjustPriority, adjustSaving,
    openAdjust, handleAdjust,
    // misc
    celebrate, setCelebrate, toggleLock, confirmDelete,
    showLockExplainer, setShowLockExplainer, confirmLockExplainer,
  };
}
