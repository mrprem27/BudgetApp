import { Text, StyleSheet } from 'react-native';
import { colors, type, space } from '../../tokens';
import { SheetModal } from '../../ui/SheetModal';
import { PayMethodSelector } from '../PayMethodSelector';
import { formatCompact } from '../../../lib/money';
import { INCOME_LANDING, type PayMethod } from '../../../constants/enums';

/**
 * "Paid from not set" — where did it go through? (`U-62`)
 *
 * The line counts entries that never recorded a Paid from. Rather than inventing a balancing
 * figure, this sets the place on those entries themselves, so the amount lands where it really
 * went and every later total agrees. One question, one pick: a sheet (AGENTS §9).
 *
 * Only Bank, Cash and Wallet: a credit card is debt, not a place money sits, so it cannot hold
 * this amount.
 */
export function UnsetSourceSheet({ count, amount, onPick, onClose }: {
  /** Entries with no Paid from; `null` while closed. */
  count: number | null;
  amount: number;
  onPick: (m: PayMethod) => void;
  onClose: () => void;
}) {
  const n = count ?? 0;
  return (
    <SheetModal visible={count !== null} onClose={onClose} title="Where did it go through?">
      <Text style={styles.lead}>
        {n === 0
          ? 'Nothing of yours is missing a Paid from.'
          : `${formatCompact(amount)} across ${n} ${n === 1 ? 'entry' : 'entries'} with no Paid from. Pick where it went and they all take it.`}
      </Text>
      {n > 0 && <PayMethodSelector value="" onChange={onPick} options={INCOME_LANDING} />}
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  lead: { ...type.caption, color: colors.textSecondary, marginBottom: space.md },
});
