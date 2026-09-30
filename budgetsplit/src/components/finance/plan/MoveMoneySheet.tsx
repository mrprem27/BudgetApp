import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, layout } from '../../tokens';
import { SheetModal } from '../../ui/SheetModal';
import { Card } from '../../ui/Card';
import { Divider } from '../../ui/Divider';
import { ListRow } from '../../ui/ListRow';
import { OptionRow } from '../../ui/OptionRow';
import { AmountRow } from '../../ui/AmountRow';
import { IconCircle } from '../../ui/IconCircle';
import { InfoLabel } from '../../ui/InfoLabel';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { formatCompact, formatRupees, parseToPaise } from '../../../lib/money';
import { ASSET_BUCKET, PayMethod, PAY_METHOD_LABEL, type AssetBucket } from '../../../constants/enums';
import { ASSET_KIND_ICON } from '../../../constants/assets';
import { PayMethodDisc } from '../pay/PayMethodGlyph';
import type { Asset, MoveEndpoint } from '../../../db/queries/assets';

const BUCKET_PAY: Record<AssetBucket, PayMethod> = { bank: PayMethod.Bank, cash: PayMethod.Cash, wallet: PayMethod.Wallet };

/** A stable key for an endpoint, for comparing and for React. */
export const endpointKey = (e: MoveEndpoint) => (e.kind === 'bucket' ? `b:${e.bucket}` : `a:${e.id}`);

type Place = {
  key: string;
  label: string;
  /** Held there now, when known (every asset; the three places only if the caller passes them). */
  balance?: number;
  icon?: React.ComponentProps<typeof Feather>['name'];
  method?: PayMethod;
  endpoint: MoveEndpoint;
};
type Side = 'from' | 'to';

/**
 * The one form for moving money: **from** any place you hold it, **to** any other —
 * bank, cash, wallet, or any asset in the register (however many there are).
 *
 * Buying gold, redeeming an FD, switching one asset into another and taking cash out of
 * the bank were four forms; they are one act. `moveMoney` owns what each combination
 * writes. Net worth is flat in every one.
 *
 * Laid out as the sentence it records (`U-57`): From, then To, then how much. It used to be
 * two sideways-scrolling chip strips, where anything past the third place was off-screen and
 * nothing said what each place held. Now each side is one row naming the place and what is in
 * it; tapping it opens the full list right there (a sheet inside a sheet fights over
 * `lib/sheetStage.ts`, so the list opens in place). Picking the place already chosen on the
 * other side swaps the two, and so does the ⇅ between them.
 */
