import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, type, space, radius } from '../tokens';
import { SheetModal } from './SheetModal';
import { PrimaryButton } from './PrimaryButton';
import { haptic } from '../../lib/haptics';

export type TimeValue = { hour: number; minute: number };

type Props = {
  visible: boolean;
  value: TimeValue;
  title?: string;
  /** Minute granularity for the selectable chips (default 5). */
  minuteStep?: number;
  onClose: () => void;
  onSave: (value: TimeValue) => void;
};

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12

/**
 * A dependency-free time picker (no native datetime module → no rebuild needed).
 * Pick the hour, minute, and AM/PM as finger-friendly chips. Exact to the chosen
 * minute step (default 5-minute), which is plenty for reminders.
 */
export function TimePickerSheet({ visible, value, title = 'Pick a time', minuteStep = 5, onClose, onSave }: Props) {
  const [hour, setHour] = useState(value.hour);
  const [minute, setMinute] = useState(value.minute);

  // Re-sync when reopened against a (possibly changed) external value.
  useEffect(() => { if (visible) { setHour(value.hour); setMinute(value.minute); } }, [visible, value.hour, value.minute]);

  const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep);
  const isPM = hour >= 12;
  const h12 = hour % 12 === 0 ? 12 : hour % 12;

  const setH12 = (h: number, pm: boolean) => {
    // h is 1..12; convert to 24h
    const base = h % 12; // 12 → 0
    setHour(pm ? base + 12 : base);
    haptic.selection();
  };

  return (
    <SheetModal visible={visible} onClose={onClose} title={title} scroll={false}>
      <Text style={styles.label}>Hour</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {HOURS_12.map(h => {
          const selected = h === h12;
          return (
            <TouchableOpacity key={h} style={[styles.chip, selected && styles.chipOn]} onPress={() => setH12(h, isPM)} accessibilityRole="button" accessibilityState={{ selected }}>
              <Text style={[styles.chipText, selected && styles.chipTextOn]}>{h}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Text style={styles.label}>Minute</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {minutes.map(m => {
          const selected = m === minute;
          return (
            <TouchableOpacity key={m} style={[styles.chip, selected && styles.chipOn]} onPress={() => { setMinute(m); haptic.selection(); }} accessibilityRole="button" accessibilityState={{ selected }}>
              <Text style={[styles.chipText, selected && styles.chipTextOn]}>{String(m).padStart(2, '0')}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.ampmRow}>
        {(['AM', 'PM'] as const).map(p => {
          const selected = (p === 'PM') === isPM;
          return (
            <TouchableOpacity key={p} style={[styles.ampm, selected && styles.ampmOn]} onPress={() => setH12(h12, p === 'PM')} accessibilityRole="button" accessibilityState={{ selected }}>
              <Text style={[styles.ampmText, selected && styles.ampmTextOn]}>{p}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <PrimaryButton label="Save time" onPress={() => onSave({ hour, minute })} style={{ marginTop: space.md }} />
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  label: { ...type.label, color: colors.textSecondary, marginTop: space.sm, marginBottom: space.xs },
  row: { flexDirection: 'row', gap: space.sm, paddingVertical: 2, paddingRight: space.md },
  chip: { minWidth: 44, height: 44, paddingHorizontal: space.sm, borderRadius: radius.md, backgroundColor: colors.bgMuted, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.accent },
  chipText: { ...type.body, color: colors.textPrimary, fontFamily: 'SpaceMono_400Regular' },
  chipTextOn: { color: colors.bg, fontFamily: 'SpaceMono_400Regular' },
  ampmRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  ampm: { flex: 1, height: 44, borderRadius: radius.md, backgroundColor: colors.bgMuted, alignItems: 'center', justifyContent: 'center' },
  ampmOn: { backgroundColor: colors.accent },
  ampmText: { ...type.body, color: colors.textPrimary },
  ampmTextOn: { color: colors.bg, fontFamily: 'Inter_600SemiBold' },
});
