import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, type, space } from '../../tokens';
import { SheetModal } from '../../ui/SheetModal';
import { Input } from '../../ui/Input';
import { Chip } from '../../ui/Chip';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { SecondaryButton } from '../../ui/SecondaryButton';
import { formatRupees, parseToPaise, paiseToInput } from '../../../lib/money';
import { PayMethod, PAY_METHOD_LABEL, PAY_METHOD_ICON } from '../../../constants/enums';
import { ASSET_KIND, ASSET_KIND_LABEL, ASSET_KIND_ICON } from '../../../constants/assets';
import type { Asset, AssetKind } from '../../../db/queries/assets';

/**
 * One sheet, five jobs — because they are all "this asset, and a number", and
 * five near-identical sheets is how the chip variants got to seven.
 *
 * The three money modes are NOT the same operation and the copy says so:
 *
 * - `in` / `out` are **transfers**. Cash moves, the asset moves the other way,
 *   and net worth does not change. They ask which bucket the money came from or
 *   goes to, because that is what makes cash land in the right place.
 * - `restate` is a **market move**. Net worth changes and no cash moves, so it
 *   asks for no bucket and writes no transaction.
 *
 * Merging them would mean either inventing cash movement for a price change, or
 * losing the record of a real purchase. Both are silent.
 */
export type AssetSheetMode = 'create' | 'edit' | 'in' | 'out' | 'restate';

/** Where money comes from or goes to. Card is absent on purpose: you cannot buy
 *  an asset "from" a credit card in this model without it also being a debt, and
 *  that is a bigger change than this screen. */
const BUCKETS = [PayMethod.Bank, PayMethod.Cash, PayMethod.Wallet, PayMethod.Upi];

const TITLE: Record<AssetSheetMode, (a?: Asset) => string> = {
  create: () => 'Add an asset',
  edit: (a) => a?.name ?? 'Asset',
  in: (a) => `Add to ${a?.name ?? 'asset'}`,
  out: (a) => `Take out of ${a?.name ?? 'asset'}`,
  restate: (a) => `What is ${a?.name ?? 'it'} worth?`,
};

