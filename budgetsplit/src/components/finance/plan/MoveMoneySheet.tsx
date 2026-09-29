import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space } from '../../tokens';
import { SheetModal } from '../../ui/SheetModal';
import { Input } from '../../ui/Input';
import { Chip } from '../../ui/Chip';
import { InfoLabel } from '../../ui/InfoLabel';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { formatRupees, parseToPaise } from '../../../lib/money';
import { ASSET_BUCKET, PayMethod, PAY_METHOD_ICON, PAY_METHOD_LABEL, type AssetBucket } from '../../../constants/enums';
import { ASSET_KIND_ICON } from '../../../constants/assets';
import type { Asset, MoveEndpoint } from '../../../db/queries/assets';

const BUCKET_PAY: Record<AssetBucket, PayMethod> = { bank: PayMethod.Bank, cash: PayMethod.Cash, wallet: PayMethod.Wallet };

/** A stable key for an endpoint, for comparing and for React. */
export const endpointKey = (e: MoveEndpoint) => (e.kind === 'bucket' ? `b:${e.bucket}` : `a:${e.id}`);

type Place = { key: string; label: string; icon: React.ComponentProps<typeof Feather>['name']; endpoint: MoveEndpoint };

/**
 * The one form for moving money: **from** any place you hold it, **to** any other —
 * bank, cash, wallet, or any asset in the register (however many there are).
 *
 * Buying gold, redeeming an FD, switching one asset into another and taking cash out of
 * the bank were four forms; they are one act. `moveMoney` owns what each combination
 * writes. Net worth is flat in every one.
 *
 * Picking the place already chosen on the other side swaps the two, rather than
 * refusing — the way you'd fix "oops, backwards" without thinking about it. The ⇅
 * button does the same on purpose.
 */
export function MoveMoneySheet({
  visible, onClose, assets, from: initialFrom, to: initialTo, busy, onMove,
}: {
  visible: boolean;
  onClose: () => void;
  /** The register. */
  assets: Pick<Asset, 'id' | 'name' | 'kind' | 'balance'>[];
  /** What the sheet opens on. */
  from: MoveEndpoint;
  to: MoveEndpoint;
  busy?: boolean;
  onMove: (from: MoveEndpoint, to: MoveEndpoint, amountPaise: number) => void;
}) {
  const [from, setFrom] = useState<MoveEndpoint>(initialFrom);
  const [to, setTo] = useState<MoveEndpoint>(initialTo);
  const [amount, setAmount] = useState('');

  // Seed on open only — `assets` is rebuilt on every reload and must not blank a half-typed amount.
  const seed = useRef({ from: initialFrom, to: initialTo });
  seed.current = { from: initialFrom, to: initialTo };
  useEffect(() => {
    if (!visible) return;
    setFrom(seed.current.from); setTo(seed.current.to); setAmount('');
  }, [visible]);

  const places: Place[] = [
    ...ASSET_BUCKET.map((b): Place => ({
      key: `b:${b}`, label: PAY_METHOD_LABEL[BUCKET_PAY[b]], icon: PAY_METHOD_ICON[BUCKET_PAY[b]], endpoint: { kind: 'bucket', bucket: b },
    })),
    ...assets.map((a): Place => ({ key: `a:${a.id}`, label: a.name, icon: ASSET_KIND_ICON[a.kind], endpoint: { kind: 'asset', id: a.id } })),
  ];
  const find = (e: MoveEndpoint) => places.find(p => p.key === endpointKey(e));
  const fromPlace = find(from), toPlace = find(to);
  const fromAsset = from.kind === 'asset' ? assets.find(a => a.id === from.id) : undefined;

  const paise = parseToPaise(amount);
  const overdraw = !!fromAsset && paise > fromAsset.balance;
  const valid = paise > 0 && !overdraw && endpointKey(from) !== endpointKey(to) && !!fromPlace && !!toPlace;

  const pickFrom = (e: MoveEndpoint) => { if (endpointKey(e) === endpointKey(to)) setTo(from); setFrom(e); };
  const pickTo = (e: MoveEndpoint) => { if (endpointKey(e) === endpointKey(from)) setFrom(to); setTo(e); };
  const swap = () => { setFrom(to); setTo(from); };

  const row = (label: string, current: MoveEndpoint, pick: (e: MoveEndpoint) => void) => (
    <View>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
        {places.map(p => (
          <Chip
            key={p.key}
            label={p.label}
            icon={p.icon}
            maxWidth={170}
            selected={p.key === endpointKey(current)}
            onPress={() => pick(p.endpoint)}
          />
        ))}
      </ScrollView>
    </View>
  );

  const both = `${fromPlace?.label ?? '—'} → ${toPlace?.label ?? '—'}`;
  const info = 'Money moving between two things you own — your net worth stays exactly where it is, and it is not spending, so no budget is touched.';

  return (
    <SheetModal visible={visible} onClose={onClose} title="Move money">
      <>
        {row('From', from, pickFrom)}

        <TouchableOpacity style={styles.swap} onPress={swap} hitSlop={10} accessibilityRole="button" accessibilityLabel="Swap from and to">
          <Feather name="repeat" size={16} color={colors.accent} style={styles.swapIcon} />
        </TouchableOpacity>

        {row('To', to, pickTo)}

        <Text style={styles.label}>Amount</Text>
        <Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="₹0" autoFocus accessibilityLabel="Amount to move" />
        {overdraw && <Text style={styles.error}>{fromAsset?.name} only holds {formatRupees(fromAsset?.balance ?? 0)}.</Text>}

        <View style={styles.summary}>
          <InfoLabel label={both} labelStyle={styles.summaryText} info={info} accessibilityLabel="About moving money" />
        </View>

        <PrimaryButton
          label={paise > 0 ? `Move ${formatRupees(paise)}` : 'Move'}
          onPress={() => valid && onMove(from, to, paise)}
          disabled={!valid}
          loading={busy}
        />
      </>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  label: { ...type.label, color: colors.textSecondary, marginBottom: space.xs, marginTop: space.sm },
  chips: { flexDirection: 'row', gap: space.sm, paddingRight: space.md },
  swap: { alignSelf: 'center', marginTop: space.xs },
  swapIcon: { transform: [{ rotate: '90deg' }] },
  error: { ...type.caption, color: colors.expense, marginTop: space.xs },
  summary: { marginVertical: space.md },
  summaryText: { ...type.label, color: colors.textSecondary },
});
