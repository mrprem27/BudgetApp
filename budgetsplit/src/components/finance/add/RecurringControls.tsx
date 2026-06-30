import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Switch, Keyboard } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { colors, type, space, radius } from '../../tokens';
import { nthOccurrenceMs } from '../../../lib/recurrence';
import type { RecurFreq } from '../../../constants/enums';

type EndMode = 'never' | 'date' | 'count';

/**
 * The "Recurring" controls for the Add screen — collapsed toggle, or the expanded
 * card (frequency, next charge, ends never/on-date/after-N). Extracted from
 * app/add/quick.tsx; purely presentational (parent owns the state).
 */
export function RecurringControls({
  enabled, setEnabled,
  freq, setFreq,
  interval, setInterval,
  endMode, setEndMode,
  endMs, setEndMs,
  count, setCount,
  txnDate,
  onPickEndDate,
}: {
  enabled: boolean; setEnabled: (b: boolean) => void;
  freq: RecurFreq; setFreq: (f: RecurFreq) => void;
  interval: string; setInterval: (s: string) => void;
  endMode: EndMode; setEndMode: (m: EndMode) => void;
  endMs: number | null; setEndMs: (n: number | null) => void;
  count: string; setCount: (s: string) => void;
  txnDate: number;
  onPickEndDate: () => void;
}) {
  if (!enabled) {
    return (
      <View style={styles.scheduleRow}>
        <Text style={styles.fieldLabel}>Repeat this</Text>
        <Switch
          value={enabled}
          onValueChange={setEnabled}
          trackColor={{ true: colors.settle, false: colors.bgMuted }}
          thumbColor={colors.textPrimary}
          accessibilityLabel="Repeat on a schedule"
        />
      </View>
    );
  }

  const intervalN = freq === 'custom' ? (parseInt(interval, 10) || 1) : 1;

  return (
    <View style={styles.recurCard}>
      <View style={styles.recurHeader}>
        <View style={styles.recurDot} />
        <Text style={styles.recurTitle}>Recurring</Text>
        <TouchableOpacity onPress={() => setEnabled(false)} hitSlop={10} style={{ marginLeft: 'auto' }} accessibilityRole="button" accessibilityLabel="Turn off recurring">
          <Feather name="chevron-up" size={18} color={colors.settle} />
        </TouchableOpacity>
      </View>

      {/* Frequency */}
      <View style={styles.recurSection}>
        <Text style={styles.recurSectionLabel}>FREQUENCY</Text>
        <View style={styles.recurPills}>
          {(['monthly', 'weekly', 'yearly', 'custom'] as const).map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.recurPill, freq === f && styles.recurPillActive]}
              onPress={() => setFreq(f)}
              accessibilityRole="button"
              accessibilityState={{ selected: freq === f }}
            >
              <Text style={[styles.recurPillText, freq === f && styles.recurPillTextActive]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {freq === 'custom' && (
          <View style={[styles.recurIntervalRow, { marginTop: space.sm }]}>
            <Text style={styles.recurRowLabel}>Every</Text>
            <TextInput
              style={styles.recurIntervalInput}
              value={interval}
              onChangeText={setInterval}
              keyboardType="number-pad"
              placeholder="1"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Interval days"
            />
            <Text style={styles.recurRowLabel}>days</Text>
          </View>
        )}
      </View>

      {/* Next charge — the occurrence after the start date */}
      <View style={styles.recurRow}>
        <Text style={styles.recurRowLabel}>Next charge</Text>
        <View style={styles.recurDateChip}>
          <Text style={styles.recurDateChipText}>
            {format(new Date(nthOccurrenceMs(txnDate, freq, intervalN, 2)), 'dd MMM yyyy')}
          </Text>
        </View>
      </View>

      {/* Ends — Never / On date / After N */}
      <View style={styles.recurRow}>
        <Text style={styles.recurRowLabel}>Ends</Text>
        <View style={styles.recurEndPills}>
          <TouchableOpacity
            style={[styles.recurChip, endMode === 'never' && styles.recurPillActive]}
            onPress={() => { setEndMode('never'); setEndMs(null); }}
            accessibilityRole="button"
            accessibilityState={{ selected: endMode === 'never' }}
          >
            <Text style={[styles.recurChipText, endMode === 'never' && styles.recurPillTextActive]}>Never</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.recurChip, endMode === 'date' && styles.recurPillActive]}
            onPress={() => { setEndMode('date'); Keyboard.dismiss(); onPickEndDate(); }}
            accessibilityRole="button"
            accessibilityState={{ selected: endMode === 'date' }}
          >
            <Text style={[styles.recurChipText, endMode === 'date' && styles.recurPillTextActive]}>On date</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.recurChip, endMode === 'count' && styles.recurPillActive]}
            onPress={() => setEndMode('count')}
            accessibilityRole="button"
            accessibilityState={{ selected: endMode === 'count' }}
          >
            <Text style={[styles.recurChipText, endMode === 'count' && styles.recurPillTextActive]}>After N</Text>
          </TouchableOpacity>
        </View>
      </View>
      {endMode === 'date' && endMs != null && (
        <TouchableOpacity style={styles.recurEndDate} onPress={() => { Keyboard.dismiss(); onPickEndDate(); }} accessibilityRole="button" accessibilityLabel="Change end date">
          <Feather name="calendar" size={13} color={colors.settle} />
          <Text style={styles.recurEndDateText}>Ends {format(new Date(endMs), 'dd MMM yyyy')}</Text>
        </TouchableOpacity>
      )}
      {endMode === 'count' && (
        <View style={styles.recurCountRow}>
          <Text style={styles.recurRowLabel}>After</Text>
          <TextInput
            style={styles.recurIntervalInput}
            value={count}
            onChangeText={setCount}
            keyboardType="number-pad"
            placeholder="12"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Number of occurrences"
          />
          <Text style={styles.recurRowLabel}>times</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scheduleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingLeft: space.md, paddingRight: space.sm, paddingVertical: space.xs },
  fieldLabel: { ...type.label, color: colors.textSecondary },
  recurCard: { backgroundColor: colors.settle + '14', borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.settle, overflow: 'hidden' },
  recurHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.settle + '33' },
  recurDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.settle },
  recurTitle: { ...type.body, color: colors.settle, fontFamily: 'Inter_600SemiBold' },
  recurRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.md, paddingVertical: space.sm + 2, borderTopWidth: 1, borderTopColor: colors.settle + '33' },
  recurRowLabel: { ...type.body, color: colors.textSecondary },
  recurSection: { paddingHorizontal: space.md, paddingVertical: space.sm + 2 },
  recurSectionLabel: { ...type.caption, color: colors.settle, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Inter_600SemiBold', marginBottom: space.sm },
  recurPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  recurPill: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.settle + '44' },
  recurPillActive: { backgroundColor: colors.settle, borderColor: colors.settle },
  recurPillText: { ...type.label, color: colors.textSecondary, fontFamily: 'Inter_600SemiBold' },
  recurPillTextActive: { color: '#fff' },
  recurDateChip: { backgroundColor: colors.bg, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.settle + '44', paddingHorizontal: space.sm + 2, paddingVertical: 6 },
  recurDateChipText: { ...type.label, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  recurCountRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.sm + 2 },
  recurChip: { paddingHorizontal: space.sm + 2, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.settle + '44' },
  recurChipText: { ...type.label, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  recurEndPills: { flexDirection: 'row', gap: 6 },
  recurEndDate: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.md, paddingBottom: space.sm + 2 },
  recurEndDateText: { ...type.label, color: colors.settle, fontFamily: 'Inter_600SemiBold' },
  recurIntervalRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  recurIntervalInput: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, paddingHorizontal: space.md, height: 44, minWidth: 64, textAlign: 'center', borderWidth: 1, borderColor: colors.border },
});
