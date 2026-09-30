import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { space, layout } from '../../tokens';
import { useContentInset } from '../../../hooks/useContentInset';
import { AppRefreshControl } from '../../ui/AppRefreshControl';
import { KeyboardForm } from '../../ui/KeyboardForm';
import { RecurringBrowser, NoRecurring } from '../recurring/RecurringBrowser';
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
 * Search, sort and the Stopped view come from `RecurringBrowser`, shared with Money's screen.
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
    // `KeyboardForm`: the list has a search box above its results (AGENTS §6b).
    <KeyboardForm
      contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]}
      refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <RecurringBrowser active={subs} stopped={stopped} onOpen={onOpenRule} empty={<NoRecurring onAdd={onAdd} />} />
    </KeyboardForm>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: layout.screenPaddingH, paddingTop: space.xs },
});
