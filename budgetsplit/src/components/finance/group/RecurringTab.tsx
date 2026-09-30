import { useMemo } from 'react';
import { StyleSheet, ScrollView } from 'react-native';
import { space, layout } from '../../tokens';
import { useContentInset } from '../../../hooks/useContentInset';
import { EmptyState } from '../../ui/EmptyState';
import { SecondaryButton } from '../../ui/SecondaryButton';
import { AppRefreshControl } from '../../ui/AppRefreshControl';
import { RecurringInventory } from '../recurring/RecurringInventory';
import { toRecurringSubs } from '../../../lib/recurringData';
import type { TxnWithSplits } from '../../../db/queries/transactions';

type Props = {
  refreshing: boolean;
  onRefresh: () => void;
  rules: TxnWithSplits[];
  /** Skipped occurrence dates per rule — keeps "next charge" honest. */
  skips?: Map<string, Set<number>>;
  meId: string;
  onAdd: () => void;
  onOpenRule: (ruleId: string) => void;
};

/**
 * A group's (or Personal's) Recurring tab: the same inventory Money's Recurring screen shows,
 * scoped to this group's rules, and a way to add one (`U-38`).
 */
export function RecurringTab({ rules, skips, meId, onAdd, onOpenRule, refreshing, onRefresh }: Props) {
  const bottomPad = useContentInset({ fab: true });
  const subs = useMemo(
    () => toRecurringSubs(rules.filter(r => r.recur_state !== 'ended'), skips, meId, Date.now()),
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
        <>
          <RecurringInventory subs={subs} onOpen={onOpenRule} />
          <SecondaryButton label="Add recurring expense" onPress={onAdd} style={styles.add} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: layout.screenPaddingH, paddingTop: space.xs },
  add: { marginTop: space.md },
});
