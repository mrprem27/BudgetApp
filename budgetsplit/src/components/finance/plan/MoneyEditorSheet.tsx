import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { colors, type, space } from '../../tokens';
import { SheetModal } from '../../ui/SheetModal';
import { Input } from '../../ui/Input';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { formatCompact, parseToPaise } from '../../../lib/money';
import type { MoneyProfile } from '../../../lib/cash';

/** Paise → an editable rupees string ('' for zero so the placeholder shows). */
const toInput = (paise: number) => (paise ? String(paise / 100) : '');

/**
 * Edit the real-money inputs behind "Total Money": cash on hand, investments,
 * and credit (limit + used). Used both from the Plan card and (the same fields)
 * at first-time setup. All values entered in rupees → saved as paise.
 */
export function MoneyEditorSheet({
  visible,
  onClose,
  initial,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  initial: MoneyProfile;
  onSave: (p: MoneyProfile) => void;
}) {
  const [cash, setCash] = useState('');
  const [investments, setInvestments] = useState('');
  const [limit, setLimit] = useState('');
  const [used, setUsed] = useState('');

  // Re-seed the fields whenever the sheet (re)opens with the latest profile.
  useEffect(() => {
    if (!visible) return;
    setCash(toInput(initial.openingCash));
    setInvestments(toInput(initial.investments));
    setLimit(toInput(initial.creditLimit));
    setUsed(toInput(initial.creditUsed));
  }, [visible, initial]);

  const usedPaise = parseToPaise(used);
  const limitPaise = parseToPaise(limit);
  const usedExceeds = usedPaise > limitPaise && limitPaise > 0;

  function handleSave() {
    onSave({
      openingCash: parseToPaise(cash),
      investments: parseToPaise(investments),
      creditLimit: limitPaise,
      creditUsed: usedPaise,
    });
  }

  return (
    <SheetModal visible={visible} onClose={onClose} title="Your money">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text style={styles.label}>Cash available</Text>
        <Input value={cash} onChangeText={setCash} keyboardType="decimal-pad" placeholder="₹0" style={styles.gap} />
        <Text style={styles.hint}>Money in your bank + wallet right now. Transactions adjust this as you spend.</Text>

        <Text style={styles.label}>Investments</Text>
        <Input value={investments} onChangeText={setInvestments} keyboardType="decimal-pad" placeholder="₹0" style={styles.gap} />
        <Text style={styles.hint}>Mutual funds, stocks, FDs… shown for context, never spent automatically.</Text>

        <Text style={styles.label}>Credit card limit</Text>
        <Input value={limit} onChangeText={setLimit} keyboardType="decimal-pad" placeholder="₹0" style={styles.gap} />

        <Text style={styles.label}>Credit already used</Text>
        <Input value={used} onChangeText={setUsed} keyboardType="decimal-pad" placeholder="₹0" style={styles.gap} />
        {usedExceeds
          ? <Text style={[styles.hint, { color: colors.expense }]}>Used is more than the limit — available credit will show ₹0.</Text>
          : limitPaise > 0 ? <Text style={styles.hint}>{formatCompact(Math.max(0, limitPaise - usedPaise))} available credit.</Text> : null}

        <PrimaryButton label="Save" onPress={handleSave} style={{ marginTop: space.md }} />
      </KeyboardAvoidingView>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  label: { ...type.label, color: colors.textSecondary, marginTop: space.sm, marginBottom: space.xs },
  gap: { marginBottom: space.xs },
  hint: { ...type.caption, color: colors.textMuted, marginBottom: space.sm },
});