export function AssetSheet({
  state, busy, onClose, onCreate, onRename, onRestate, onAddMoney, onTakeMoney, onArchive, onDelete,
}: {
  state: { mode: AssetSheetMode; asset?: Asset } | null;
  busy: boolean;
  onClose: () => void;
  onCreate: (input: { name: string; kind: AssetKind; balance: number }) => void;
  onRename: (id: string, patch: { name: string; kind: AssetKind }) => void;
  onRestate: (id: string, balancePaise: number) => void;
  onAddMoney: (id: string, amountPaise: number, from: PayMethod) => void;
  onTakeMoney: (id: string, amountPaise: number, to: PayMethod) => void;
  onArchive: (asset: Asset) => void;
  onDelete: (asset: Asset) => void;
}) {
  const mode = state?.mode ?? 'create';
  const asset = state?.asset;

  const [name, setName] = useState('');
  const [kind, setKind] = useState<AssetKind>('investment');
  const [amount, setAmount] = useState('');
  const [bucket, setBucket] = useState<PayMethod>(PayMethod.Bank);

  // Re-seed whenever the sheet opens, so the previous asset's values never leak
  // into the next one — the same reason MoneyEditorSheet re-seeds on `visible`.
  useEffect(() => {
    if (!state) return;
    setName(asset?.name ?? '');
    setKind(asset?.kind ?? 'investment');
    setBucket(PayMethod.Bank);
    setAmount(mode === 'restate' && asset ? paiseToInput(asset.balance) : '');
  }, [state, asset, mode]);

  const paise = parseToPaise(amount);
  const overdraw = mode === 'out' && !!asset && paise > asset.balance;
  const canSubmit = !busy && (
    mode === 'create' || mode === 'edit'
      ? name.trim().length > 0
      : mode === 'restate' ? amount.trim().length > 0 : paise > 0 && !overdraw
  );

  function submit() {
    if (!canSubmit) return;
    if (mode === 'create') return onCreate({ name: name.trim(), kind, balance: paise });
    if (!asset) return;
    if (mode === 'edit') return onRename(asset.id, { name: name.trim(), kind });
    if (mode === 'restate') return onRestate(asset.id, paise);
    if (mode === 'in') return onAddMoney(asset.id, paise, bucket);
    return onTakeMoney(asset.id, paise, bucket);
  }

  const namingMode = mode === 'create' || mode === 'edit';

  return (
    <SheetModal visible={!!state} onClose={onClose} title={TITLE[mode](asset)}>
      <>
        {namingMode && (
          <>
            <Text style={styles.label}>Name</Text>
            <Input
              value={name}
              onChangeText={setName}
              placeholder="Gold, the flat, HDFC FD…"
              autoCapitalize="words"
              style={styles.gap}
            />

            <Text style={styles.label}>Kind</Text>
            <View style={styles.chips}>
              {ASSET_KIND.map(k => (
                <Chip
                  key={k}
                  label={ASSET_KIND_LABEL[k]}
                  icon={ASSET_KIND_ICON[k]}
                  selected={kind === k}
                  onPress={() => setKind(k)}
                />
              ))}
            </View>
            <Text style={styles.hint}>
              Only changes the icon and the label — every asset counts the same way.
            </Text>
          </>
        )}

        {mode === 'create' && (
          <>
            <Text style={styles.label}>What is it worth today?</Text>
            <Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="₹0" style={styles.gap} />
            <Text style={styles.hint}>
              Its current value. This does NOT take money out of your cash — it records
              something you already own. Use “Add” afterwards for money you move in from now on.
            </Text>
          </>
        )}

        {mode === 'restate' && (
          <>
            <Text style={styles.label}>Worth now</Text>
            <Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="₹0" style={styles.gap} autoFocus />
            <Text style={styles.hint}>
              A price change, not a transfer — your net worth moves and no cash does, so
              nothing is added to your ledger.
            </Text>
          </>
        )}

        {(mode === 'in' || mode === 'out') && (
          <>
            <Text style={styles.label}>Amount</Text>
            <Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="₹0" style={styles.gap} autoFocus />
            {overdraw && (
              <Text style={styles.error}>
                {asset?.name} only holds {formatRupees(asset?.balance ?? 0)}.
              </Text>
            )}

            <Text style={styles.label}>{mode === 'in' ? 'Money comes from' : 'Money goes to'}</Text>
            <View style={styles.chips}>
              {BUCKETS.map(b => (
                <Chip
                  key={b}
                  label={PAY_METHOD_LABEL[b]}
                  icon={PAY_METHOD_ICON[b]}
                  selected={bucket === b}
                  onPress={() => setBucket(b)}
                />
              ))}
            </View>
            <Text style={styles.hint}>
              {mode === 'in'
                ? 'Your cash goes down and this asset goes up by the same — a transfer, so your net worth stays where it is. It is not spending, so no budget is touched.'
                : 'This asset goes down and your cash goes up by the same. Selling something you already own is not income, so it is not counted as earnings.'}
            </Text>
          </>
        )}

        <PrimaryButton
          label={mode === 'create' ? 'Add asset' : mode === 'edit' ? 'Save' : mode === 'restate' ? 'Update value' : mode === 'in' ? 'Move it in' : 'Take it out'}
          onPress={submit}
          disabled={!canSubmit}
          loading={busy}
          style={styles.submit}
        />

        {mode === 'edit' && asset && (
          <View style={styles.dangerRow}>
            <SecondaryButton label="Stop counting" size="sm" onPress={() => onArchive(asset)} style={styles.dangerBtn} />
            <SecondaryButton label="Delete" size="sm" danger onPress={() => onDelete(asset)} style={styles.dangerBtn} />
          </View>
        )}
      </>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  label: { ...type.label, color: colors.textSecondary, marginBottom: space.xs, marginTop: space.md },
  gap: { marginBottom: space.xs },
  hint: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
  error: { ...type.caption, color: colors.expense, marginBottom: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.sm },
  submit: { marginTop: space.lg },
  dangerRow: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  dangerBtn: { flex: 1 },
});
