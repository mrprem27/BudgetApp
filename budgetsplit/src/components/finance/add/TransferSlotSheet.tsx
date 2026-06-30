import React from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../../tokens';
import { formatRupees } from '../../../lib/money';
import { oweView } from '../../../lib/owe';
import { SheetModal } from '../../ui/SheetModal';
import { MemberAvatar } from '../MemberAvatar';
import type { Person } from '../../../db/queries/persons';

/**
 * Transfer "Who paid? / Who received?" person picker. Extracted from
 * app/add/quick.tsx; the parent owns from/to ids and the swap logic via onPick.
 */
export function TransferSlotSheet({
  slot, persons, me, fromId, toId, personNet, onClose, onPick,
}: {
  slot: 'from' | 'to' | null;
  persons: Person[];
  me: Person | null;
  fromId: string;
  toId: string;
  personNet: Record<string, number>;
  onClose: () => void;
  onPick: (personId: string) => void;
}) {
  return (
    <SheetModal visible={slot !== null} onClose={onClose} title={slot === 'from' ? 'Who paid?' : 'Who received?'} scroll={false}>
      {persons.map(p => {
        const active = slot === 'from' ? p.id === fromId : p.id === toId;
        const net = personNet[p.id] ?? 0;
        return (
          <TouchableOpacity
            key={p.id}
            style={[styles.groupPickerRow, active && styles.groupPickerRowActive]}
            onPress={() => onPick(p.id)}
            accessibilityRole="button"
          >
            <MemberAvatar name={p.name} color={p.avatar_color} size={36} imageUri={p.image_uri} />
            <Text style={styles.groupPickerName}>{p.id === me?.id ? `${p.name} (you)` : p.name}</Text>
            {p.id !== me?.id && net !== 0 && (() => {
              const ov = oweView(net);
              return <Text style={[styles.transferBal, { color: ov.color }]}>{ov.label} {formatRupees(ov.amount)}</Text>;
            })()}
            {active && <Feather name="check" size={18} color={colors.accent} />}
          </TouchableOpacity>
        );
      })}
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  groupPickerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm + 2, paddingHorizontal: space.sm, borderRadius: radius.md },
  groupPickerRowActive: { backgroundColor: colors.accentMuted },
  groupPickerName: { ...type.body, color: colors.textPrimary, flex: 1 },
  transferBal: { ...type.caption, fontFamily: 'Inter_600SemiBold', marginRight: space.xs },
});
