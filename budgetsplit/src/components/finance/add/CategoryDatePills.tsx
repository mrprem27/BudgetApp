import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format, isSameDay } from 'date-fns';
import { colors, type, space, radius } from '../../tokens';
import { asFeather } from '../../../constants/palette';
import { categoryVisual } from '../../../constants/categories';
import type { Category } from '../../../db/queries/categories';
import type { AddKind } from './KindToggle';
import { alpha } from '../../../theme';

type Props = {
  kind: AddKind;
  selectedCategory: Category | null;
  onCategory: () => void;
  txnDate: number;
  onDate: () => void;
};

/**
 * The Category (or "Reason" for transfers) + Date pill row shared across kinds.
 *
 * Refined: bigger tap targets (min 44pt), a subtle accent border when a
 * category is picked (reads as "filled" state), and a calendar icon on
 * the date pill so the field is scannable at a glance.
 */
export function CategoryDatePills({ kind, selectedCategory, onCategory, txnDate, onDate }: Props) {
  const catWord = kind === 'transfer' ? 'Reason' : 'Category';
  const isToday = isSameDay(new Date(txnDate), new Date());
  const catColor = selectedCategory?.color ?? colors.accent;

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.catPill, selectedCategory && { borderColor: alpha(catColor, 33) }]}
        activeOpacity={0.7}
        onPress={onCategory}
        accessibilityRole="button"
        accessibilityLabel={selectedCategory ? `${catWord}: ${selectedCategory.name}` : `Choose ${catWord.toLowerCase()}`}
      >
        {selectedCategory ? (
          <>
            <View style={[styles.dot, { backgroundColor: alpha(catColor, 13) }]}>
              <Feather name={asFeather(categoryVisual(selectedCategory.name).icon, 'tag')} size={14} color={catColor} />
            </View>
            <Text style={styles.catText}>{selectedCategory.name}</Text>
          </>
        ) : (
          <>
            <View style={styles.dotEmpty}>
              <Feather name="tag" size={14} color={colors.textMuted} />
            </View>
            <Text style={styles.catPlaceholder}>{catWord}</Text>
          </>
        )}
        <Feather name="chevron-down" size={14} color={colors.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.datePill}
        activeOpacity={0.7}
        onPress={onDate}
        accessibilityRole="button"
        accessibilityLabel={`Date: ${isToday ? 'Today' : format(new Date(txnDate), 'PPP')}`}
      >
        <Feather name="calendar" size={14} color={colors.textSecondary} />
        <Text style={styles.dateText}>
          {isToday ? 'Today' : format(new Date(txnDate), 'dd MMM')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
  catPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.bgCard,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bgCard,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  dotEmpty: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0, backgroundColor: colors.bgMuted },
  catText: { ...type.label, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', flex: 1 },
  catPlaceholder: { ...type.label, color: colors.textMuted, flex: 1 },
  dateText: { ...type.label, color: colors.textSecondary, fontFamily: 'Inter_600SemiBold' },
});
