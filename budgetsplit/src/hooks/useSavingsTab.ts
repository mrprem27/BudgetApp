import { useCallback, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { getDate, getDaysInMonth, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { parseToPaise } from '../lib/money';
import { haptic } from '../lib/haptics';
import { GOAL_ICONS, GOAL_COLORS } from '../constants/palette';
import {
  getGoals, getGoalSavedMap, getTotalMoney, insertGoal, fundGoal, reorderGoals,
  runSavingsMaintenance, undoOverspendRaid,
  type Priority, type SavingsFrequency, type OverspendRaid,
} from '../db/queries/savings';
import { getMoneyProfile, setMoneyProfile } from '../db/queries/moneyProfile';
import type { MoneyProfile } from '../lib/cash';
import { getAllGroups } from '../db/queries/groups';
import { getMe } from '../db/queries/persons';
import { getTransactionsInRange } from '../db/queries/transactions';
import { getRecurringForGroup } from '../db/queries/recurring';
import { getBudgetAnalytics } from '../lib/analytics';
import { forecastMonthEnd as computeForecastMonthEnd } from '../lib/forecast';
import { buildUpcoming, type UpcomingItem } from '../lib/upcoming';
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

  const [showMoneyEditor, setShowMoneyEditor] = useState(false);
  const [fundGoalId, setFundGoalId] = useState<string | null>(null);
  const [fundAmt, setFundAmt] = useState('');

  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [icon, setIcon] = useState(GOAL_ICONS[0]);
  const [color, setColor] = useState(GOAL_COLORS[0]);
  const [allocation, setAllocation] = useState('');
  const [frequency, setFrequency] = useState<SavingsFrequency>('none');
  const [newDate, setNewDate] = useState<number | null>(null);

  // Pure reads — refetch on focus + cross-screen write. The maintenance MUTATION
  // (scheduled funding + overspend raid) is deliberately kept OUT of this loader so
  // it can't re-run/raid on every refetch; it lives in its own focus effect below.
  const { data, loading, error, refreshing, onRefresh, reload } = useScreenData(async (db) => {
    const [g, s, tm, mp] = await Promise.all([getGoals(db), getGoalSavedMap(db), getTotalMoney(db), getMoneyProfile(db)]);
    const grps = await getAllGroups(db);

    // Current month's category spend — feeds the month-end forecast + what-if simulator.
    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const monthTxns = await getTransactionsInRange(db, null, monthStart.getTime(), Date.now());
    const catMap: Record<string, number> = {};
    for (const t of monthTxns) {
      if (t.kind === 'expense') {
        const amt = t.shares.reduce((sum: number, sh: { amount: number }) => sum + sh.amount, 0);
        catMap[t.category] = (catMap[t.category] ?? 0) + amt;
      }
    }
    // Month-end spend forecast — same credibility-weighted model as Reports
    // (lib/forecast), blended with last month's actual. Hidden until day 3.
    const today2 = new Date();
    const dayOfMonth = getDate(today2);
    const daysInMonth = getDaysInMonth(today2);
    const totalMonthSpend = Object.values(catMap).reduce((sum, v) => sum + v, 0);
    const prevTxns = await getTransactionsInRange(db, null, startOfMonth(subMonths(today2, 1)).getTime(), endOfMonth(subMonths(today2, 1)).getTime());
    let priorMonthTotal = 0;
    for (const t of prevTxns) {
      if (t.kind === 'expense') priorMonthTotal += t.shares.reduce((sum: number, sh: { amount: number }) => sum + sh.amount, 0);
    }
    const f = computeForecastMonthEnd(totalMonthSpend, dayOfMonth, daysInMonth, priorMonthTotal);
    const forecastMonthEnd = f.ready ? f.projected : null;

    // Budget total across all groups for the forecast over/under line.
    const analyticsAll = await Promise.all(grps.map(g => getBudgetAnalytics(db, g)));
    let bTotal = 0;
    for (const a of analyticsAll) bTotal += a.totalAllocated;

    // Upcoming recurring bills across all groups (design Screen 3).
    let upcoming: UpcomingItem[] = [];
    const me2 = await getMe(db);
    if (me2) {
      const recurringByGroup = await Promise.all(grps.map(g => getRecurringForGroup(db, g.id)));
      upcoming = buildUpcoming(recurringByGroup.flat(), me2.id, Date.now(), 5);
    }

    return { goals: g, saved: s, money: tm, profile: mp, forecastMonthEnd, forecastBudget: bTotal, upcoming };
  }, []);

  const goals = data?.goals ?? [];
  const saved = data?.saved ?? {};
  const money = data?.money ?? null;
  const profile = data?.profile ?? { openingCash: 0, investments: 0, creditLimit: 0, creditUsed: 0 };
  const forecastMonthEnd = data?.forecastMonthEnd ?? null;
  const forecastBudget = data?.forecastBudget ?? 0;
  const upcoming = data?.upcoming ?? [];

  // Scheduled goal funding + overspend auto-raid — a MUTATION, so it runs on focus
  // only (never inside the loader, which refetches on every focus/data-change).
  // After a raid we reload() so the reads reflect the post-maintenance state.
  useFocusEffect(useCallback(() => {
    (async () => {
      const raid = await runSavingsMaintenance(db);
      if (raid.total > 0) setOverspend(raid);
      reload();
    })();
  }, [db, reload]));

  async function handleSaveMoney(p: MoneyProfile) {
    await setMoneyProfile(db, p);
    haptic.success();
    setShowMoneyEditor(false);
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

  async function handleUndoOverspend() {
    if (!overspend) return;
    await undoOverspendRaid(db, overspend.withdrawals);
    haptic.success();
    setOverspend(null);
    await reload();
    refresh();
  }

  function resetNew() {
    setName(''); setTarget(''); setPriority('medium'); setIcon(GOAL_ICONS[0]);
    setColor(GOAL_COLORS[0]); setAllocation(''); setFrequency('none'); setNewDate(null);
  }

  // Persist a drag reorder → new funding priority, then reload to reflect it.
  async function handleReorder(ids: string[]) {
    await reorderGoals(db, ids);
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
    // data
    goals, saved, money, profile, forecastMonthEnd, forecastBudget, upcoming,
    loading, error, refreshing, onRefresh, reload,
    // overspend raid
    overspend, setOverspend, handleUndoOverspend,
    // money editor
    showMoneyEditor, setShowMoneyEditor, handleSaveMoney,
    // fund a goal
    fundGoalId, setFundGoalId, fundGoalObj, fundAmt, setFundAmt, handleFundGoal,
    // new-goal form
    showNew, setShowNew, name, setName, target, setTarget,
    priority, setPriority, icon, setIcon, color, setColor,
    allocation, setAllocation, frequency, setFrequency, newDate, setNewDate,
    resetNew, handleCreate, handleReorder,
  };
}
