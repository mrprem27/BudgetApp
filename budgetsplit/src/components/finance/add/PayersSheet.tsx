import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { colors, type, space, radius } from '../../tokens';
import { formatRupees, paiseToInput } from '../../../lib/money';
import { SheetModal } from '../../ui/SheetModal';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { MemberAvatar } from '../MemberAvatar';
import type { Person } from '../../../db/queries/persons';

/**
 * "Who paid?" bottom sheet — set how much each member paid (multi-payer). Extracted
 * from app/add/quick.tsx; presentational (parent owns payerAmounts + the remainder).
 */
export function PayersSheet({
  visible, onClose, members, me, payerAmounts, setPayerAmounts, total, paymentRemainder,
}: {
  visible: boolean;
  onClose: () => void;
  members: Person[];
  me: Person | null;
  payerAmounts: Record<string, string>;
  setPayerAmounts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  total: number;
  paymentRemainder: number;
}) {
  return (
    <SheetModal visible={visible} onClose={onClose} title="Who paid?">
      {/* One person paying is the common case, so it is one tap on them (`U-67`). It used to mean
          typing the whole total into their field, with a shortcut only for "I paid". Amounts are
          for when several people chipped in. */}
      <Text style={styles.payerHint}>Tap who paid the whole bill, or type what each person paid.</Text>
      {members.map(m => {
        const soleIsThem = paiseToInput(total) === (payerAmounts[m.id] ?? '')
          && Object.entries(payerAmounts).every(([id, v]) => id === m.id || !v || v === '0');
        return (
        <View key={m.id} style={styles.payerSheetRow}>
          <TouchableOpacity
            style={styles.payerWho}
            onPress={() => setPayerAmounts({ [m.id]: paiseToInput(total) })}
            accessibilityRole="button"
            accessibilityLabel={`${m.name} paid the whole bill`}
            accessibilityState={{ selected: soleIsThem }}
          >
            <MemberAvatar name={m.name} color={m.avatar_color} size={36} imageUri={m.image_uri} selected={soleIsThem} />
            <Text style={styles.payerSheetName} numberOfLines={1}>{m.name}{m.is_me ? ' (you)' : ''}</Text>
          </TouchableOpacity>
          <View style={styles.payerInputWrap}>
            <Text style={styles.payerRupee}>₹</Text>
            <TextInput
              style={styles.payerSheetInput}
              value={payerAmounts[m.id] ?? ''}
              onChangeText={v => setPayerAmounts(prev => ({ ...prev, [m.id]: v }))}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
            />
          </View>
        </View>
        );
      })}
      <View style={styles.remainderBar}>
        <Text style={[styles.remainderText, { color: paymentRemainder === 0 ? colors.income : colors.expense }]}>
          {paymentRemainder === 0 ? 'Balanced' : paymentRemainder > 0 ? `${formatRupees(paymentRemainder)} left to assign` : `${formatRupees(-paymentRemainder)} over`}
        </Text>
      </View>
      <PrimaryButton label="Done" onPress={onClose} disabled={paymentRemainder !== 0} />
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  payerHint: { ...type.caption, color: colors.textMuted },
  payerSheetRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  payerWho: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  payerSheetName: { ...type.body, color: colors.textPrimary, flex: 1 },
  payerInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgInput, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.sm, minWidth: 100 },
  payerRupee: { ...type.body, color: colors.textMuted },
  payerSheetInput: { ...type.body, color: colors.textPrimary, flex: 1, textAlign: 'right', paddingVertical: space.sm, paddingLeft: 2 },
  remainderBar: { paddingVertical: space.sm, alignItems: 'center', borderTopWidth: 1, borderColor: colors.border },
  remainderText: { ...type.labelSemi },
});
