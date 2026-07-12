import React from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../tokens';
import { MemberAvatar } from './MemberAvatar';
import { formatRupees } from '../../lib/money';
import { haptic } from '../../lib/haptics';
import type { Person } from '../../db/queries/persons';
import type { TransferScopes } from '../../lib/settleScope';
import type { PayMethod } from '../../constants/enums';

const PAY_METHODS: { key: PayMethod; label: string; emoji: string }[] = [
  { key: 'upi',  label: 'UPI',  emoji: '📱' },
  { key: 'cash', label: 'Cash', emoji: '💵' },
  { key: 'bank', label: 'Bank', emoji: '🏦' },
];

type Props = {
  me: Person | null;
  persons: Person[];
  fromId: string;
  toId: string;
  onPickSlot: (slot: 'from' | 'to') => void;
  onSwap: () => void;
  scopes: TransferScopes | null;
  scope: 'all' | string;
  onScope: (s: 'all' | string) => void;
  payMethod: PayMethod;
  onPayMethod: (m: PayMethod) => void;
  note: string;
  onNote: (t: string) => void;
};

/** Transfer body for the Add modal's "Transfer" pill — any payer → any recipient.
 *  The transfer reason is a real 'transfer' category picked via the shared
 *  category pill in Quick Add (same UI as Expense/Income). */
