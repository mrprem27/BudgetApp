import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { colors, type, space, radius } from '../../tokens';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { DatePickerSheet } from '../../ui/DatePickerSheet';
import { TimePickerSheet, type TimeValue } from '../../ui/TimePickerSheet';
import { parseFilterDate, type ReviewFilters, type AmountMode } from '../../../lib/reviewFilter';
import { FChip, reviewFormStyles as f } from './FChip';

const AMOUNT_MODES: { key: AmountMode; label: string }[] = [
  { key: 'any', label: 'Any' },
  { key: 'lt', label: '< less' },
  { key: 'gt', label: '> more' },
  { key: 'between', label: 'Between' },
];

/**
 * The Review inbox filter sheet: name, category, amount range, date+time range
 * and AND/OR combination. Picking a date chains straight into the time picker
 * for that same bound, so a range can be set without re-opening the sheet.
 */
export function FilterForm({ filters, categories, onChange, onClear, onDone }: {
  filters: ReviewFilters;
  categories: string[];
  onChange: (f: ReviewFilters) => void;
  onClear: () => void;
  onDone: () => void;
}) {
  const set = (p: Partial<ReviewFilters>) => onChange({ ...filters, ...p });
  const [pick, setPick] = useState<'from' | 'to' | null>(null);
  const [timePick, setTimePick] = useState<'from' | 'to' | null>(null);
  const pickValue = pick === 'to'
    ? (parseFilterDate(filters.dateTo, true) ?? Date.now())
    : (parseFilterDate(filters.dateFrom, false) ?? Date.now());
  // Seed the time picker from the bound's existing time, else a sensible default.
  const timeStr = timePick === 'to' ? filters.dateTo : timePick === 'from' ? filters.dateFrom : '';
  const tm = /\s(\d{2}):(\d{2})$/.exec(timeStr);
  const timeValue: TimeValue = tm
    ? { hour: Number(tm[1]), minute: Number(tm[2]) }
    : (timePick === 'to' ? { hour: 23, minute: 59 } : { hour: 0, minute: 0 });
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.md, paddingBottom: space.md }}>
      <View>
        <Text style={f.fLabel}>NAME</Text>
        <TextInput
          style={f.fInput}
          value={filters.query}
          onChangeText={(t) => set({ query: t })}
          placeholder="Search description"
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
        />
      </View>

      {categories.length > 0 && (
        <View>
          <Text style={f.fLabel}>CATEGORY</Text>
          <View style={f.fChipRow}>
            <FChip label="Any" on={filters.category === ''} onPress={() => set({ category: '' })} />
            {categories.map(c => (
              <FChip key={c} label={c} on={filters.category === c} onPress={() => set({ category: c })} />
            ))}
          </View>
        </View>
      )}

      <View>
        <Text style={f.fLabel}>AMOUNT (₹)</Text>
        <View style={styles.seg}>
          {AMOUNT_MODES.map(m => (
            <TouchableOpacity key={m.key} style={[styles.segBtn, filters.amountMode === m.key && styles.segBtnOn]} onPress={() => set({ amountMode: m.key })} accessibilityRole="button">
              <Text style={[styles.segText, filters.amountMode === m.key && styles.segTextOn]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {filters.amountMode !== 'any' && (
          <View style={styles.fDateRow}>
            <TextInput
              style={styles.fDateInput}
              value={filters.amtA}
              onChangeText={(t) => set({ amtA: t.replace(/[^0-9.]/g, '') })}
              placeholder={filters.amountMode === 'between' ? 'From' : 'Amount'}
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
            />
            {filters.amountMode === 'between' && (
              <TextInput
                style={styles.fDateInput}
                value={filters.amtB}
                onChangeText={(t) => set({ amtB: t.replace(/[^0-9.]/g, '') })}
                placeholder="To"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />
            )}
          </View>
        )}
      </View>

      <View>
        <Text style={f.fLabel}>DATE &amp; TIME RANGE</Text>
        <View style={styles.fDateRow}>
          <TouchableOpacity style={styles.fDateBtn} onPress={() => setPick('from')} accessibilityRole="button" accessibilityLabel="From date and time">
            <Feather name="calendar" size={14} color={colors.textMuted} />
            <Text style={[styles.fDateText, !filters.dateFrom && styles.fDatePlaceholder]}>{filters.dateFrom || 'From'}</Text>
            {!!filters.dateFrom && (
              <TouchableOpacity onPress={() => set({ dateFrom: '' })} hitSlop={8} accessibilityLabel="Clear from date"><Feather name="x" size={13} color={colors.textMuted} /></TouchableOpacity>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.fDateBtn} onPress={() => setPick('to')} accessibilityRole="button" accessibilityLabel="To date and time">
            <Feather name="calendar" size={14} color={colors.textMuted} />
            <Text style={[styles.fDateText, !filters.dateTo && styles.fDatePlaceholder]}>{filters.dateTo || 'To'}</Text>
            {!!filters.dateTo && (
              <TouchableOpacity onPress={() => set({ dateTo: '' })} hitSlop={8} accessibilityLabel="Clear to date"><Feather name="x" size={13} color={colors.textMuted} /></TouchableOpacity>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <DatePickerSheet
        visible={pick !== null}
        value={pickValue}
        onClose={() => setPick(null)}
        onChange={(ms) => {
          const d = format(new Date(ms), 'yyyy-MM-dd');
          const which = pick;
          set(which === 'to' ? { dateTo: d } : { dateFrom: d });
          setPick(null);
          setTimePick(which); // chain into the time picker for this bound
        }}
      />

      <TimePickerSheet
        visible={timePick !== null}
        value={timeValue}
        title="Pick a time (optional)"
        onClose={() => setTimePick(null)}
        onSave={(t) => {
          const cur = timePick === 'to' ? filters.dateTo : filters.dateFrom;
          const datePart = (cur || '').split(' ')[0];
          if (datePart) {
            const withTime = `${datePart} ${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
            set(timePick === 'to' ? { dateTo: withTime } : { dateFrom: withTime });
          }
          setTimePick(null);
        }}
      />

      <View>
        <Text style={f.fLabel}>MATCH</Text>
        <View style={styles.seg}>
          {(['and', 'or'] as const).map(c => (
            <TouchableOpacity key={c} style={[styles.segBtn, filters.combine === c && styles.segBtnOn]} onPress={() => set({ combine: c })} accessibilityRole="button">
              <Text style={[styles.segText, filters.combine === c && styles.segTextOn]}>{c === 'and' ? 'All (AND)' : 'Any (OR)'}</Text>
            </TouchableOpacity>
          ))}
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
  seg: { flexDirection: 'row', backgroundColor: colors.bgMuted, borderRadius: radius.md, padding: 3, gap: 3 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: space.sm, borderRadius: radius.sm },
  segBtnOn: { backgroundColor: colors.accent },
  segText: { ...type.label, color: colors.textSecondary },
  segTextOn: { color: colors.bg, fontFamily: 'Inter_600SemiBold' },
  fDateRow: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  fDateInput: { flex: 1, ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: 10 },
  fDateBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bgInput, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: 12 },
  fDateText: { ...type.body, color: colors.textPrimary, flex: 1 },
  fDatePlaceholder: { color: colors.textMuted },
});
