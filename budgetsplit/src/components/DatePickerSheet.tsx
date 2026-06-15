import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  addMonths, subMonths, isSameDay, isSameMonth, format,
} from 'date-fns';
import { colors, type, space, radius } from './tokens';
import { SheetModal } from './SheetModal';

type Props = {
  visible: boolean;
  value: number;       // epoch ms
  onClose: () => void;
  onChange: (ms: number) => void;
};

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * A reload-friendly (no native module) calendar picker. Any past or future date
 * can be chosen; the selected date keeps the existing time-of-day.
 */
export function DatePickerSheet({ visible, value, onClose, onChange }: Props) {
  const [viewMonth, setViewMonth] = useState(() => new Date(value));

  useEffect(() => { if (visible) setViewMonth(new Date(value)); }, [visible, value]);

  const selected = new Date(value);
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
      <View style={styles.navRow}>
        <TouchableOpacity onPress={() => setViewMonth(m => subMonths(m, 1))} hitSlop={10} accessibilityLabel="Previous month">
          <Feather name="chevron-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{format(viewMonth, 'MMMM yyyy')}</Text>
        <TouchableOpacity onPress={() => setViewMonth(m => addMonths(m, 1))} hitSlop={10} accessibilityLabel="Next month">
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
              style={[styles.cell, isSel && styles.cellSelected]}
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

      <TouchableOpacity style={styles.todayBtn} onPress={() => pick(new Date())} accessibilityRole="button">
        <Text style={styles.todayText}>Today</Text>
      </TouchableOpacity>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xs },
  monthLabel: { ...type.subheading, color: colors.textPrimary },
  weekRow: { flexDirection: 'row', marginTop: space.sm },
  weekday: { flex: 1, textAlign: 'center', ...type.caption, color: colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space.xs },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  cellSelected: {},
  cellText: { ...type.body, color: colors.textPrimary, width: 36, height: 36, borderRadius: 18, textAlign: 'center', textAlignVertical: 'center', lineHeight: 36 },
  cellMuted: { color: colors.textMuted },
  cellToday: { color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  cellSelectedWrap: {},
  cellTextSelected: { backgroundColor: colors.accent, color: colors.bg, overflow: 'hidden', fontFamily: 'Inter_600SemiBold' },
  todayBtn: { alignSelf: 'center', paddingVertical: space.sm, paddingHorizontal: space.lg, marginTop: space.sm },
  todayText: { ...type.button, color: colors.accent },
});