export function TransferBody({ me, persons, fromId, toId, onPickSlot, onSwap, scopes, scope, onScope, payMethod, onPayMethod, note, onNote }: Props) {
  const from = persons.find(p => p.id === fromId) ?? null;
  const to = persons.find(p => p.id === toId) ?? null;
  const nameOf = (p: Person | null, fallback: string) => p ? (p.id === me?.id ? 'You' : p.name.split(' ')[0]) : fallback;

  const entry = scope === 'all' ? scopes?.all : scopes?.groups.find(g => g.groupId === scope);
  const bal = entry?.amount ?? 0;

  // Me-aware balance label (net-negative = "You owe"), consistent with the rest of
  // the app. The amount renders right-aligned beside it.
  let balLabel: string | null = null;
  let balColor: string = colors.settle;
  let plainHint = 'Pick who paid and who received';
  if (fromId && toId) {
    if (bal > 0 && entry) {
      const owerName = nameOf(persons.find(p => p.id === entry.from) ?? null, 'Someone');
      const oweeName = nameOf(persons.find(p => p.id === entry.to) ?? null, 'someone');
      if (entry.from === me?.id) { balLabel = `You owe ${oweeName}`; balColor = colors.expense; }
      else if (entry.to === me?.id) { balLabel = `${owerName} owes you`; balColor = colors.income; }
      else { balLabel = `${owerName} owes ${oweeName}`; balColor = colors.settle; }
    } else {
      plainHint = 'No balance between them — enter any amount';
    }
  }

  return (
    <View style={styles.wrap}>
      {balLabel ? (
        <View style={styles.balRow}>
          <Text style={[styles.balRowLabel, { color: balColor }]} numberOfLines={1}>{balLabel}</Text>
          <Text style={[styles.balRowAmt, { color: balColor }]}>{formatRupees(bal)}</Text>
        </View>
      ) : (
        <Text style={styles.hint}>{plainHint}</Text>
      )}

      {/* FROM → TO direction */}
      <View style={[styles.dirCard, !!fromId && !!toId && fromId === toId && styles.dirCardError]}>
        <TouchableOpacity style={styles.dirTile} onPress={() => onPickSlot('from')} accessibilityRole="button" accessibilityLabel="Choose who paid">
          <Text style={styles.dirLabel}>FROM</Text>
          <MemberAvatar name={from?.name ?? '?'} color={from?.avatar_color ?? colors.accent} size={52} imageUri={from?.image_uri} />
          <Text style={styles.dirName} numberOfLines={1}>{nameOf(from, 'Pick')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.swapBtn} hitSlop={10} onPress={() => { haptic.selection(); onSwap(); }} accessibilityRole="button" accessibilityLabel="Swap from and to">
          <Feather name="repeat" size={16} color={colors.settle} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.dirTile} onPress={() => onPickSlot('to')} accessibilityRole="button" accessibilityLabel="Choose who received">
          <Text style={styles.dirLabel}>TO</Text>
          <MemberAvatar name={to?.name ?? '?'} color={to?.avatar_color ?? colors.accent} size={52} imageUri={to?.image_uri} />
          <Text style={styles.dirName} numberOfLines={1}>{nameOf(to, 'Pick')}</Text>
        </TouchableOpacity>
      </View>
      {!!fromId && !!toId && fromId === toId && (
        <Text style={styles.errText}>From and To must be different people.</Text>
      )}

      {/* Group scope — All + each group both belong to */}
      {!!fromId && !!toId && (scopes?.groups.length ?? 0) > 0 && (
        <>
          <Text style={styles.label}>GROUP</Text>
          <View style={styles.scopeRow}>
            <ScopeChip label="All groups" amount={scopes?.all?.amount ?? 0} active={scope === 'all'} onPress={() => onScope('all')} />
            {scopes!.groups.map(g => (
              <ScopeChip key={g.groupId} label={g.name} amount={g.amount} active={scope === g.groupId} onPress={() => onScope(g.groupId)} />
            ))}
          </View>
        </>
      )}

      {/* How was it paid? */}
      <Text style={styles.label}>HOW WAS IT PAID?</Text>
      <View style={styles.methodRow}>
        {PAY_METHODS.map(m => (
          <TouchableOpacity
            key={m.key}
            style={[styles.methodTile, payMethod === m.key && styles.methodTileActive]}
            onPress={() => { haptic.selection(); onPayMethod(m.key); }}
            accessibilityRole="button"
            accessibilityState={{ selected: payMethod === m.key }}
          >
            <Text style={styles.methodEmoji}>{m.emoji}</Text>
            <Text style={[styles.methodLabel, payMethod === m.key && styles.methodLabelActive]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>NOTES</Text>
      <TextInput
        style={styles.noteInput}
        value={note}
        onChangeText={onNote}
        placeholder="Add a note (optional)"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Transfer notes"
        maxLength={80}
      />
    </View>
  );
}

function ScopeChip({ label, amount, active, onPress }: { label: string; amount?: number; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.scopeChip, active && styles.scopeChipActive]} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }}>
      <Text style={[styles.scopeChipText, active && styles.scopeChipTextActive]}>
        {label}{amount && amount > 0 ? ` · ${formatRupees(amount)}` : ''}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  hint: { ...type.label, color: colors.textMuted, textAlign: 'center', marginBottom: space.xs },
  balRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, backgroundColor: colors.bgMuted, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, marginBottom: space.xs },
  balRowLabel: { ...type.label, fontFamily: 'Inter_600SemiBold', flexShrink: 1 },
  balRowAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 15, flexShrink: 0 },
  label: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Inter_600SemiBold', marginTop: space.sm },
  dirCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md },
  dirCardError: { borderColor: colors.expense, borderWidth: 1.5 },
  dirTile: { flex: 1, alignItems: 'center', gap: space.xs },
  dirLabel: { ...type.caption, color: colors.textMuted, letterSpacing: 0.5, fontFamily: 'Inter_600SemiBold' },
  dirName: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  swapBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.settle + '22', alignItems: 'center', justifyContent: 'center', marginHorizontal: space.sm },
  errText: { ...type.caption, color: colors.expense, textAlign: 'center' },
  scopeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  scopeChip: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.bgMuted, borderWidth: 1, borderColor: colors.border },
  scopeChipActive: { backgroundColor: colors.settle, borderColor: colors.settle },
  scopeChipText: { ...type.label, color: colors.textSecondary },
  scopeChipTextActive: { color: colors.bg, fontFamily: 'Inter_600SemiBold' },
  methodRow: { flexDirection: 'row', gap: space.sm },
  methodTile: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: space.sm, borderRadius: radius.md, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  methodTileActive: { borderColor: colors.settle, backgroundColor: colors.settle + '22' },
  methodEmoji: { fontSize: 20 },
  methodLabel: { ...type.label, color: colors.textSecondary },
  methodLabelActive: { color: colors.settle, fontFamily: 'Inter_600SemiBold' },
  noteInput: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border, marginTop: space.xs },
});
