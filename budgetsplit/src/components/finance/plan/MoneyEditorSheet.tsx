import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { colors, type, space, layout } from '../../tokens';
import { SheetModal } from '../../ui/SheetModal';
import { Card } from '../../ui/Card';
import { Divider } from '../../ui/Divider';
import { ListRow } from '../../ui/ListRow';
import { AmountRow } from '../../ui/AmountRow';
import { IconCircle } from '../../ui/IconCircle';
import { InfoLabel } from '../../ui/InfoLabel';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { SecondaryButton } from '../../ui/SecondaryButton';
import { formatCompact, formatRupees, parseToPaise, sumInputsPaise } from '../../../lib/money';
import { asDueDay, type MoneyProfile } from '../../../lib/cash';
import type { MoneyProfileWrite } from '../../../db/queries/moneyProfile';

/** Paise → an editable rupees string ('' for zero so the placeholder shows). */
const toInput = (paise: number) => (paise ? String(paise / 100) : '');

/**
 * Edit the real-money inputs behind "Total Money": cash on hand,
 * and credit (limit + used). Used both from the Plan card and (the same fields)
 * at first-time setup. All values entered in rupees → saved as paise.
 */
export function MoneyEditorSheet({
  visible,
  onClose,
  initial,
  onSave,
  onManageAssets,
}: {
  visible: boolean;
  onClose: () => void;
  initial: MoneyProfile & { cardDueDay?: number | null };
  onSave: (p: MoneyProfileWrite) => void;
  /** Opens the asset register — where investments live now. */
  onManageAssets?: () => void;
}) {
  const [bank, setBank] = useState('');
  const [cash, setCash] = useState('');
  const [wallet, setWallet] = useState('');
  const [limit, setLimit] = useState('');
  const [used, setUsed] = useState('');
  const [dueDay, setDueDay] = useState('');

  /*
   * Keyed on `visible` ALONE, and read through a ref.
   *
   * `initial` is built as an object literal by the caller, so it is a new
   * identity on every parent render — with it in the deps, any re-render while
   * the sheet was open re-seeded all five fields and discarded whatever the user
   * had typed. Same defect `MoveToInvestmentsSheet` had, one step worse.
   */
  const initialRef = useRef(initial);
  initialRef.current = initial;
  useEffect(() => {
    if (!visible) return;
    const initial = initialRef.current;
    setBank(toInput(initial.openingBank));
    setCash(toInput(initial.openingCash));
    setWallet(toInput(initial.openingWallet));
    setLimit(toInput(initial.creditLimit));
    setUsed(toInput(initial.creditUsed));
    setDueDay(initial.cardDueDay ? String(initial.cardDueDay) : '');
  }, [visible]);

  const usedPaise = parseToPaise(used);
  const limitPaise = parseToPaise(limit);
  const usedExceeds = usedPaise > limitPaise && limitPaise > 0;

  function handleSave() {
    onSave({
      openingBank: parseToPaise(bank),
      openingCash: parseToPaise(cash),
      openingWallet: parseToPaise(wallet),
      creditLimit: limitPaise,
      creditUsed: usedPaise,
      cardDueDay: dueDay.trim() ? Number(dueDay) : null,
    });
  }

  return (
    // No KeyboardAvoidingView here: `DraggableSheet` already wraps every sheet in
    // one, anchored `flex-end` so the sheet rides up. A second one inside adds
    // `paddingBottom: keyboardHeight` a second time, and in an 88%-max-height
    // sheet with four fields that pushed Save out of reach.
    <SheetModal visible={visible} onClose={onClose} title="Your money">
      <>
        {/* One row per place, in a card — the three side-by-side boxes were too narrow to read a
            lakh in. Bank leads: most money is there, and income lands there by default. */}
        <InfoLabel
          label="Where your money is"
          labelStyle={styles.label}
          info="What you have right now in each place. Transactions adjust these as you spend, using each one's pay method."
        />
        <Card clip style={styles.card}>
          <AmountRow icon="briefcase" label="Bank" value={bank} onChangeText={setBank} />
          <Divider indent="text" />
          <AmountRow icon="dollar-sign" label="Cash" value={cash} onChangeText={setCash} iconColor={colors.income} />
          <Divider indent="text" />
          <AmountRow icon="smartphone" label="Wallet" value={wallet} onChangeText={setWallet} iconColor={colors.settle} />
          <Divider indent="text" />
          <ListRow icon="layers" title="Total" value={formatRupees(sumInputsPaise(bank, cash, wallet))} chevron={false} />
        </Card>

        {/*
          * Investments are not a field here any more — they are the asset
          * register, and this sheet writes the money profile. One number could
          * not tell gold from an FD from a flat, and typing a new total was the
          * only way to change it, which is why buying an SIP had to be logged as
          * an expense and dropped net worth by the amount invested.
          */}
        {onManageAssets && (
          <>
            <InfoLabel
              label="Investments and assets"
              labelStyle={styles.label}
              info="Gold, a flat, an FD, a fund — named, so moving money in or out is a transfer and your net worth stays put."
            />
            <SecondaryButton
              label={`${formatCompact(initial.investments)} across your assets`}
              onPress={onManageAssets}
              style={styles.card}
            />
          </>
        )}

        <Text style={styles.label}>Credit card</Text>
        <Card clip style={styles.card}>
          <AmountRow icon="credit-card" label="Limit" value={limit} onChangeText={setLimit} />
          <Divider indent="text" />
          <AmountRow icon="arrow-up-right" label="Already used" value={used} onChangeText={setUsed} iconColor={colors.expense} />
          <Divider indent="text" />
          {/* When the bill is due, so the forecast dates the repayment instead of taking it all today. */}
          <View style={styles.dueRow}>
            <IconCircle icon="calendar" size={layout.iconCircle} color={colors.healthAmber} />
            <Text style={styles.dueLabel}>Bill due on day</Text>
            <TextInput
              value={dueDay}
              onChangeText={t => setDueDay(t.replace(/[^0-9]/g, '').slice(0, 2))}
              keyboardType="number-pad"
              placeholder="—"
              placeholderTextColor={colors.textMuted}
              style={styles.dueInput}
              accessibilityLabel="Card bill due day of the month"
              selectTextOnFocus
            />
          </View>
          {!!dueDay && !asDueDay(dueDay) && <Text style={styles.bad}>Use a day from 1 to 31.</Text>}
          {limitPaise > 0 && (
            <>
              <Divider indent="text" />
              <ListRow
                icon="check-circle"
                iconColor={usedExceeds ? colors.expense : colors.income}
                title="Available"
                value={usedExceeds ? 'Used is over the limit' : formatRupees(Math.max(0, limitPaise - usedPaise))}
                chevron={false}
              />
            </>
          )}
        </Card>

        <PrimaryButton label="Save" onPress={handleSave} disabled={!!dueDay && !asDueDay(dueDay)} style={{ marginTop: space.sm }} />
      </>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  label: { ...type.label, color: colors.textSecondary, marginTop: space.sm, marginBottom: space.xs },
  card: { marginBottom: space.md },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: space.smd, minHeight: layout.rowMinHeight, paddingHorizontal: space.md },
  dueLabel: { ...type.body, color: colors.textPrimary, flex: 1 },
  dueInput: { fontFamily: 'SpaceMono_400Regular', fontSize: 16, color: colors.textPrimary, textAlign: 'right', minWidth: 48, paddingVertical: space.sm },
  bad: { ...type.caption, color: colors.expense, paddingHorizontal: space.md, paddingBottom: space.sm },
});
