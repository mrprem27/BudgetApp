import { View, StyleSheet } from 'react-native';
import { colors } from '../../tokens';
import { useContentInset } from '../../../hooks/useContentInset';
import type { CategoryBudgetStatus } from '../../../lib/budget';
import { Chip } from '../../ui/Chip';
import { EmptyState } from '../../ui/EmptyState';
import { BudgetPeriodView } from '../budget/BudgetPeriodView';
import { budgetCaption, budgetEmptyBody, budgetEmptyCta } from '../../../lib/budgetCopy';
import { planRebalance } from '../../../lib/rebalance';

type Props = {
  groupId: string;
  /** This month's lines, for the re-plan check only; the tab reads its own figures per period. */
  catStatus: CategoryBudgetStatus[];
  /**
   * Open this group's budget editor.
   *
   * **One** prop, because there was only ever one destination: `onEditBudget` and
   * `onCreateBudget` both pushed `/group/{id}/budget`, and the group screen passed
   * the identical arrow to each. Two names for one route is how the third label
   * appears.
   */
  onOpenBudget: () => void;
  /** Open the re-plan sheet for an over-budget category (`V2-07`). */
  onRebalance?: (category: string) => void;
  /** Whether I may edit the line every member inherits — changes what the copy claims. */
  canEditGroupDefault?: boolean;
  /** How many categories I have my own amount for. */
  overrideCount?: number;
  groupName: string;
};

/**
 * Group Budget tab: the shared `BudgetList`, with this group's data and this
 * group's empty state.
 *
 * Everything structural moved to `BudgetList` so Personal's Budget tab is the same
 * screen with different numbers. What stays here is what is genuinely per-group:
 * the role-dependent empty copy, and the re-plan chip an admin gets on an
 * overspent row.
 */
export function BudgetTab({
  groupId, catStatus, onOpenBudget, onRebalance,
  canEditGroupDefault = false, overrideCount = 0, groupName,
}: Props) {
  const bottomPad = useContentInset({ fab: true });

  return (
    <BudgetPeriodView
      groupId={groupId}
      caption={(allocated, period) => budgetCaption({ scope: 'group', allocated, overrideCount, period })}
      onEdit={onOpenBudget}
      bottomPad={bottomPad}
      empty={
        <EmptyState
          icon="target"
          title="No budget yet"
          body={budgetEmptyBody(canEditGroupDefault, groupName)}
          actionLabel={budgetEmptyCta(canEditGroupDefault)}
          onAction={onOpenBudget}
        />
      }
      rowExtra={(c, period) => (
        /*
         * V2-07: a red bar used to be the whole response to an overrun.
         *
         * Only offered when a re-plan is actually possible — and only to an admin,
         * because it writes the group's DEFAULT, which `setCategoryBudgets` refuses
         * from anyone else. Ungated, a member's tap produced an unhandled rejection
         * and silence.
         *
         * A `Chip`, not a fourth hand-rolled pill weight on one screen (§9).
         */
        // A re-plan moves this MONTH's headroom, so it is offered on the monthly view only.
        period === 'monthly' && c.remaining < 0 && canEditGroupDefault && onRebalance && planRebalance(catStatus, c.category)
          ? (
            // `alignSelf` on a wrapper: the row is a column, so a bare chip would
            // stretch to full width and stop reading as a pill.
            <View style={styles.replan}>
              <Chip
                label="Re-plan the rest of this month"
                icon="shuffle"
                accent={colors.accent}
                onPress={() => onRebalance(c.category)}
                accessibilityLabel={`Re-plan ${c.category} for the rest of this month`}
              />
            </View>
          )
          : null
      )}
    />
  );
}

const styles = StyleSheet.create({
  replan: { alignSelf: 'flex-start' },
});
