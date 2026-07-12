import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../../tokens';
import { formatRupees } from '../../../lib/money';
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
      <Text style={styles.payerHint}>Set how much each person paid. Leave others blank.</Text>
      {members.map(m => (
        <View key={m.id} style={styles.payerSheetRow}>
          <MemberAvatar name={m.name} color={m.avatar_color} size={36} imageUri={m.image_uri} />
          <Text style={styles.payerSheetName} numberOfLines={1}>{m.name}{m.is_me ? ' (you)' : ''}</Text>
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
      ))}
      <TouchableOpacity
        style={styles.payerQuickBtn}
        onPress={() => me && setPayerAmounts({ [me.id]: (total / 100).toString() })}
        accessibilityRole="button"
      >
        <Feather name="user" size={14} color={colors.accent} />
        <Text style={styles.payerQuickText}>I paid the whole bill</Text>
      </TouchableOpacity>
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
  payerSheetName: { ...type.body, color: colors.textPrimary, flex: 1 },
  payerInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgInput, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.sm, minWidth: 100 },
  payerRupee: { ...type.body, color: colors.textMuted },
  payerSheetInput: { ...type.body, color: colors.textPrimary, flex: 1, textAlign: 'right', paddingVertical: space.sm, paddingLeft: 2 },
  payerQuickBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingVertical: space.sm, borderRadius: radius.md, backgroundColor: colors.accentMuted },
  payerQuickText: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  remainderBar: { paddingVertical: space.sm, alignItems: 'center', borderTopWidth: 1, borderColor: colors.border },
  remainderText: { ...type.label, fontFamily: 'Inter_600SemiBold' },
});
