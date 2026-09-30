import { View, StyleSheet } from 'react-native';
import { colors } from '../../tokens';
import { SumLine } from '../../ui/SumLine';
import { formatCompact } from '../../../lib/money';
import { moneySumLines, type MoneyPlace, type MoneySumLine } from '../../../lib/moneySum';

/** One colour per place money sits, the same in Money's bar and on each line's dot. */
export const MONEY_TONE = { bank: colors.accent, cash: colors.income, wallet: colors.settle, assets: colors.healthAmber } as const;

const LABEL: Record<MoneySumLine['key'], string> = {
  bank: 'Bank', cash: 'Cash', wallet: 'Wallet', unattributed: 'Paid from not set', goals: 'In goals',
  spendable: 'Spendable', invested: 'Invested', card: 'Card owed', networth: 'Net worth',
};

/**
 * How your money adds up (`moneySumLines`), drawn once for Money's card and for the editor behind
 * it (`U-47`), so the two always show the same arithmetic. Invested opens the asset register; a
 * place or the card opens the accounts behind it (`U-68`).
 */
export function MoneySum({ places, unattributed, inGoals, investments, creditUsed, assetCount, creditLeft, onManageAssets, onManageAccounts, onSetUnattributed }: {
  places: Record<MoneyPlace, number>;
  unattributed?: number;
  inGoals?: number;
  investments: number;
  creditUsed: number;
  assetCount?: number;
  /** Unused limit, shown as a hint on Card owed; never counted. */
  creditLeft?: number;
  onManageAssets?: () => void;
  onManageAccounts?: () => void;
  /** Opens "where did this go through?" for the unattributed line (`U-62`). */
  onSetUnattributed?: () => void;
}) {
  const { lines } = moneySumLines({ places, unattributed, inGoals, investments, creditUsed });
  return (
    <View style={styles.sum}>
      {lines.map(l => {
        const dot = l.key === 'bank' || l.key === 'cash' || l.key === 'wallet' ? MONEY_TONE[l.key]
          : l.key === 'invested' ? MONEY_TONE.assets
          : l.key === 'card' || l.key === 'goals' ? colors.expense
          : undefined;
        return (
          <SumLine
            key={l.key}
            op={l.op}
            dot={dot}
            label={LABEL[l.key]}
            value={l.value}
            total={l.total}
            color={l.key === 'card' ? colors.expense : undefined}
            onPress={l.key === 'invested' ? onManageAssets : l.key === 'unattributed' ? onSetUnattributed
              : l.key === 'bank' || l.key === 'cash' || l.key === 'wallet' || l.key === 'card' ? onManageAccounts : undefined}
            hint={l.key === 'invested' && assetCount ? `${assetCount} ${assetCount === 1 ? 'asset' : 'assets'}`
              : l.key === 'card' && creditLeft ? `${formatCompact(creditLeft)} left to borrow`
              : l.key === 'goals' ? 'Set aside, not spendable'
              // Entries with no Paid from: counted in the total, never guessed into a place (`U-57`).
              : l.key === 'unattributed' ? (onSetUnattributed ? 'Tap to say where it went' : 'Entries with no Paid from')
              : undefined}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sum: { gap: 6 },
});
