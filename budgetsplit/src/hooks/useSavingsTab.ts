import { useCallback, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { parseToPaise } from '../lib/money';
import { haptic } from '../lib/haptics';
import { settings } from '../lib/settings';
import { GOAL_ICONS, GOAL_COLORS } from '../constants/palette';
import {
  insertGoal, fundGoal, reorderGoals,
  runSavingsMaintenance, undoOverspendRaid, applyOverspendRaid,
  type Priority, type SavingsFrequency, type OverspendRaid,
} from '../db/queries/savings';
import { setMoneyProfile } from '../db/queries/moneyProfile';
import type { MoneyProfileWrite } from '../db/queries/moneyProfile';
import { moveToInvestments, payCardBill } from '../db/queries/spendPower';
import type { PayMethod } from '../constants/enums';
import { loadSavingsTabData } from '../lib/savingsTabData';
import { getPendingOverspendNotice, setPendingOverspendNotice } from '../lib/overspendNotice';
import type { MoneyProfile } from '../lib/cash';
import { useDataRefresh } from '../components/system/DataRefreshProvider';
import { useScreenData } from './useScreenData';

/**
 * State, reads and write-handlers for the Savings tab.
 * Extracted from `app/(tabs)/savings.tsx` (14 useState + a 65-line loader) so
 * the screen is composition + render.
 *
 * Note the deliberate split: the loader is pure reads, while the scheduled
 * funding / overspend-raid MUTATION runs in its own focus effect so it can't
 * re-raid on every refetch.
 */
export function useSavingsTab() {
  const db = useSQLiteContext();
  const { refresh } = useDataRefresh();

  const [overspend, setOverspend] = useState<OverspendRaid | null>(null);
  // A raid the user approved this session — drives the confirmation + Undo.
  const [applied, setApplied] = useState<OverspendRaid | null>(null);

  const [showMoneyEditor, setShowMoneyEditor] = useState(false);
  const [showPayCardBill, setShowPayCardBill] = useState(false);
  const [showMoveInvest, setShowMoveInvest] = useState(false);
  const [fundGoalId, setFundGoalId] = useState<string | null>(null);
  const [fundAmt, setFundAmt] = useState('');

  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [priority, setPriority] = useState<Priority>('need');
  const [icon, setIcon] = useState(GOAL_ICONS[0]);
  const [color, setColor] = useState(GOAL_COLORS[0]);
  const [allocation, setAllocation] = useState('');
  const [frequency, setFrequency] = useState<SavingsFrequency>('none');
  const [newDate, setNewDate] = useState<number | null>(null);
  /** The one-time "hold and drag" line. Retired by the first successful drag. */
  const [showReorderHint, setShowReorderHint] = useState(false);
  useEffect(() => { settings.goalReorderHintSeen().then(seen => setShowReorderHint(!seen)).catch(() => {}); }, []);

  // Pure reads — refetch on focus + cross-screen write. The maintenance MUTATION
  // (scheduled funding + overspend raid) is deliberately kept OUT of this loader so
  // it can't re-run/raid on every refetch; it lives in its own focus effect below.
  const { data, loading, error, refreshing, onRefresh, reload } = useScreenData(
    (db) => loadSavingsTabData(db), []);

  const goals = data?.goals ?? [];
  const saved = data?.saved ?? {};
  const money = data?.money ?? null;
  const byBucket = data?.byBucket;
  const unattributed = data?.unattributed ?? 0;
  const profile = data?.profile ?? { openingCash: 0, openingBank: 0, openingWallet: 0, investments: 0, creditLimit: 0, creditUsed: 0, updatedAt: null };
  const assets = data?.assets ?? [];
  const forecastMonthEnd = data?.forecastMonthEnd ?? null;
  const forecastBudget = data?.forecastBudget ?? 0;
  const upcoming = data?.upcoming ?? [];

  // Scheduled goal funding + overspend auto-raid — a MUTATION, so it runs on focus
  // only (never inside the loader, which refetches on every focus/data-change).
  // After a raid we reload() so the reads reflect the post-maintenance state.
  //
  // A raid can also happen OUTSIDE this screen (app boot / foreground, in
  // app/_layout.tsx) — by the time the user reaches this tab, cash is already
  // fixed up and this focus's own maintenance call finds nothing left to raid,
  // so that earlier result would otherwise never be shown. Surface any pending
  // notice first, then still run maintenance live for a raid that happens while
  // the tab is actually open.
  useFocusEffect(useCallback(() => {
    (async () => {
      // `pending` is now a *proposal* the user hasn't answered yet, not a completed
      // raid (`V2-10`). Re-proposing on every focus keeps it truthful: if cash
      // recovered in the meantime, the prompt disappears instead of asking to cover
      // a deficit that no longer exists.
      const raid = await runSavingsMaintenance(db);
      if (raid.total > 0) {
        setOverspend(raid);
        await setPendingOverspendNotice(raid);
      } else {
        setOverspend(null);
        if (await getPendingOverspendNotice()) await setPendingOverspendNotice(null);
      }
      reload();
    })();
  }, [db, reload]));

  async function handleSaveMoney(p: MoneyProfileWrite) {
    await setMoneyProfile(db, p);
    haptic.success();
    setShowMoneyEditor(false);
    await reload();
    refresh();
  }

  async function handlePayCardBill(amountPaise: number) {
    await payCardBill(db, amountPaise);
    haptic.success();
    setShowPayCardBill(false);
    await reload();
    refresh();
  }

  async function handleMoveToInvestments(amountPaise: number, from: PayMethod) {
    await moveToInvestments(db, amountPaise, from);
    haptic.success();
    setShowMoveInvest(false);
    await reload();
    refresh();
  }

  const fundGoalObj = goals.find(g => g.id === fundGoalId) ?? null;

  async function handleFundGoal() {
    const amt = parseToPaise(fundAmt);
    if (!fundGoalId || amt <= 0) return;
    await fundGoal(db, fundGoalId, amt);
    haptic.success();
    setFundAmt('');
    setFundGoalId(null);
    await reload();
    refresh();
  }

  /** The user agreed: move the money exactly as proposed. */
  async function handleApproveOverspend() {
    if (!overspend) return;
    const done = await applyOverspendRaid(db, overspend.withdrawals);
    haptic.success();
    setApplied(done);
    setOverspend(null);
    await setPendingOverspendNotice(null);
    await reload();
    refresh();
  }

  /** Undo an approved raid — still reachable, since agreeing in a hurry is a thing. */
  async function handleUndoOverspend() {
    if (!applied) return;
    await undoOverspendRaid(db, applied.withdrawals);
    haptic.success();
    setApplied(null);
    await reload();
    refresh();
  }

  /**
   * Declined. The goals keep their money and cash stays negative, which is the
   * honest picture — the overspend already happened; covering it was only ever
   * moving the shortfall somewhere less visible.
   *
   * Not persisted as "never ask again": the proposal is recomputed on focus, so it
   * returns while the deficit does. Dismiss clears this visit, not the fact.
   */
  async function handleDismissOverspend() {
    setOverspend(null);
    setApplied(null);
    await setPendingOverspendNotice(null);
  }

  function resetNew() {
    setName(''); setTarget(''); setPriority('need'); setIcon(GOAL_ICONS[0]);
    setColor(GOAL_COLORS[0]); setAllocation(''); setFrequency('none'); setNewDate(null);
  }

  // Persist a drag reorder → new funding priority, then reload to reflect it.
  async function handleReorder(ids: string[]) {
    await reorderGoals(db, ids);
    // The hint has done its job the moment a drag lands, so it retires here rather
    // than on first sight — seeing it and not acting is not the same as learning it.
    if (showReorderHint) {
      setShowReorderHint(false);
      settings.setGoalReorderHintSeen(true).catch(() => {});
    }
    await reload();
  }

  async function handleCreate() {
    const t = parseToPaise(target);
    if (!name.trim() || t <= 0) return;
    await insertGoal(db, {
      name: name.trim(), target: t, priority, icon, color, category: name.trim(),
      allocation: parseToPaise(allocation), frequency, target_date: newDate,
    });
    haptic.success();
    setShowNew(false);
    resetNew();
    await reload();
    refresh();
  }

  return {
    byBucket, unattributed,
    // data
    goals, saved, money, profile, assets, forecastMonthEnd, forecastBudget, upcoming,
    loading, error, refreshing, onRefresh, reload,
    // overspend raid
    overspend, setOverspend, applied, handleApproveOverspend, handleUndoOverspend, handleDismissOverspend,
    // money editor
    showMoneyEditor, setShowMoneyEditor, handleSaveMoney,
    showPayCardBill, setShowPayCardBill, handlePayCardBill,
    showMoveInvest, setShowMoveInvest, handleMoveToInvestments,
    // fund a goal
    fundGoalId, setFundGoalId, fundGoalObj, fundAmt, setFundAmt, handleFundGoal,
    // new-goal form
    showNew, setShowNew, name, setName, target, setTarget,
    priority, setPriority, icon, setIcon, color, setColor,
    allocation, setAllocation, frequency, setFrequency, newDate, setNewDate,
    resetNew, handleCreate, handleReorder, showReorderHint,
  };
}
