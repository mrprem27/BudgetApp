import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../../tokens';
import { SheetModal } from '../../ui/SheetModal';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { formatRupees } from '../../../lib/money';
import type { RecurringCandidate } from '../../../lib/recurringSuggest';

/**
 * Confirms which just-detected candidates to actually turn into recurring
 * rules — detection only suggests, this is the explicit user action that
 * creates anything. All candidates start selected (the common case is "yes,
 * these are all bills"), any can be unchecked.
 */
export function RecurringSuggestionsSheet({
  visible,
  onClose,
  candidates,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  candidates: RecurringCandidate[];
  onConfirm: (selected: RecurringCandidate[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Re-seed to "all selected" whenever the sheet opens with a fresh candidate set.
  useEffect(() => {
    if (visible) setSelected(new Set(candidates.map(c => c.key)));
  }, [visible, candidates]);

  function toggle(key: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const chosen = candidates.filter(c => selected.has(c.key));

  return (
    <SheetModal visible={visible} onClose={onClose} title="Looks recurring?">
      <Text style={styles.intro}>
        These showed up {candidates.length === 1 ? 'once' : 'more than once'} at a similar amount,
        roughly a month apart. Turn any of these into a tracked recurring bill.
      </Text>
      {candidates.map(c => {
        const checked = selected.has(c.key);
        return (
          <TouchableOpacity
            key={c.key}
            style={[styles.row, checked && styles.rowOn]}
            onPress={() => toggle(c.key)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
          >
            <Feather name={checked ? 'check-circle' : 'circle'} size={20} color={checked ? colors.accent : colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>{c.description}</Text>
              <Text style={styles.rowSub}>{c.category} · seen {c.occurrences}x</Text>
            </View>
            <Text style={styles.rowAmount}>{formatRupees(c.amountPaise)}</Text>
          </TouchableOpacity>
        );
      })}
      <PrimaryButton
        label={chosen.length === 0 ? 'Select at least one' : `Create ${chosen.length} rule${chosen.length === 1 ? '' : 's'}`}
        onPress={() => onConfirm(chosen)}
        disabled={chosen.length === 0}
        style={styles.button}
      />
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  intro: { ...type.caption, color: colors.textSecondary, lineHeight: 18, marginBottom: space.md },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    paddingVertical: space.smd, paddingHorizontal: space.sm,
    borderRadius: radius.md, marginBottom: space.xs,
  },
  rowOn: { backgroundColor: colors.bgMuted },
  rowTitle: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  rowSub: { ...type.caption, color: colors.textMuted, marginTop: 1 },
  rowAmount: { fontFamily: 'SpaceMono_400Regular', fontSize: 14, color: colors.textPrimary },
  button: { marginTop: space.sm },
});
