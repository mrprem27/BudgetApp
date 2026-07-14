import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format, isSameDay } from 'date-fns';
import { colors, space } from '../../tokens';
import { asFeather } from '../../../constants/palette';
import { categoryVisual } from '../../../constants/categories';
import type { Category } from '../../../db/queries/categories';
import type { AddKind } from './KindToggle';

type Props = {
  kind: AddKind;
  selectedCategory: Category | null;
  onCategory: () => void;
  txnDate: number;
  onDate: () => void;
};

/** The Category (or "Reason" for transfers) + Date pill row shared across kinds. */
export function CategoryDatePills({ kind, selectedCategory, onCategory, txnDate, onDate }: Props) {
  const catWord = kind === 'transfer' ? 'Reason' : 'Category';
  return (
    <View style={styles.pillsRow}>
      <TouchableOpacity
        style={styles.catPill}
        onPress={onCategory}
        accessibilityRole="button"
        accessibilityLabel={selectedCategory ? `${catWord}: ${selectedCategory.name}` : `Choose ${catWord.toLowerCase()}`}
      >
        {selectedCategory ? (
          <>
            <View style={[styles.catPillDot, { backgroundColor: (selectedCategory.color ?? colors.accent) + '22' }]}>
              <Feather name={asFeather(categoryVisual(selectedCategory.name).icon, 'tag')} size={13} color={selectedCategory.color ?? colors.accent} />
            </View>
            <Text style={styles.catPillText}>{selectedCategory.name}</Text>
          </>
        ) : (
          <Text style={styles.catPillPlaceholder}>{catWord}</Text>
        )}
        <Feather name="chevron-down" size={12} color={colors.textMuted} style={{ marginLeft: 'auto' }} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.datePill} onPress={onDate} accessibilityRole="button" accessibilityLabel="Date">
        <Text style={styles.datePillText}>
          {isSameDay(new Date(txnDate), new Date()) ? 'Today' : format(new Date(txnDate), 'dd MMM')}
        </Text>
        <Feather name="chevron-down" size={12} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  pillsRow: { flexDirection: 'row', gap: space.sm },
  catPill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.bgCard, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: colors.border },
  catPillDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  catPillText: { fontSize: 13, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', flex: 1 },
  catPillPlaceholder: { fontSize: 13, color: colors.textMuted, flex: 1 },
  datePill: { flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: colors.bgCard, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: colors.border },
  datePillText: { fontSize: 13, color: colors.textSecondary, fontFamily: 'Inter_400Regular' },
});
