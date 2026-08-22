import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
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
  const [bank, setBank] = useState('');
  const [cash, setCash] = useState('');
  const [wallet, setWallet] = useState('');
  const [investments, setInvestments] = useState('');
  const [limit, setLimit] = useState('');
  const [used, setUsed] = useState('');

  // Re-seed the fields whenever the sheet (re)opens with the latest profile.
  useEffect(() => {
    if (!visible) return;
    setBank(toInput(initial.openingBank));
    setCash(toInput(initial.openingCash));
    setWallet(toInput(initial.openingWallet));
    setInvestments(toInput(initial.investments));
    setLimit(toInput(initial.creditLimit));
    setUsed(toInput(initial.creditUsed));
  }, [visible, initial]);

  const usedPaise = parseToPaise(used);
  const limitPaise = parseToPaise(limit);
  const usedExceeds = usedPaise > limitPaise && limitPaise > 0;

  function handleSave() {
    onSave({
      openingBank: parseToPaise(bank),
      openingCash: parseToPaise(cash),
      openingWallet: parseToPaise(wallet),
      investments: parseToPaise(investments),
      creditLimit: limitPaise,
      creditUsed: usedPaise,
    });
  }

  return (
    // No KeyboardAvoidingView here: `DraggableSheet` already wraps every sheet in
    // one, anchored `flex-end` so the sheet rides up. A second one inside adds
    // `paddingBottom: keyboardHeight` a second time, and in an 88%-max-height
    // sheet with four fields that pushed Save out of reach.
    <SheetModal visible={visible} onClose={onClose} title="Your money">
      <>
        {/*
          Three fields where there was one, and the sheet has already failed this
          way once — see the note above about Save going out of reach. So they sit
          as one labelled group with a single shared hint, not three full-weight
          fields each with their own label and explanation.

          Bank leads because it is where most money is, and because
          `INCOME_LANDING_DEFAULT` is Bank for the same reason.
        */}
        <Text style={styles.label}>Where your money is</Text>
        <View style={styles.bucketRow}>
          <View style={styles.bucket}>
            <Text style={styles.bucketLabel}>Bank</Text>
            <Input value={bank} onChangeText={setBank} keyboardType="decimal-pad" placeholder="₹0" />
          </View>
          <View style={styles.bucket}>
            <Text style={styles.bucketLabel}>Cash</Text>
            <Input value={cash} onChangeText={setCash} keyboardType="decimal-pad" placeholder="₹0" />
          </View>
          <View style={styles.bucket}>
            <Text style={styles.bucketLabel}>Wallet</Text>
            <Input value={wallet} onChangeText={setWallet} keyboardType="decimal-pad" placeholder="₹0" />
          </View>
        </View>
        <Text style={styles.hint}>
          What you have right now, in each place. Transactions adjust these as you spend,
          using the pay method on each one.
        </Text>

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
      </>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  label: { ...type.label, color: colors.textSecondary, marginTop: space.sm, marginBottom: space.xs },
  bucketRow: { flexDirection: 'row', gap: space.sm },
  bucket: { flex: 1 },
  bucketLabel: { ...type.caption, color: colors.textSecondary, marginBottom: space.xs },
  gap: { marginBottom: space.xs },
  hint: { ...type.caption, color: colors.textMuted, marginBottom: space.sm },
});
