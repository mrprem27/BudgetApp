import React from 'react';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SheetModal } from '../../ui/SheetModal';
import { Card } from '../../ui/Card';
import { ListRow } from '../../ui/ListRow';
import { Divider } from '../../ui/Divider';
import { AmountText } from '../../ui/AmountText';
import { colors, layout } from '../../tokens';
import type { TransferScopes } from '../../../lib/settleScope';
import { TRANSFER_SCOPE_ALL, type TransferScope } from '../../../constants/enums';

type Props = {
  visible: boolean;
  onClose: () => void;
  scopes: TransferScopes | null;
  scope: TransferScope;
  onSelect: (s: TransferScope) => void;
  /** Tint for the selected check. Defaults to `colors.settle` — a scope only exists
   *  on a transfer, so that is already the screen's kind colour. */
  accent?: string;
};

/**
 * Which debt this settlement is paying down.
 *
 * Not the same question as an expense's destination, even though it looks like a
 * group picker: each option carries its own outstanding amount, and picking one
 * changes what you owe. That's why the amounts are on the rows — the choice is
 * meaningless without them.
 *
 * Replaces a wrapping row of `ScopeChip`s buried inside `TransferBody`, so the
 * screen has one control for "what is this about" instead of two in two places.
 */
export function ScopeSheet({ visible, onClose, scopes, scope, onSelect, accent = colors.settle }: Props) {
  const rows: { key: TransferScope; name: string; amount: number }[] = [
    { key: TRANSFER_SCOPE_ALL, name: 'All groups', amount: scopes?.all?.amount ?? 0 },
    ...(scopes?.groups ?? []).map(g => ({ key: g.groupId, name: g.name, amount: g.amount })),
  ];

  return (
    <SheetModal visible={visible} onClose={onClose} title="What are you settling?">
      <Card clip>
        {rows.map((r, i) => {
          const active = r.key === scope;
          return (
            <View key={r.key}>
              {i > 0 && <Divider indent="text" />}
              <ListRow
                icon={r.key === TRANSFER_SCOPE_ALL ? 'layers' : 'users'}
                iconColor={accent}
                title={r.name}
                value={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <AmountText paise={r.amount} size="sm" forceColor={colors.textSecondary} rounded />
                    {active && <Feather name="check" size={18} color={accent} />}
                  </View>
                }
                chevron={false}
                selected={active}
                onPress={() => { onClose(); if (!active) onSelect(r.key); }}
                accessibilityLabel={r.name}
              />
            </View>
          );
        })}
      </Card>
    </SheetModal>
  );
}
