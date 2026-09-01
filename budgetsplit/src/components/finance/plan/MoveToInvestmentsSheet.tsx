import React, { useEffect, useRef, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { SheetModal } from '../../ui/SheetModal';
import { Input } from '../../ui/Input';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { TabPills } from '../../ui/TabPills';
import { colors, type, space } from '../../tokens';
import { parseToPaise, formatCompact } from '../../../lib/money';
import { ASSET_BUCKET, PayMethod } from '../../../constants/enums';

/** Which bucket the money leaves. Mapped to the pay method the ledger records. */
const FROM_TABS = ASSET_BUCKET.map(b => ({ key: b, label: b[0].toUpperCase() + b.slice(1) }));
const AS_PAY_METHOD: Record<string, PayMethod> = {
  bank: PayMethod.Bank, cash: PayMethod.Cash, wallet: PayMethod.Wallet,
};

/**
 * Record money moved into an asset, from the Plan card.
 *
 * The mirror of `PayCardBillSheet`, deliberately — same question, same controls,
 * opposite direction. Buying an SIP used to be logged as an **expense**, which ate
 * a budget it had no business eating and dropped net worth by the amount when it
 * should have stayed flat. This writes a transfer instead: out of one bucket, into
 * an asset, net worth unchanged.
 *
 * It NAMES the destination, and it has to. Before the register there was one
 * "investments" figure and nowhere else the money could go; now a user whose
 * register is Gold and an FD would otherwise tap this and silently gain a third
 * row called "Investments", because that is what `defaultInvestmentAsset` mints
 * when it cannot find one. With more than one asset this asks; with none it says
 * which one it is about to create.
 */
export function MoveToInvestmentsSheet({
  visible, onClose, cashAvailable, assets, onMove,
}: {
  visible: boolean;
  onClose: () => void;
  /** Shown as the sanity check — this is money leaving, not appearing. */
  cashAvailable: number;
  /** The register. Empty is normal on a new install. */
  assets: { id: string; name: string }[];
  onMove: (amountPaise: number, from: PayMethod, assetId: string | null) => void;
}) {
  const [amount, setAmount] = useState('');
  const [from, setFrom] = useState<string>('bank');
  const [assetId, setAssetId] = useState<string | null>(null);
  /*
   * Keyed on `visible` ALONE. `assets` is rebuilt on every loader result — and
   * `useSavingsTab` reloads on focus and on any cross-screen write — so having it
   * in the deps meant a background refresh blanked the amount somebody was
   * halfway through typing and reset the destination under them. Read through a
   * ref so the seed still uses the current list without depending on its identity.
   */
  const assetsRef = useRef(assets);
  assetsRef.current = assets;
  useEffect(() => {
    if (!visible) return;
    setAmount(''); setFrom('bank');
    setAssetId(assetsRef.current[0]?.id ?? null);
  }, [visible]);

  const paise = parseToPaise(amount);
  const target = assets.find(a => a.id === assetId) ?? null;

  return (
    <SheetModal visible={visible} onClose={onClose} title="Moved to an asset">
      <Text style={styles.hint}>
        This is money moving, not money spent — so it leaves your cash and lands in
        {target ? ` ${target.name}` : ' an asset'}, and your net worth stays where it is.
      </Text>
      <Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="₹0" autoFocus accessibilityLabel="Amount" />

      {assets.length > 1 && (
        <>
          <Text style={styles.label}>Into</Text>
          <TabPills
            tabs={assets.map(a => ({ key: a.id, label: a.name }))}
            active={assetId ?? assets[0].id}
            onChange={setAssetId}
            size="sm"
          />
        </>
      )}
      {assets.length === 0 && (
        <Text style={styles.hint}>
          You have no assets yet, so this creates one called “Investments”. Add gold, a
          flat or an FD on the Assets screen to keep them apart.
        </Text>
      )}

      <Text style={styles.label}>Out of</Text>
      <TabPills tabs={FROM_TABS} active={from} onChange={setFrom} size="sm" />
      <Text style={styles.hint}>{formatCompact(cashAvailable)} available across your buckets.</Text>

      <PrimaryButton
        label="Record it"
        onPress={() => onMove(paise, AS_PAY_METHOD[from], assetId)}
        disabled={paise <= 0}
        style={styles.cta}
      />
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  label: { ...type.caption, color: colors.textSecondary, marginTop: space.md, marginBottom: space.xs },
  hint: { ...type.caption, color: colors.textSecondary, marginTop: space.sm },
  cta: { marginTop: space.md },
});
