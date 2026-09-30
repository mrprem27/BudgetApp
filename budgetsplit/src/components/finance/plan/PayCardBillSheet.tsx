import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, type, space } from '../../tokens';
import { SheetModal } from '../../ui/SheetModal';
import { Card } from '../../ui/Card';
import { AmountRow } from '../../ui/AmountRow';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { Chip } from '../../ui/Chip';
import { formatCompact, parseToPaise, paiseToInput } from '../../../lib/money';
import { accountsToChoose, type AccountChoice } from '../../../lib/paidFrom';
import { PayMethod } from '../../../constants/enums';

/**
 * Log a card-bill payment: one amount, one button. Pre-filled with the full
 * current balance (paying it off is the common case); any partial amount works.
 * The write itself is `payCardBill` — cash down and credit-used down in one row. With several
 * banks or cards, a row of chips asks which (`DQ-109`); with one of each, nothing is asked.
 */
export function PayCardBillSheet({
  visible,
  onClose,
  creditUsed,
  accounts = [],
  onPay,
}: {
  visible: boolean;
  onClose: () => void;
  /** Current derived card balance (paise) — the prefill and the sanity cap. */
  creditUsed: number;
  accounts?: readonly AccountChoice[];
  onPay: (amountPaise: number, accounts: { from?: string; card?: string }) => void;
}) {
  const [amount, setAmount] = useState('');
  const [from, setFrom] = useState<string | undefined>();
  const [card, setCard] = useState<string | undefined>();
  useEffect(() => {
    if (visible) { setAmount(paiseToInput(creditUsed)); setFrom(undefined); setCard(undefined); }
  }, [visible, creditUsed]);
  const banks = accountsToChoose(accounts, PayMethod.Bank);
  const cards = accountsToChoose(accounts, PayMethod.Card);
  const picked = (list: AccountChoice[], id?: string) => id ?? list.find(a => a.is_default)?.id;

  const paise = parseToPaise(amount);
  const overpay = paise > creditUsed;

  return (
    <SheetModal visible={visible} onClose={onClose} title="Pay card bill">
      <Card clip>
        <AmountRow icon="credit-card" label="Amount paid" value={amount} onChangeText={setAmount} autoFocus />
      </Card>
      {cards.length > 0 && <Choice label="Card" list={cards} value={picked(cards, card)} onPick={setCard} />}
      {banks.length > 0 && <Choice label="Paid from" list={banks} value={picked(banks, from)} onPick={setFrom} />}
      <Text style={styles.hint}>Leaves your bank and comes off the {formatCompact(creditUsed)} card balance.</Text>
      {overpay && (
        <Text style={styles.warn}>That&apos;s more than the current balance, the balance stops at ₹0.</Text>
      )}
      <PrimaryButton
        label={paise > 0 ? `Log payment of ${formatCompact(paise)}` : 'Log payment'}
        onPress={() => paise > 0 && onPay(paise, { from: picked(banks, from), card: picked(cards, card) })}
        disabled={paise <= 0}
        style={styles.cta}
      />
    </SheetModal>
  );
}

function Choice({ label, list, value, onPick }: { label: string; list: AccountChoice[]; value?: string; onPick: (id: string) => void }) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {list.map(a => <Chip key={a.id} label={a.name} selected={a.id === value} onPress={() => onPick(a.id)} />)}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  label: { ...type.label, color: colors.textSecondary, marginTop: space.md, marginBottom: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  hint: { ...type.caption, color: colors.textMuted, marginTop: space.sm },
  warn: { ...type.caption, color: colors.healthAmber, marginTop: space.xs },
  cta: { marginTop: space.md },
});
