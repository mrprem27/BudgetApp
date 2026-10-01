import React, { useRef, useState } from 'react';
import { useScreenData } from '../../../hooks/useScreenData';
import { loadBudgetView } from '../../../lib/budgetViewData';
import { formatCompact } from '../../../lib/money';
import type { BudgetView, CategoryBudgetStatus, Period } from '../../../lib/budget';
import { BudgetList } from './BudgetList';
import { ErrorState } from '../../ui/ErrorState';

type Props = {
  /** One group's budget, or `null` for My Budget (your share across every group). */
  groupId: string | null;
  /** The sentence behind the ⓘ, for the period on show. */
  caption: (allocated: string, period: Period) => string;
  onEdit: () => void;
  /** Shown when there is no budget at all. */
  empty: React.ReactNode;
  /** Extra content under one row; told the period, because a re-plan is a monthly idea. */
  rowExtra?: (row: CategoryBudgetStatus, period: Period) => React.ReactNode;
  bottomPad: number;
};

/**
 * A Budget tab: the Daily / Monthly / Yearly switch, and the budget read at the one chosen
 * (`U-89`). Personal's and every group's. It loads its own figures, keyed on the period, so a
 * tap on the switch re-reads the budget and nothing else on the screen; a period already seen
 * shows at once while its fresh copy loads.
 */
export function BudgetPeriodView({ groupId, caption, onEdit, empty, rowExtra, bottomPad }: Props) {
  const [period, setPeriod] = useState<Period>('monthly');
  const { data, error, refreshing, onRefresh, reload } = useScreenData(
    (db) => loadBudgetView(db, groupId, period), [groupId, period],
  );
  const seen = useRef<Partial<Record<Period, BudgetView>>>({});
  if (data) seen.current[data.target] = data;
  const view = data?.target === period ? data : seen.current[period] ?? null;

  if (error) return <ErrorState onRetry={reload} />;
  // First load of a period not seen yet: keep the screen still rather than flash "no budget".
  if (!view) return null;

  return (
    <BudgetList
      rows={view.rows}
      spent={view.spent}
      allocated={view.allocated}
      pct={view.pct}
      pooledAllocated={view.pooled}
      pooledCount={view.pooledCount}
      invested={view.invested}
      caption={caption(formatCompact(view.allocated), period)}
      period={period}
      onPeriod={setPeriod}
      onEdit={onEdit}
      empty={empty}
      rowExtra={rowExtra ? (row) => rowExtra(row, period) : undefined}
      refreshing={refreshing}
      onRefresh={onRefresh}
      bottomPad={bottomPad}
    />
  );
}
