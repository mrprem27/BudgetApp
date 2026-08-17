import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { parseToPaise, formatRupees } from '../lib/money';
import { haptic } from '../lib/haptics';
import { settings } from '../lib/settings';
import {
  getGoalById, getGoalSavedMap, getTotalMoney, getGoalHistory, getGoalHistoryCount,
  fundGoal, withdrawFromGoal, setGoalLocked, deleteGoal, restoreGoal, updateGoal,
  type SavingsTxn, type SavingsFrequency, type Priority,
} from '../db/queries/savings';
import { useUndo } from '../components/system/UndoToast';
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
  const { showUndo } = useUndo();
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
      await fundGoal(db, id, a);
      haptic.success();
      setAmt(''); setShowAdd(false);
      await reload();
      if (justCompleted) setCelebrate(true);
    } catch {
      haptic.error();
      Alert.alert('Something went wrong', 'Please try again.');
    }
  }

  async function handleWithdraw() {
    const a = parseToPaise(amt);
    if (a <= 0) return;
    try {
      await withdrawFromGoal(db, id, Math.min(a, saved));
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
    setAdjustTarget((goal.target / 100).toString());
    setAdjustAlloc(goal.allocation > 0 ? (goal.allocation / 100).toString() : '');
    setAdjustFreq(goal.frequency ?? 'monthly');
    setAdjustDate(goal.target_date ?? null);
    setAdjustPriority(goal.priority);
    setShowAdjust(true);
  }

  async function handleAdjust() {
    if (!goal || adjustSaving) return;
    const newTarget = parseToPaise(adjustTarget);
    if (!adjustName.trim() || newTarget <= 0) return;
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
