import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  addMonths, subMonths, addYears, isSameMonth, startOfDay, endOfDay, format,
} from 'date-fns';
import { monthLabel, shortDate } from '../../lib/dateFormat';
import { nextRange, inRange, type DayRange } from '../../lib/dateRange';
import { colors, type, space } from '../tokens';
import { SheetModal } from './SheetModal';
import { PrimaryButton } from './PrimaryButton';
import { alpha } from '../../theme';

type Props = {
  visible: boolean;
  /** Current bounds, epoch ms; `null` = open-ended. */
  from: number | null;
  to: number | null;
  onClose: () => void;
  /** Whole days: `from` is 00:00 of the first day, `to` is 23:59:59.999 of the last. */
  onApply: (from: number, to: number) => void;
  /** Offers a Clear button while a range is set. Omit where a range is required. */
  onClear?: () => void;
};

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * One calendar, two taps: start day, then end day.
 *
 * The range used to be two separate date pickers chained through a parent's state —
 * pick "from", the sheet closed, and "to" was supposed to open from the same callback.
 * It never did: the picker calls `onChange` and then `onClose`, and the parent's
 * `onClose` cleared the very state `onChange` had just set, so the second step was
 * dropped and the range stayed half-set. A single sheet has no hand-off to lose.
 *
 * A tap before the start swaps the ends (`nextRange`), the range is painted between
 * them, and nothing is applied until the button — so a mis-tap costs nothing.
 */
export function DateRangeSheet({ visible, from, to, onClose, onApply, onClear }: Props) {
  const [range, setRange] = useState<DayRange>({ from: null, to: null });
  const [viewMonth, setViewMonth] = useState(() => new Date());

  useEffect(() => {
    if (!visible) return;
    setRange({ from: from != null ? startOfDay(from).getTime() : null, to: to != null ? startOfDay(to).getTime() : null });
    setViewMonth(new Date(from ?? to ?? Date.now()));
    // Re-seed only when the sheet opens, not on every bound change while it is up.
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(viewMonth)), end: endOfWeek(endOfMonth(viewMonth)) });
  const today = startOfDay(new Date()).getTime();

  const summary = range.from == null
    ? 'Tap the first day'
    : range.to == null
      ? `${shortDate(range.from)} → tap the last day`
      : range.from === range.to ? shortDate(range.from) : `${shortDate(range.from)} → ${shortDate(range.to)}`;

  function apply() {
    if (range.from == null) return;
    onApply(range.from, endOfDay(range.to ?? range.from).getTime());
    onClose();
  }

  return (
    <SheetModal visible={visible} onClose={onClose} title="Date range" scroll={false}>
      <Text style={[styles.summary, range.from != null && styles.summaryOn]}>{summary}</Text>

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
          const t = startOfDay(day).getTime();
          const isEnd = t === range.from || t === (range.to ?? range.from);
          const inside = inRange(range, t);
          return (
            <TouchableOpacity
              key={t}
              style={[styles.cell, inside && !isEnd && styles.cellBand]}
              onPress={() => setRange(r => nextRange(r, t))}
              accessibilityRole="button"
              accessibilityState={{ selected: inside }}
              accessibilityLabel={format(day, 'd MMMM yyyy')}
            >
              <Text style={[
                styles.cellText,
                !isSameMonth(day, viewMonth) && styles.cellMuted,
                t === today && !isEnd && styles.cellToday,
                isEnd && styles.cellEnd,
              ]}>
                {day.getDate()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.actions}>
        <PrimaryButton label="Apply range" onPress={apply} disabled={range.from == null} />
        {onClear && (from != null || to != null) && (
          <TouchableOpacity style={styles.clearBtn} onPress={() => { onClear(); onClose(); }} accessibilityRole="button">
            <Text style={styles.clearText}>Clear dates</Text>
          </TouchableOpacity>
        )}
      </View>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  summary: { ...type.label, color: colors.textMuted, textAlign: 'center', marginBottom: space.sm },
  summaryOn: { color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xs },
  monthLabel: { ...type.subheading, color: colors.textPrimary },
  yearLabel: { ...type.label, color: colors.textSecondary, letterSpacing: 1 },
  weekRow: { flexDirection: 'row', marginTop: space.sm },
  weekday: { flex: 1, textAlign: 'center', ...type.caption, color: colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space.xs },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  // The band runs edge to edge across the cell, so consecutive days read as one stretch.
  cellBand: { backgroundColor: alpha(colors.accent, 20) },
  cellText: { ...type.body, color: colors.textPrimary, width: 36, height: 36, borderRadius: 18, textAlign: 'center', textAlignVertical: 'center', lineHeight: 36 },
  cellMuted: { color: colors.textMuted },
  cellToday: { color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  cellEnd: { backgroundColor: colors.accent, color: colors.bg, overflow: 'hidden', fontFamily: 'Inter_600SemiBold' },
  actions: { marginTop: space.md },
  clearBtn: { alignSelf: 'center', paddingVertical: space.sm, paddingHorizontal: space.lg, marginTop: space.xs },
  clearText: { ...type.label, color: colors.expense, fontFamily: 'Inter_600SemiBold' },
});
