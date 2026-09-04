import React from 'react';
import { Feather } from '@expo/vector-icons';
import { SheetModal } from '../../ui/SheetModal';
import { Card } from '../../ui/Card';
import { Divider } from '../../ui/Divider';
import { ListRow } from '../../ui/ListRow';
import { EmptyState } from '../../ui/EmptyState';
import { colors } from '../../tokens';
import { formatRupees } from '../../../lib/money';
import { asFeather } from '../../../constants/palette';
import type { Asset } from '../../../db/queries/assets';

type Props = {
  visible: boolean;
  onClose: () => void;
  assets: Asset[];
  value: string | null;
  onSelect: (assetId: string) => void;
  /** Kind colour, so the selected row matches the form behind it. */
  accent?: string;
};

/**
 * Where an investment lands — the asset register, as a picker.
 *
 * A list, not a strip of tiles, for the same reason `PayMethodSelector` is one:
 * every option is visible at once and the row is the app's standard shape. Each
 * shows its current balance, because "which of my two SIPs is this" is answered by
 * the number as often as by the name.
 *
 * ## The empty state is the interesting case
 *
 * A fresh install has no assets, and this sheet has no business creating one — you
 * opened a picker, you did not ask for a new holding. So it says so and points at
 * the register. The **save** path mints a default instead
 * (`useAddTxnForm.handleSaveInvest` → `defaultInvestmentAsset`), because by then
 * you have asked: an amount and a tap on Save is an unambiguous request to record
 * an investment somewhere.
 */
export function AssetPickerSheet({ visible, onClose, assets, value, onSelect, accent = colors.settle }: Props) {
  return (
    <SheetModal visible={visible} onClose={onClose} title="Into which asset?">
      {assets.length === 0 ? (
        <EmptyState
          icon="trending-up"
          title="No assets yet"
          body="An investment needs somewhere to land — a fund, gold, an FD. Save this and we'll start one called Investments, or set them up first in Plan → Assets."
        />
      ) : (
        <Card clip>
          {assets.map((a, i) => {
            const on = a.id === value;
            return (
              <React.Fragment key={a.id}>
                {i > 0 && <Divider indent="text" />}
                <ListRow
                  icon={asFeather(a.icon, 'trending-up')}
                  iconColor={on ? accent : colors.textSecondary}
                  title={a.name}
                  subtitle={formatRupees(a.balance)}
                  chevron={false}
                  selected={on}
                  value={on ? <Feather name="check" size={18} color={accent} /> : undefined}
                  onPress={() => { onSelect(a.id); onClose(); }}
                />
              </React.Fragment>
            );
          })}
        </Card>
      )}
    </SheetModal>
  );
}
