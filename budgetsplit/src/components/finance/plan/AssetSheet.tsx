import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, layout } from '../../tokens';
import { Card } from '../../ui/Card';
import { AmountRow } from '../../ui/AmountRow';
import { InfoLabel } from '../../ui/InfoLabel';
import { SheetModal } from '../../ui/SheetModal';
import { Input } from '../../ui/Input';
import { Chip } from '../../ui/Chip';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { parseToPaise, paiseToInput } from '../../../lib/money';
import { ASSET_KIND, ASSET_KIND_LABEL, ASSET_KIND_ICON, ASSET_KIND_EXAMPLE } from '../../../constants/assets';
import type { Asset, AssetKind } from '../../../db/queries/assets';

/**
 * One sheet for describing an asset: create it, edit it, or restate what it is worth.
 *
 * Moving money in or out is *not* here — that is `MoveMoneySheet`, one form for every
 * place money can go. What is left are the things you do to the asset itself, and the
 * distinction that matters still holds: `restate` is a **market move** — net worth
 * changes and no cash does, so it asks for no bucket and writes no transaction.
 */
export type AssetSheetMode = 'create' | 'edit' | 'restate';

const TITLE: Record<AssetSheetMode, (a?: Asset) => string> = {
  create: () => 'Add an asset',
  edit: (a) => a?.name ?? 'Asset',
  restate: (a) => `What is ${a?.name ?? 'it'} worth?`,
};

export function AssetSheet({
  state, busy, onClose, onCreate, onRename, onRestate, onArchive, onDelete,
}: {
  state: { mode: AssetSheetMode; asset?: Asset } | null;
  busy: boolean;
  onClose: () => void;
  onCreate: (input: { name: string; kind: AssetKind; balance: number }) => void;
  onRename: (id: string, patch: { name: string; kind: AssetKind }) => void;
  onRestate: (id: string, balancePaise: number) => void;
  onArchive: (asset: Asset) => void;
  onDelete: (asset: Asset) => void;
}) {
  /*
   * The sheet keeps rendering for 240ms after `visible` goes false — `SheetModal`
   * holds its children mounted through the slide-out. Reading `mode`/`asset`
   * straight off `state` meant that for the whole exit animation the content
   * flipped to the create form: the title became "Add an asset", the Name and
   * Kind chips appeared, the amount block and danger row vanished. Every
   * dismissal flashed a different sheet on its way out.
   *
   * So the last non-null state is what renders. `state` still drives `visible`.
   */
  const last = useRef(state);
  if (state) last.current = state;
  const shown = state ?? last.current;
  const mode = shown?.mode ?? 'create';
  const asset = shown?.asset;

  const [name, setName] = useState('');
  const [kind, setKind] = useState<AssetKind>('investment');
  const [amount, setAmount] = useState('');

  // Re-seed whenever the sheet opens, so the previous asset's values never leak
  // into the next one — the same reason MoneyEditorSheet re-seeds on `visible`.
  useEffect(() => {
    if (!state) return;
    setName(asset?.name ?? '');
    setKind(asset?.kind ?? 'investment');
    setAmount(mode === 'restate' && asset ? paiseToInput(asset.balance) : '');
  }, [state, asset, mode]);

  const paise = parseToPaise(amount);
  const canSubmit = !busy && (
    mode === 'create' || mode === 'edit'
      ? name.trim().length > 0
      : amount.trim().length > 0
  );

  function submit() {
    if (!canSubmit) return;
    if (mode === 'create') return onCreate({ name: name.trim(), kind, balance: paise });
    if (!asset) return;
    if (mode === 'edit') return onRename(asset.id, { name: name.trim(), kind });
    return onRestate(asset.id, paise);
  }

  const namingMode = mode === 'create' || mode === 'edit';

  return (
    <SheetModal visible={!!state} onClose={onClose} title={TITLE[mode](asset)}>
      <>
        {/* Kind, then name, then worth (`U-57`): what it is, what you call it, what it is worth.
            Name used to come first with one example for every kind; picking the kind first
            lets the Name field ask in its terms ("HDFC FD, RD, PPF…"). */}
        {namingMode && (
          <>
            <InfoLabel label="What is it?" labelStyle={styles.labelFirst} info="Only changes the icon and the label, every asset counts the same way." />
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

            <Text style={styles.label}>Name</Text>
            <Input
              value={name}
              onChangeText={setName}
              placeholder={ASSET_KIND_EXAMPLE[kind]}
              autoCapitalize="words"
              icon={ASSET_KIND_ICON[kind]}
            />
          </>
        )}

        {mode === 'create' && (
          <>
            <Card clip style={styles.amountCard}>
              <AmountRow icon={ASSET_KIND_ICON[kind]} label="Worth today" value={amount} onChangeText={setAmount} />
            </Card>
            <InfoLabel
              label="Already yours, no cash moves"
              labelStyle={styles.hint}
              info="This records something you already own at what it is worth today. To put new money into it, use Move money after adding it."
            />
          </>
        )}

        {mode === 'restate' && (
          <>
            <Card clip style={styles.amountCard}>
              <AmountRow icon="tag" label="Worth now" value={amount} onChangeText={setAmount} autoFocus />
            </Card>
            <InfoLabel
              label="A price change, no cash moves"
              labelStyle={styles.hint}
              info="Net worth moves to the new value; no cash does, and nothing is added to your ledger."
            />
          </>
        )}

        <PrimaryButton
          label={mode === 'create' ? 'Add asset' : mode === 'edit' ? 'Save' : 'Update value'}
          onPress={submit}
          disabled={!canSubmit}
          loading={busy}
          style={styles.submit}
        />

        {/* The rare, costly actions sit apart from Save as quiet rows, each saying what it does
            (`U-45`). Both confirm before anything happens (`useAssets`). */}
        {mode === 'edit' && asset && (
          <View style={styles.danger}>
            <QuietAction icon="eye-off" label="Stop counting" hint="Out of your net worth, history kept" onPress={() => onArchive(asset)} />
            <QuietAction icon="trash-2" label="Delete" hint="Only if nothing ever moved in or out" danger onPress={() => onDelete(asset)} />
          </View>
        )}
      </>
    </SheetModal>
  );
}

function QuietAction({ icon, label, hint, danger, onPress }: {
  icon: React.ComponentProps<typeof Feather>['name']; label: string; hint: string; danger?: boolean; onPress: () => void;
}) {
  const tint = danger ? colors.expense : colors.textSecondary;
  return (
    <TouchableOpacity style={styles.quiet} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}. ${hint}`}>
      <Feather name={icon} size={16} color={tint} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.quietLabel, { color: tint }]}>{label}</Text>
        <Text style={styles.quietHint}>{hint}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  label: { ...type.label, color: colors.textSecondary, marginBottom: space.xs, marginTop: space.md },
  labelFirst: { ...type.label, color: colors.textSecondary, marginBottom: space.xs },
  hint: { ...type.caption, color: colors.textMuted },
  amountCard: { marginTop: space.lg, marginBottom: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.sm },
  submit: { marginTop: space.lg },
  danger: { marginTop: space.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.xs },
  quiet: { flexDirection: 'row', alignItems: 'center', gap: space.smd, minHeight: layout.touchMin, paddingVertical: space.sm },
  quietLabel: { ...type.labelSemi },
  quietHint: { ...type.caption, color: colors.textMuted },
});