export function MoveMoneySheet({
  visible, onClose, assets, bucketBalances, from: initialFrom, to: initialTo, busy, onMove,
}: {
  visible: boolean;
  onClose: () => void;
  /** The register. */
  assets: Pick<Asset, 'id' | 'name' | 'kind' | 'balance'>[];
  /** Today's balance in bank / cash / wallet, shown beside each when given. */
  bucketBalances?: Partial<Record<AssetBucket, number>>;
  /** What the sheet opens on. */
  from: MoveEndpoint;
  to: MoveEndpoint;
  busy?: boolean;
  onMove: (from: MoveEndpoint, to: MoveEndpoint, amountPaise: number) => void;
}) {
  const [from, setFrom] = useState<MoveEndpoint>(initialFrom);
  const [to, setTo] = useState<MoveEndpoint>(initialTo);
  const [amount, setAmount] = useState('');
  const [picking, setPicking] = useState<Side | null>(null);

  // Seed on open only — `assets` is rebuilt on every reload and must not blank a half-typed amount.
  const seed = useRef({ from: initialFrom, to: initialTo });
  seed.current = { from: initialFrom, to: initialTo };
  useEffect(() => {
    if (!visible) return;
    setFrom(seed.current.from); setTo(seed.current.to); setAmount(''); setPicking(null);
  }, [visible]);

  const places: Place[] = [
    ...ASSET_BUCKET.map((b): Place => ({
      key: `b:${b}`, label: PAY_METHOD_LABEL[BUCKET_PAY[b]], method: BUCKET_PAY[b],
      balance: bucketBalances?.[b], endpoint: { kind: 'bucket', bucket: b },
    })),
    ...assets.map((a): Place => ({
      key: `a:${a.id}`, label: a.name, icon: ASSET_KIND_ICON[a.kind], balance: a.balance, endpoint: { kind: 'asset', id: a.id },
    })),
  ];
  const find = (e: MoveEndpoint) => places.find(p => p.key === endpointKey(e));
  const fromPlace = find(from), toPlace = find(to);
  const fromAsset = from.kind === 'asset' ? assets.find(a => a.id === from.id) : undefined;

  const paise = parseToPaise(amount);
  const overdraw = !!fromAsset && paise > fromAsset.balance;
  const valid = paise > 0 && !overdraw && endpointKey(from) !== endpointKey(to) && !!fromPlace && !!toPlace;

  const pick = (side: Side, e: MoveEndpoint) => {
    if (side === 'from') { if (endpointKey(e) === endpointKey(to)) setTo(from); setFrom(e); }
    else { if (endpointKey(e) === endpointKey(from)) setFrom(to); setTo(e); }
    setPicking(null);
  };
  const swap = () => { setFrom(to); setTo(from); setPicking(null); };

  const disc = (p: Place | undefined, tint: string) => p?.method
    ? <PayMethodDisc method={p.method} size={layout.iconCircle} color={tint} />
    : <IconCircle icon={p?.icon ?? 'box'} size={layout.iconCircle} color={tint} />;

  const sideRow = (side: Side, p: Place | undefined) => (
    <ListRow
      variant="stacked"
      leading={disc(p, side === 'from' ? colors.expense : colors.income)}
      title={side === 'from' ? 'From' : 'To'}
      value={p ? `${p.label}${p.balance != null ? ` · ${formatCompact(p.balance)}` : ''}` : 'Choose'}
      chevron={false}
      onPress={() => setPicking(s => (s === side ? null : side))}
      accessibilityLabel={`${side === 'from' ? 'From' : 'To'} ${p?.label ?? 'not chosen'}. Change`}
    />
  );

  const list = (side: Side) => (
    <View style={styles.list}>
      {places.map(p => (
        <OptionRow
          key={p.key}
          label={p.label}
          description={p.balance != null ? `${formatCompact(p.balance)} here` : undefined}
          leading={disc(p, colors.textSecondary)}
          selected={p.key === endpointKey(side === 'from' ? from : to)}
          onPress={() => pick(side, p.endpoint)}
        />
      ))}
    </View>
  );

  const info = 'Money moving between two things you own: your net worth stays exactly where it is, and it is not spending, so no budget is touched.';

  return (
    <SheetModal visible={visible} onClose={onClose} title="Move money">
      <>
        <Card clip>
          {sideRow('from', fromPlace)}
          <View style={styles.swapRow}>
            <Divider indent="text" />
            <TouchableOpacity style={styles.swap} onPress={swap} hitSlop={10} accessibilityRole="button" accessibilityLabel="Swap from and to">
              <Feather name="repeat" size={14} color={colors.accent} style={styles.swapIcon} />
            </TouchableOpacity>
          </View>
          {sideRow('to', toPlace)}
        </Card>
        {picking && list(picking)}

        <Card clip style={styles.amountCard}>
          <AmountRow icon="arrow-right" label="Amount" value={amount} onChangeText={setAmount} autoFocus={!picking} />
        </Card>
        {overdraw && <Text style={styles.error}>{fromAsset?.name} only holds {formatRupees(fromAsset?.balance ?? 0)}.</Text>}

        <View style={styles.summary}>
          <InfoLabel
            label="Not spending · net worth unchanged"
            labelStyle={styles.summaryText}
            info={info}
            accessibilityLabel="About moving money"
          />
        </View>

        <PrimaryButton
          label={paise > 0 && fromPlace && toPlace ? `Move ${formatRupees(paise)} to ${toPlace.label}` : 'Move'}
          onPress={() => valid && onMove(from, to, paise)}
          disabled={!valid}
          loading={busy}
        />
      </>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  // The ⇅ sits on the hairline between From and To — the one place it plainly means "flip these".
  swapRow: { justifyContent: 'center' },
  swap: {
    position: 'absolute', right: space.md, alignSelf: 'flex-end',
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
  },
  swapIcon: { transform: [{ rotate: '90deg' }] },
  list: { gap: space.sm, marginTop: space.sm },
  amountCard: { marginTop: space.md },
  error: { ...type.caption, color: colors.expense, marginTop: space.xs },
  summary: { marginVertical: space.md },
  summaryText: { ...type.caption, color: colors.textMuted },
});
