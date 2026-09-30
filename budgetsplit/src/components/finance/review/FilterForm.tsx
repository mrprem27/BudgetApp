import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { colors, type, space, radius } from '../../tokens';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { Chip } from '../../ui/Chip';
import { shortDate } from '../../../lib/dateFormat';
import { parseFilterDate, type ReviewFilters } from '../../../lib/reviewFilter';
import { reviewFormStyles as f } from './FChip';

/** "Any category" / "Food" / "Food +2" — one line, whatever is selected. */
function categoryLabel(cats: string[]): string {
  if (cats.length === 0) return 'Any category';
  return cats.length === 1 ? cats[0] : `${cats[0]} +${cats.length - 1}`;
}

/** "Any date" / "12 Jun – 20 Jun" / "From 12 Jun" / "Until 20 Jun". */
function dateLabel(from: string, to: string): string {
  const a = parseFilterDate(from, false), b = parseFilterDate(to, true);
  if (a == null && b == null) return 'Any date';
  if (a != null && b != null) return `${shortDate(a)} – ${shortDate(b)}`;
  return a != null ? `From ${shortDate(a)}` : `Until ${shortDate(b!)}`;
}

/**
 * The Review inbox filter form: name, category, amount and date — each one line.
 *
 * - **Category** and **date** are a chip that opens a picker (searchable list; one
 *   calendar you tap twice), not a wall of chips and two date fields.
 * - **Amount** is two boxes, Min and Max: empty is no filter, one is "at least" or "at
 *   most", both is "between". It was a four-way selector plus a field, to say the same.
 *
 * The pickers are hosted by `ReviewFilterSheet`, which hides this sheet while one is
 * open — a sheet inside a sheet evicts the outer one (`lib/sheetStage.ts`).
 */
export function FilterForm({ filters, onChange, onClear, onDone, onOpenCategories, onOpenRange, canPickCategory }: {
  filters: ReviewFilters;
  onChange: (f: ReviewFilters) => void;
  onClear: () => void;
  onDone: () => void;
  onOpenCategories: () => void;
  onOpenRange: () => void;
  /** No categories in the list → nothing to pick, so the row is not offered. */
  canPickCategory: boolean;
}) {
  const set = (p: Partial<ReviewFilters>) => onChange({ ...filters, ...p });
  const dateSet = !!(filters.dateFrom || filters.dateTo);
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.md, paddingBottom: space.md }}>
      <View>
        <Text style={f.fLabel}>Name</Text>
        <TextInput
          style={f.fInput}
          value={filters.query}
          onChangeText={(t) => set({ query: t })}
          placeholder="Search description"
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
        />
      </View>

      {canPickCategory && (
        <View>
          <Text style={f.fLabel}>Category</Text>
          <View style={styles.row}>
            <Chip
              grow
              icon="tag"
              label={categoryLabel(filters.categories)}
              selected={filters.categories.length > 0}
              onPress={onOpenCategories}
              accessibilityLabel={`Category: ${categoryLabel(filters.categories)}. Change`}
            />
          </View>
        </View>
      )}

      <View>
        <Text style={f.fLabel}>Amount (₹)</Text>
        <View style={styles.amountRow}>
          <TextInput
            style={styles.amountInput}
            value={filters.amountMin}
            onChangeText={(t) => set({ amountMin: t.replace(/[^0-9.]/g, '') })}
            placeholder="Min"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            accessibilityLabel="Minimum amount"
          />
          <Text style={styles.to}>to</Text>
          <TextInput
            style={styles.amountInput}
            value={filters.amountMax}
            onChangeText={(t) => set({ amountMax: t.replace(/[^0-9.]/g, '') })}
            placeholder="Max"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            accessibilityLabel="Maximum amount"
          />
        </View>
      </View>

      <View>
        <Text style={f.fLabel}>Date</Text>
        <View style={styles.row}>
          <Chip
            grow
            icon="calendar"
            label={dateLabel(filters.dateFrom, filters.dateTo)}
            selected={dateSet}
            onPress={onOpenRange}
            accessibilityLabel={`Date: ${dateLabel(filters.dateFrom, filters.dateTo)}. Change`}
          />
        </View>
      </View>

      <View style={f.fActions}>
        <TouchableOpacity onPress={onClear} accessibilityRole="button" style={f.fClearBtn}>
          <Text style={f.fClearText}>Clear filters</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <PrimaryButton label="Done" onPress={onDone} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  amountInput: { flex: 1, ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: 10 },
  to: { ...type.label, color: colors.textMuted },
});
