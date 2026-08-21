import { useMemo } from 'react';
import { getGroupById, getGroupContext } from '../db/queries/groups';
import { getTransactionsForGroup } from '../db/queries/transactions';
import { getRecurringForGroup, getSkipsMap } from '../db/queries/recurring';
import { getGroupMembers, getMe } from '../db/queries/persons';
import { getGroupNet } from '../db/queries/balances';
import { getCategoryBudgetStatus } from '../lib/budget';
import { getBudgetAnalytics } from '../lib/analytics';
import { getCategoryBudgetRows } from '../db/queries/categoryBudgets';
import { simplify, rawDebts } from '../lib/settle';
import {
  computeContributions, computeRecurringMonthlyTotal, computeRecurNextLabel,
  computeRecurringMyShareMonthly, primarySettleTarget, settlementSummary,
} from '../lib/groupDetail';
import { useScreenData } from './useScreenData';
import type { CategoryBudgetStatus } from '../lib/budget';
import type { BudgetAnalytics } from '../lib/analytics';
import type { TxnWithSplits } from '../db/queries/transactions';

/**
 * Everything the group hub reads and derives, in one place.
 *
 * The screen composes four tabs, an options sheet and a re-plan sheet; with the
 * loader and ten `useMemo`s inline it had grown past AGENTS' ~300-line extract
 * threshold and was doing derivation rather than composition. Splitting the two
 * also makes the memo boundary explicit: `GroupHeader` sits above the tab switch
 * *and* above the lifted search box, so its props have to be resolved values
 * (`myNet`, `settleWith`) rather than the `net` map and settlement list, which are
 * fresh objects on every load and every keystroke.
 *
 * `simplifyOn` stays in the screen: it is a persisted toggle the screen writes
 * back, not a derived value.
 */
export function useGroupDetail(id: string, simplifyOn: boolean) {
  // Pure read: group + its txns/members/balances/budget/recurring. Refetches on
  // focus and on cross-screen writes; retry = reload().
  const screen = useScreenData(async (db) => {
    const [grp, txnList, memberList, meRow] = await Promise.all([
      getGroupById(db, id),
      getTransactionsForGroup(db, id),
      getGroupMembers(db, id),
      getMe(db),
    ]);
    const netMap = await getGroupNet(db, id);

    let ctx: Awaited<ReturnType<typeof getGroupContext>> | null = null;
    let overrideCount = 0;
    let catStatus: CategoryBudgetStatus[] = [];
    let analytics: BudgetAnalytics | null = null;
    let recurringRules: TxnWithSplits[] = [];
    let recurSkips = new Map<string, Set<number>>();
    if (grp) {
      const meId = meRow?.id ?? '';
      const [cs, an, gctx, budgetRows] = await Promise.all([
        getCategoryBudgetStatus(db, grp, { meId }),
        getBudgetAnalytics(db, grp, { meId }),
        getGroupContext(db, id, meId),
        getCategoryBudgetRows(db, id),
      ]);
      ctx = gctx;
      overrideCount = budgetRows.filter(r => r.person_id === meId && r.amount > 0).length;
      catStatus = cs;
      analytics = an;
      const rules = await getRecurringForGroup(db, id);
      recurringRules = rules.filter(r => r.recur_state === 'active');
      recurSkips = await getSkipsMap(db, recurringRules.map(r => r.id));
    }
    return { group: grp, txns: txnList, members: memberList, me: meRow, net: netMap, catStatus, analytics, recurringRules, recurSkips, ctx, overrideCount };
  }, [id]);

  const { data } = screen;
  const group = data?.group ?? null;
  const txns = useMemo(() => data?.txns ?? [], [data?.txns]);
  const members = useMemo(() => data?.members ?? [], [data?.members]);
  const net = useMemo(() => data?.net ?? {}, [data?.net]);
  const recurringRules = useMemo(() => data?.recurringRules ?? [], [data?.recurringRules]);
  const catStatus = useMemo(() => data?.catStatus ?? [], [data?.catStatus]);
  const analytics = data?.analytics ?? null;
  const recurSkips = data?.recurSkips;
  const meId = data?.me?.id ?? '';

  // simplify(net) feeds both the header and the settlements list — memoize once.
  const simplifiedSettles = useMemo(() => simplify(net), [net]);
  const settlements = useMemo(() => (simplifyOn ? simplifiedSettles : rawDebts(txns)), [simplifyOn, simplifiedSettles, txns]);
  const personMap = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);
  const contributions = useMemo(() => computeContributions(txns, members, net), [txns, members, net]);
  const recurringMonthlyTotal = useMemo(() => computeRecurringMonthlyTotal(recurringRules), [recurringRules]);
  const recurringMyShare = useMemo(() => computeRecurringMyShareMonthly(recurringRules, meId), [recurringRules, meId]);
  const recurNextLabel = useMemo(() => computeRecurNextLabel(recurringRules, recurSkips), [recurringRules, recurSkips]);

  /** Only expenses, and only the shares — AGENTS §12: never one total across kinds. */
  const totalSpent = useMemo(
    () => txns.filter(t => t.kind === 'expense' && !t.is_deleted).reduce((s, t) => s + t.shares.reduce((a, x) => a + x.amount, 0), 0),
    [txns],
  );

  const myNet = net[meId] ?? 0;
  const settleWith = useMemo(
    () => primarySettleTarget(simplifiedSettles, meId, personMap, myNet),
    [simplifiedSettles, meId, personMap, myNet],
  );
  const settleSummary = useMemo(
    () => settlementSummary(settlements, net, members.map(m => m.id)),
    [settlements, net, members],
  );

  return {
    ...screen,
    group, txns, members, net, meId, catStatus, analytics, recurringRules, recurSkips,
    ctx: data?.ctx ?? null,
    overrideCount: data?.overrideCount ?? 0,
    isPersonal: group?.is_personal === 1,
    simplifiedSettles, settlements, personMap, contributions,
    recurringMonthlyTotal, recurringMyShare, recurNextLabel,
    totalSpent, myNet, settleWith, settleSummary,
  };
}
