import React, { useEffect, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { SheetModal } from '../../ui/SheetModal';
import { Input } from '../../ui/Input';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { TabPills } from '../../ui/TabPills';
import { colors, type, space } from '../../tokens';
import { parseToPaise, formatCompact } from '../../../lib/money';
import { ASSET_BUCKET, PayMethod } from '../../../constants/enums';

/** Which bucket the money leaves. Mapped to the pay method the ledger records. */
const FROM_TABS = ASSET_BUCKET.map(b => ({ key: b, label: b[0].toUpperCase() + b.slice(1) }));
const AS_PAY_METHOD: Record<string, PayMethod> = {
  bank: PayMethod.Bank, cash: PayMethod.Cash, wallet: PayMethod.Wallet,
};

/**
 * Record money moved into investments.
 *
 * The mirror of `PayCardBillSheet`, deliberately — same question, same controls,
 * opposite direction. Buying an SIP used to be logged as an **expense**, which ate
 * a budget it had no business eating and dropped net worth by the amount when it
 * should have stayed flat. This writes a transfer instead: out of one bucket, into
 * the investments figure, net worth unchanged.
 */
export function MoveToInvestmentsSheet({
  visible, onClose, cashAvailable, onMove,
}: {
  visible: boolean;
  onClose: () => void;
  /** Shown as the sanity check — this is money leaving, not appearing. */
  cashAvailable: number;
  onMove: (amountPaise: number, from: PayMethod) => void;
}) {
  const [amount, setAmount] = useState('');
  const [from, setFrom] = useState<string>('bank');
  useEffect(() => { if (visible) { setAmount(''); setFrom('bank'); } }, [visible]);

  const paise = parseToPaise(amount);

  return (
    <SheetModal visible={visible} onClose={onClose} title="Moved to investments">
      <Text style={styles.hint}>
        This is money moving, not money spent — so it leaves your cash and lands in
        investments, and your net worth stays where it is.
      </Text>
      <Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="₹0" autoFocus accessibilityLabel="Amount" />

      <Text style={styles.label}>Out of</Text>
      <TabPills tabs={FROM_TABS} active={from} onChange={setFrom} size="sm" />
      <Text style={styles.hint}>{formatCompact(cashAvailable)} available across your buckets.</Text>

      <PrimaryButton
        label="Record it"
        onPress={() => onMove(paise, AS_PAY_METHOD[from])}
        disabled={paise <= 0}
        style={styles.cta}
      />
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  label: { ...type.caption, color: colors.textSecondary, marginTop: space.md, marginBottom: space.xs },
  hint: { ...type.caption, color: colors.textSecondary, marginTop: space.sm },
  cta: { marginTop: space.md },
});
