import { useMemo } from 'react';
import { StyleSheet, ScrollView } from 'react-native';
import { space, layout } from '../../tokens';
import { useContentInset } from '../../../hooks/useContentInset';
import { EmptyState } from '../../ui/EmptyState';
import { AppRefreshControl } from '../../ui/AppRefreshControl';
import { RecurringInventory } from '../recurring/RecurringInventory';
import { StoppedRecurring } from '../recurring/StoppedRecurring';
import { toRecurringSubs } from '../../../lib/recurringData';
import type { TxnWithSplits } from '../../../db/queries/transactions';

type Props = {
  refreshing: boolean;
  onRefresh: () => void;
  /** Every rule in this group, stopped ones included — this tab splits them. */
  rules: TxnWithSplits[];
  /** Skipped occurrence dates per rule — keeps "next charge" honest. */
  skips?: Map<string, Set<number>>;
  meId: string;
  /** The empty state's way in. The screen's + already adds one everywhere else. */
  onAdd: () => void;
  onOpenRule: (ruleId: string) => void;
};

/**
 * A group's (or Personal's) Recurring tab: the same inventory Money's Recurring screen shows,
 * scoped to this group's rules (`U-38`).
 *
 * No "Add recurring" button under the list (`U-54`): the screen's + is the way to add anything,
 * with Repeat one tap away on the form, and a second button for one kind of entry was a second
 * way to do the same thing. The empty state keeps its button — an empty screen needs a way out
 * (AGENTS §2).
 *
 * Stopped rules sit behind one row at the end, like archived groups: out of the way of what is
 * still charging, but one tap from being found (`U-54`).
 */
export function RecurringTab({ rules, skips, meId, onAdd, onOpenRule, refreshing, onRefresh }: Props) {
  const bottomPad = useContentInset({ fab: true });
  const now = Date.now();
  const subs = useMemo(
    () => toRecurringSubs(rules.filter(r => r.recur_state !== 'ended'), skips, meId, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rules, skips, meId],
  );
  const stopped = useMemo(
    () => toRecurringSubs(rules.filter(r => r.recur_state === 'ended'), skips, meId, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rules, skips, meId],
  );
  return (
    <ScrollView
      contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]}
      refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {subs.length === 0 ? (
        <EmptyState
          icon="repeat"
          title="No recurring yet"
          body="Rent, Wi-Fi, memberships, anything you set to repeat shows up here with its monthly cost and your share."
          actionLabel="Add recurring expense"
          onAction={onAdd}
        />
      ) : (
        <RecurringInventory subs={subs} onOpen={onOpenRule} />
      )}

      <StoppedRecurring stopped={stopped} onOpen={onOpenRule} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: layout.screenPaddingH, paddingTop: space.xs },
});
