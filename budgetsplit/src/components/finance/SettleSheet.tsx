import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../tokens';
import { MemberAvatar } from './MemberAvatar';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SheetModal } from '../ui/SheetModal';
import { parseToPaise, formatRupees } from '../../lib/money';
import { CURRENCY_MAP, DEFAULT_CURRENCY } from '../../constants/currencies';
import type { Person } from '../../db/queries/persons';

// Settlement amounts are formatted with formatRupees (DEFAULT_CURRENCY); source
// the input adornment from the same place rather than a hardcoded glyph.
const CURRENCY_SYMBOL = CURRENCY_MAP[DEFAULT_CURRENCY].symbol;

type Props = {
  visible: boolean;
  from: Person | null;
  to: Person | null;
  /** Outstanding amount in paise — pre-filled and editable (partial allowed). */
  outstanding: number;
  onClose: () => void;
  onConfirm: (amountPaise: number) => void;
};

/**
 * Records a payment from one person to another. The outstanding balance is
 * pre-filled but editable, so partial settlements are supported.
 */
export function SettleSheet({ visible, from, to, outstanding, onClose, onConfirm }: Props) {
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (visible) setAmount((outstanding / 100).toString());
  }, [visible, outstanding]);

  const paise = parseToPaise(amount);
  const over = paise > outstanding;
  const valid = paise > 0 && !over;

  return (
    <SheetModal visible={visible} onClose={onClose} title="Record payment">
      {from && to && (
        <View style={styles.who}>
          <View style={styles.person}>
            <MemberAvatar name={from.name} color={from.avatar_color} size={40} imageUri={from.image_uri} />
            <Text style={styles.personName} numberOfLines={1}>{from.name}</Text>
          </View>
          <Feather name="arrow-right" size={18} color={colors.textMuted} />
          <View style={styles.person}>
            <MemberAvatar name={to.name} color={to.avatar_color} size={40} imageUri={to.image_uri} />
            <Text style={styles.personName} numberOfLines={1}>{to.name}</Text>
          </View>
        </View>
      )}

      <Text style={styles.label}>Amount</Text>
      <View style={styles.amountWrap}>
        <Text style={styles.rupee}>{CURRENCY_SYMBOL}</Text>
        <TextInput
          style={styles.amountInput}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          autoFocus
          selectTextOnFocus
        />
      </View>

      <Text style={[styles.hint, over && { color: colors.expense }]}>
        {over ? `Can't exceed the ${formatRupees(outstanding)} outstanding` : `Outstanding: ${formatRupees(outstanding)}`}
      </Text>

      {/* Before → after balance preview, so the impact is obvious. */}
      {from && to && valid && (
        <View style={styles.preview}>
          <View style={styles.previewCol}>
            <Text style={styles.previewLabel}>Now</Text>
            <Text style={styles.previewBefore}>{from.name} owes {formatRupees(outstanding)}</Text>
          </View>
          <Feather name="arrow-right" size={16} color={colors.textMuted} />
          <View style={styles.previewCol}>
            <Text style={styles.previewLabel}>After</Text>
            <Text style={[styles.previewAfter, { color: outstanding - paise <= 0 ? colors.income : colors.textPrimary }]}>
              {outstanding - paise <= 0 ? 'Settled up' : `owes ${formatRupees(outstanding - paise)}`}
            </Text>
          </View>
        </View>
      )}

      <PrimaryButton label="Record Payment" onPress={() => onConfirm(paise)} disabled={!valid} />
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  who: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.lg, paddingVertical: space.sm },
  person: { alignItems: 'center', gap: space.xs, maxWidth: 120 },
  personName: { ...type.label, color: colors.textPrimary },
  label: { ...type.label, color: colors.textSecondary },
  amountWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgInput, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md },
  rupee: { ...type.amountLG, color: colors.textMuted },
  amountInput: { ...type.amountLG, color: colors.textPrimary, flex: 1, paddingVertical: space.md, paddingLeft: space.xs },
  hint: { ...type.caption, color: colors.textMuted },
  preview: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, backgroundColor: colors.bgInput, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.md },
  previewCol: { flex: 1, gap: 2 },
  previewLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  previewBefore: { ...type.label, color: colors.textSecondary },
  previewAfter: { ...type.label, fontFamily: 'Inter_600SemiBold' },
});

