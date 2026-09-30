import { useEffect, useRef, useState } from 'react';
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
import { formatRupees, parseToPaise } from '../../../lib/money';
import { openingFor, type MoneyPlace } from '../../../lib/moneySum';
import { MoneySum } from './MoneySum';
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
  current,
  unattributed = 0,
  inGoals = 0,
}: {
  visible: boolean;
  onClose: () => void;
  initial: MoneyProfile & { cardDueDay?: number | null };
  /**
   * `adjustments`: per place, the gap between what you typed and what the app had, for a place
   * whose balance has already moved since it was set — recorded as a Balance adjustment entry
   * instead of rewriting the start (`U-64`).
   */
  onSave: (p: MoneyProfileWrite, adjustments?: Partial<Record<MoneyPlace, number>>) => void;
  /** Opens the asset register — where investments live now. */
  onManageAssets?: () => void;
  /**
   * Each place's balance today (`getCashPosition().byBucket`). The fields show and take these,
   * so what you type is what your bank app says; the starting figure is worked out on save.
   */
  current?: Record<MoneyPlace, number>;
  unattributed?: number;
  inGoals?: number;
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
  const currentRef = useRef(current);
  currentRef.current = current;
  // What each field opened with: an untouched field keeps its exact figure, sign included
  // (`parseToPaise` reads no minus, and an overdrawn place is negative).
  const seeded = useRef<Record<MoneyPlace, string>>({ bank: '', cash: '', wallet: '' });
  useEffect(() => {
    if (!visible) return;
    const initial = initialRef.current;
    const now = currentRef.current;
    seeded.current = {
      bank: toInput(now ? now.bank : initial.openingBank),
      cash: toInput(now ? now.cash : initial.openingCash),
      wallet: toInput(now ? now.wallet : initial.openingWallet),
    };
    setBank(seeded.current.bank);
    setCash(seeded.current.cash);
    setWallet(seeded.current.wallet);
    setLimit(toInput(initial.creditLimit));
    setUsed(toInput(initial.creditUsed));
    setDueDay(initial.cardDueDay ? String(initial.cardDueDay) : '');
  }, [visible]);

  const usedPaise = parseToPaise(used);
  const limitPaise = parseToPaise(limit);
  const usedExceeds = usedPaise > limitPaise && limitPaise > 0;

  const inputs: Record<MoneyPlace, string> = { bank, cash, wallet };
  const untouched = (k: MoneyPlace) => inputs[k] === seeded.current[k];
  const typedOf = (k: MoneyPlace) => (current && untouched(k) ? current[k] : parseToPaise(inputs[k]));
  const typed = { bank: typedOf('bank'), cash: typedOf('cash'), wallet: typedOf('wallet') };
  // The stored figure is the STARTING balance (each place = start + its movement since), so a
  // typed "today" becomes start = today − movement. Without `current` (nothing moved yet) the
  // two are the same.
  //
  // Once entries have moved a place, correcting it is a dated Balance adjustment entry rather
  // than a rewritten start (`U-64`): the history under it keeps adding up, and the fix shows in
  // the ledger. A place nothing has moved yet is still being set up, so its start just changes.
  const moved = (k: MoneyPlace, openingOld: number) => !!current && current[k] !== openingOld;
  const opening = (k: MoneyPlace, openingOld: number) =>
    untouched(k) || moved(k, openingOld) ? openingOld : current ? openingFor(typed[k], current[k], openingOld) : typed[k];

  function handleSave() {
    const adjustments: Partial<Record<MoneyPlace, number>> = {};
    const olds: Record<MoneyPlace, number> = { bank: initial.openingBank, cash: initial.openingCash, wallet: initial.openingWallet };
    for (const k of ['bank', 'cash', 'wallet'] as MoneyPlace[]) {
      if (!untouched(k) && moved(k, olds[k]) && current) adjustments[k] = typed[k] - current[k];
    }
    onSave({
      openingBank: opening('bank', initial.openingBank),
      openingCash: opening('cash', initial.openingCash),
      openingWallet: opening('wallet', initial.openingWallet),
      creditLimit: limitPaise,
      creditUsed: usedPaise,
      cardDueDay: dueDay.trim() ? Number(dueDay) : null,
    }, adjustments);
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
          info="What each place holds today, as your bank app or wallet shows it. Your transactions move them from here, using where each was paid from."
        />
        <Card clip style={styles.card}>
          <AmountRow icon="briefcase" label="Bank" value={bank} onChangeText={setBank} />
          <Divider indent="text" />
          <AmountRow icon="dollar-sign" label="Cash" value={cash} onChangeText={setCash} iconColor={colors.income} />
          <Divider indent="text" />
          <AmountRow icon="smartphone" label="Wallet" value={wallet} onChangeText={setWallet} iconColor={colors.settle} />
        </Card>

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
              placeholder="0"
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

        {/* The same sum as Money's card, live as you type (`U-47`): the numbers reconcile the
            way they read outside, and Invested is a line you tap to reach your assets. */}
        <Text style={styles.label}>How it adds up</Text>
        <Card padded style={styles.card}>
          <MoneySum
            places={typed}
            unattributed={unattributed}
            inGoals={inGoals}
            investments={initial.investments}
            creditUsed={usedPaise}
            creditLeft={limitPaise > 0 ? Math.max(0, limitPaise - usedPaise) : undefined}
            onManageAssets={onManageAssets}
          />
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
