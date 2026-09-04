import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  addMonths, subMonths, addYears, isSameDay, isSameMonth, format,
} from 'date-fns';
import { monthLabel } from '../../lib/dateFormat';
import { colors, type, space, radius } from '../tokens';
import { SheetModal } from './SheetModal';
import { Divider } from './Divider';
import { ListRow } from './ListRow';

type Props = {
  visible: boolean;
  value: number;       // epoch ms
  onClose: () => void;
  onChange: (ms: number) => void;
  /**
   * Show a "Time · 6:45 pm ›" row under the calendar, so one control answers
   * WHEN rather than two chips answering half of it each.
   *
   * **Opt-in.** Three of this sheet's four callers have no business showing a
   * time: a recurring END DATE has no time-of-day, and Review's filter bounds
   * chain into their own time step. Only pass it where the entry genuinely
   * carries a moment.
   */
  timeLabel?: string;
  onPickTime?: () => void;
};

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * A reload-friendly (no native module) calendar picker. Any past or future date
 * can be chosen; the selected date keeps the existing time-of-day.
 */
export function DatePickerSheet({ visible, value, onClose, onChange, timeLabel, onPickTime }: Props) {
  // Guard against an invalid/NaN epoch — date-fns throws RangeError otherwise.
  const safeValue = Number.isFinite(value) ? value : Date.now();
  const [viewMonth, setViewMonth] = useState(() => new Date(safeValue));

  useEffect(() => { if (visible) setViewMonth(new Date(safeValue)); }, [visible, safeValue]);

  const selected = new Date(safeValue);
  const today = new Date();
  const gridStart = startOfWeek(startOfMonth(viewMonth));
  const gridEnd = endOfWeek(endOfMonth(viewMonth));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  function pick(day: Date) {
    const d = new Date(day);
    d.setHours(selected.getHours(), selected.getMinutes(), selected.getSeconds(), 0);
    onChange(d.getTime());
    onClose();
  }

  return (
    <SheetModal visible={visible} onClose={onClose} title="Select date" scroll={false}>
      {/*
        Two rows, because a year is not twelve months of tapping.
        
        Month-only navigation made a date last March a twelve-tap journey — and
        picking a day closes the sheet, so a mis-tap on the way sent you back to
        the form to start again. That is what "if I select a date it goes back"
        was actually about: not the dismiss, the distance.
      */}
      <View style={styles.navRow}>
        <TouchableOpacity onPress={() => setViewMonth(m => addYears(m, -1))} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous year">
          <Feather name="chevrons-left" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.yearLabel}>{format(viewMonth, 'yyyy')}</Text>
        <TouchableOpacity onPress={() => setViewMonth(m => addYears(m, 1))} hitSlop={10} accessibilityRole="button" accessibilityLabel="Next year">
          <Feather name="chevrons-right" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.navRow}>
        <TouchableOpacity onPress={() => setViewMonth(m => subMonths(m, 1))} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous month">
          <Feather name="chevron-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel(viewMonth)}</Text>
        <TouchableOpacity onPress={() => setViewMonth(m => addMonths(m, 1))} hitSlop={10} accessibilityRole="button" accessibilityLabel="Next month">
          <Feather name="chevron-right" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => <Text key={i} style={styles.weekday}>{w}</Text>)}
      </View>

      <View style={styles.grid}>
        {days.map(day => {
          const isSel = isSameDay(day, selected);
          const inMonth = isSameMonth(day, viewMonth);
          const isToday = isSameDay(day, today);
          return (
            <TouchableOpacity
              key={day.toISOString()}
              style={styles.cell}
              onPress={() => pick(day)}
              accessibilityRole="button"
              accessibilityLabel={format(day, 'd MMMM yyyy')}
            >
              <Text style={[
                styles.cellText,
                !inMonth && styles.cellMuted,
                isToday && !isSel && styles.cellToday,
                isSel && styles.cellTextSelected,
              ]}>
                {day.getDate()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {onPickTime && (
        <>
          <Divider indent="none" />
          <ListRow
            icon="clock"
            title="Time"
            value={timeLabel}
            onPress={onPickTime}
            accessibilityLabel={`Time: ${timeLabel ?? 'not set'}. Change`}
          />
        </>
      )}

      <TouchableOpacity style={styles.todayBtn} onPress={() => pick(new Date())} accessibilityRole="button">
        <Text style={styles.todayText}>Today</Text>
      </TouchableOpacity>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xs },
  monthLabel: { ...type.subheading, color: colors.textPrimary },
  // Quieter than the month: the year is the coarse control and should not compete
  // with the row people actually use most.
  yearLabel: { ...type.label, color: colors.textSecondary, letterSpacing: 1 },
  weekRow: { flexDirection: 'row', marginTop: space.sm },
  weekday: { flex: 1, textAlign: 'center', ...type.caption, color: colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space.xs },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  cellText: { ...type.body, color: colors.textPrimary, width: 36, height: 36, borderRadius: 18, textAlign: 'center', textAlignVertical: 'center', lineHeight: 36 },
  cellMuted: { color: colors.textMuted },
  cellToday: { color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  cellTextSelected: { backgroundColor: colors.accent, color: colors.bg, overflow: 'hidden', fontFamily: 'Inter_600SemiBold' },
  todayBtn: { alignSelf: 'center', paddingVertical: space.sm, paddingHorizontal: space.lg, marginTop: space.sm },
  todayText: { ...type.button, color: colors.accent },
});
