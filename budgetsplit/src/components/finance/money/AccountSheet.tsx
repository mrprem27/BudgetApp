import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, layout } from '../../tokens';
import { Card } from '../../ui/Card';
import { Divider } from '../../ui/Divider';
import { AmountRow } from '../../ui/AmountRow';
import { IconCircle } from '../../ui/IconCircle';
import { SheetModal } from '../../ui/SheetModal';
import { Input } from '../../ui/Input';
import { Chip } from '../../ui/Chip';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { PayMethodGlyph } from '../pay/PayMethodGlyph';
import { parseToPaise, paiseToInput } from '../../../lib/money';
import { asDueDay } from '../../../lib/cash';
import { PAY_METHOD_LABEL, PayMethod } from '../../../constants/enums';
import type { AccountKind } from '../../../db/queries/accountSql';
import type { AccountInput, AccountWithBalance } from '../../../db/queries/accounts';

const KINDS: AccountKind[] = ['bank', 'cash', 'wallet', 'card'];
const EXAMPLE: Record<AccountKind, string> = {
  bank: 'HDFC savings', cash: 'Cash at home', wallet: 'Paytm', card: 'Amex',
};

/**
 * One account (`U-68`): add it, or edit its name, balance, and for a card its limit and due day.
 * A sheet, per the one-form rule: a handful of fields about one thing. What a card owes is
 * stated on Your money, where the card balance lives.
 */
export function AccountSheet({ state, busy, onClose, onCreate, onSave, onArchive }: {
  /** `account` absent = add. */
  state: { account?: AccountWithBalance } | null;
  busy: boolean;
  onClose: () => void;
  onCreate: (input: AccountInput) => void;
  onSave: (account: AccountWithBalance, input: AccountInput & { balance?: number }) => void;
  onArchive: (account: AccountWithBalance) => void;
}) {
  // The last state renders through the slide-out, so the content never flips mid-exit (`AssetSheet`).
  const last = useRef(state);
  if (state) last.current = state;
  const account = (state ?? last.current)?.account;

  const [kind, setKind] = useState<AccountKind>('bank');
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [limit, setLimit] = useState('');
  const [dueDay, setDueDay] = useState('');

  useEffect(() => {
    if (!state) return;
    const a = state.account;
    setKind(a?.kind ?? 'bank');
    setName(a?.name ?? '');
    setBalance(a && a.kind !== 'card' ? paiseToInput(a.balance) : '');
    setLimit(a?.credit_limit ? paiseToInput(a.credit_limit) : '');
    setDueDay(a?.due_day ? String(a.due_day) : '');
  }, [state]);

  const card = kind === 'card';
  const badDay = !!dueDay && !asDueDay(dueDay);
  const canSubmit = !busy && name.trim().length > 0 && !badDay;

  function submit() {
    if (!canSubmit) return;
    const input: AccountInput = {
      name: name.trim(), kind,
      creditLimit: card ? parseToPaise(limit) || null : null,
      dueDay: card ? asDueDay(dueDay) : null,
    };
    if (!account) return onCreate({ ...input, openingBalance: card ? 0 : parseToPaise(balance) });
    // An untouched field keeps its exact figure (`parseToPaise` reads no minus).
    const typed = balance === paiseToInput(account.balance) ? account.balance : parseToPaise(balance);
    return onSave(account, { ...input, balance: card ? undefined : typed });
  }

  return (
    <SheetModal visible={!!state} onClose={onClose} title={account ? account.name : 'Add an account'}>
      <>
        {/* A default's kind is what entries fall back to, so it never changes. */}
        {!account?.is_default && (
          <>
            <Text style={styles.labelFirst}>What is it?</Text>
            <View style={styles.chips}>
              {KINDS.map(k => (
                <Chip
                  key={k}
                  label={PAY_METHOD_LABEL[k as PayMethod]}
                  leading={<PayMethodGlyph method={k as PayMethod} size={14} color={kind === k ? colors.accent : colors.textSecondary} />}
                  selected={kind === k}
                  onPress={() => setKind(k)}
                />
              ))}
            </View>
          </>
        )}

        <Text style={account?.is_default ? styles.labelFirst : styles.label}>Name</Text>
        <Input value={name} onChangeText={setName} placeholder={EXAMPLE[kind]} autoCapitalize="words" />

        {card ? (
          <Card clip style={styles.amountCard}>
            <AmountRow icon="credit-card" label="Limit" value={limit} onChangeText={setLimit} />
            <Divider indent="text" />
            <View style={styles.dueRow}>
              <IconCircle icon="calendar" size={layout.iconCircle} color={colors.healthAmber} />
              <Text style={styles.dueLabel}>Bill due on day</Text>
              <TextInput
                value={dueDay}
                onChangeText={t => setDueDay(t.replace(/[^0-9]/g, '').slice(0, 2))}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                style={styles.dueInput}
                accessibilityLabel="Card bill due day of the month"
                selectTextOnFocus
              />
            </View>
            {badDay && <Text style={styles.bad}>Use a day from 1 to 31.</Text>}
          </Card>
        ) : (
          <Card clip style={styles.amountCard}>
            <AmountRow icon="check-circle" label="Balance today" value={balance} onChangeText={setBalance} />
          </Card>
        )}

        <PrimaryButton label={account ? 'Save' : 'Add account'} onPress={submit} disabled={!canSubmit} loading={busy} style={styles.submit} />

        {account && !account.is_default && (
          <TouchableOpacity style={styles.quiet} onPress={() => onArchive(account)} accessibilityRole="button" accessibilityLabel="Stop using. Its entries still count">
            <Feather name="eye-off" size={16} color={colors.textSecondary} />
            <View style={styles.flex}>
              <Text style={styles.quietLabel}>Stop using</Text>
              <Text style={styles.quietHint}>Its entries still count</Text>
            </View>
          </TouchableOpacity>
        )}
      </>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  label: { ...type.label, color: colors.textSecondary, marginBottom: space.xs, marginTop: space.md },
  labelFirst: { ...type.label, color: colors.textSecondary, marginBottom: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.sm },
  amountCard: { marginTop: space.lg },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: space.smd, minHeight: layout.rowMinHeight, paddingHorizontal: space.md },
  dueLabel: { ...type.body, color: colors.textPrimary, flex: 1 },
  dueInput: { fontFamily: 'SpaceMono_400Regular', fontSize: 16, color: colors.textPrimary, textAlign: 'right', minWidth: 48, paddingVertical: space.sm },
  bad: { ...type.caption, color: colors.expense, paddingHorizontal: space.md, paddingBottom: space.sm },
  submit: { marginTop: space.lg },
  quiet: { flexDirection: 'row', alignItems: 'center', gap: space.smd, minHeight: layout.touchMin, paddingVertical: space.sm, marginTop: space.md, borderTopWidth: 1, borderTopColor: colors.border },
  quietLabel: { ...type.labelSemi, color: colors.textSecondary },
  quietHint: { ...type.caption, color: colors.textMuted },
});
