import React, { useEffect, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { colors, type, space } from '../../tokens';
import { SheetModal } from '../../ui/SheetModal';
import { Input } from '../../ui/Input';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { formatCompact, parseToPaise, paiseToInput } from '../../../lib/money';

/**
 * Log a card-bill payment: one amount, one button. Pre-filled with the full
 * current balance (paying it off is the common case); any partial amount works.
 * The write itself is `payCardBill` — cash down and credit-used down in one row.
 */
export function PayCardBillSheet({
  visible,
  onClose,
  creditUsed,
  onPay,
}: {
  visible: boolean;
  onClose: () => void;
  /** Current derived card balance (paise) — the prefill and the sanity cap. */
  creditUsed: number;
  onPay: (amountPaise: number) => void;
}) {
  const [amount, setAmount] = useState('');
  useEffect(() => {
    if (visible) setAmount(paiseToInput(creditUsed));
  }, [visible, creditUsed]);

  const paise = parseToPaise(amount);
  const overpay = paise > creditUsed;

  return (
    <SheetModal visible={visible} onClose={onClose} title="Pay card bill">
      <Text style={styles.hint}>
        Money leaves your cash and comes off the {formatCompact(creditUsed)} card balance — one entry, both sides.
      </Text>
      <Input
        label="Amount paid"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="₹0"
        autoFocus
      />
      {overpay && (
        <Text style={styles.warn}>That&apos;s more than the current balance — the balance stops at ₹0.</Text>
      )}
      <PrimaryButton
        label={paise > 0 ? `Log payment of ${formatCompact(paise)}` : 'Log payment'}
        onPress={() => paise > 0 && onPay(paise)}
        disabled={paise <= 0}
        style={styles.cta}
      />
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  hint: { ...type.body, color: colors.textSecondary, marginBottom: space.md },
  warn: { ...type.caption, color: colors.healthAmber, marginTop: space.xs },
  cta: { marginTop: space.md },
});
