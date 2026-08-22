import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Switch, Keyboard } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { fullDate } from '../../../lib/dateFormat';
import { TabPills } from '../../ui/TabPills';
import { IconCircle } from '../../ui/IconCircle';
import { colors, type, space, radius, layout } from '../../tokens';
import { nthOccurrenceMs, freqLabel } from '../../../lib/recurrence';
import {
  RECUR_FREQ_ADD_CHOICES, RECUR_FREQ_LABEL, RECUR_END_MODE, RECUR_END_MODE_LABEL,
  RecurEndMode, type RecurFreq,
} from '../../../constants/enums';
import { alpha } from '../../../theme';

const FREQ_TABS = RECUR_FREQ_ADD_CHOICES.map(f => ({ key: f, label: RECUR_FREQ_LABEL[f] }));
const END_TABS = RECUR_END_MODE.map(m => ({ key: m, label: RECUR_END_MODE_LABEL[m] }));

/**
 * The "Recurring" controls for the Add screen — collapsed toggle, or the expanded
 * card (frequency, next charge, ends never/on-date/after-N). Extracted from
 * app/add/quick.tsx; purely presentational (parent owns the state).
 *
 * Frequency and Ends are `TabPills`, not chip rows: both are mutually exclusive
 * choices, and a segmented control says "pick exactly one of these" where a row of
 * chips says "toggle any of these". They used to be three hand-rolled pill styles
 * (`recurPill`, `recurChip`, `recurDateChip`) that differed only in padding and
 * radius, all on the §9-banned `space.smd` — the same drift `ui/Chip` was built
 * to end, one layer below the form.
 *
 * The section eyebrows deliberately don't use `ui/SectionHeader`: that component owns
 * `space.lg` vertical margins tuned for a scroll container's list sections, which is
 * too airy inside a dense sheet card. They do use its `type.sectionLabel` token, which
 * is where the actual duplication was (this file had improvised `letterSpacing: 0.8`).
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
  endMode: RecurEndMode; setEndMode: (m: RecurEndMode) => void;
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
  // What is set, said once, at the top — so the card leads with the answer rather
  // than with its own name.
  const freqSummary = freqLabel(freq, intervalN);

  /** Pick the end mode. `never` also clears any date already chosen, so a stale
   *  end date can't survive switching away from "On date" and back. */
  const chooseEndMode = (m: RecurEndMode) => {
    setEndMode(m);
    if (m === RecurEndMode.Never) setEndMs(null);
    if (m === RecurEndMode.Date) { Keyboard.dismiss(); onPickEndDate(); }
  };

  return (
    <View style={styles.recurCard}>
      {/* The switch is the only way off — the Repeat chip carries a chevron, not an
          ✕, because §9 allows a chip exactly one trailing affordance. It no longer
          repeats the word: the sheet's own title says "Repeat this", and saying it
          again here was the third statement of one idea. */}
      <View style={styles.recurHeader}>
        <IconCircle icon="repeat" size={22} color={colors.settle} iconSize={12} />
        <Text style={styles.recurTitle}>{freqSummary}</Text>
        <View style={{ marginLeft: 'auto' }}>
          <Switch
            value={enabled}
            onValueChange={setEnabled}
            trackColor={{ true: colors.settle, false: colors.bgMuted }}
            thumbColor={colors.textPrimary}
            accessibilityLabel="Repeat on a schedule"
          />
        </View>
      </View>

      {/* Frequency */}
      <View style={styles.recurSection}>
        <Text style={styles.recurSectionLabel}>FREQUENCY</Text>
        <TabPills
          tabs={FREQ_TABS}
          active={freq}
          onChange={(f) => setFreq(f as RecurFreq)}
          activeColor={colors.settle}
        />
        {freq === 'custom' && (
          <View style={styles.recurIntervalRow}>
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
        {/* Plain text, not a Chip. It is a derived fact you cannot act on, and a
            pill among real pills reads as another thing to tap — which is exactly
            the "what is selectable here" confusion §9 is about. */}
        <Text style={styles.recurRowValue}>
          {fullDate(new Date(nthOccurrenceMs(txnDate, freq, intervalN, 2)))}
        </Text>
      </View>

      {/* Ends — Never / On date / After N */}
      <View style={styles.recurSectionBordered}>
        <Text style={styles.recurSectionLabel}>ENDS</Text>
        <TabPills
          tabs={END_TABS}
          active={endMode}
          onChange={(m) => chooseEndMode(m as RecurEndMode)}
          activeColor={colors.settle}
        />
        {endMode === RecurEndMode.Date && endMs != null && (
          <TouchableOpacity style={styles.recurEndDate} onPress={() => { Keyboard.dismiss(); onPickEndDate(); }} accessibilityRole="button" accessibilityLabel="Change end date">
            <Feather name="calendar" size={13} color={colors.settle} />
            <Text style={styles.recurEndDateText}>Ends {fullDate(new Date(endMs))}</Text>
          </TouchableOpacity>
        )}
        {endMode === RecurEndMode.Count && (
          <View style={styles.recurIntervalRow}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  scheduleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingLeft: space.md, paddingRight: space.sm, paddingVertical: space.xs },
  fieldLabel: { ...type.label, color: colors.textSecondary },
  recurCard: { backgroundColor: alpha(colors.settle, 8), borderRadius: radius.lg, borderWidth: 1, borderColor: colors.settle, overflow: 'hidden' },
  recurHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: alpha(colors.settle, 20) },
  recurTitle: { ...type.bodySemi, color: colors.settle },
  recurRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.md, paddingVertical: space.smd, borderTopWidth: 1, borderTopColor: alpha(colors.settle, 20) },
  recurRowLabel: { ...type.body, color: colors.textSecondary },
  recurRowValue: { ...type.bodySemi, color: colors.textPrimary },
  recurSection: { paddingHorizontal: space.md, paddingVertical: space.smd },
  recurSectionBordered: { paddingHorizontal: space.md, paddingVertical: space.smd, borderTopWidth: 1, borderTopColor: alpha(colors.settle, 20) },
  recurSectionLabel: { ...type.sectionLabel, color: colors.settle, marginBottom: space.sm },
  recurEndDate: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.sm },
  recurEndDateText: { ...type.labelSemi, color: colors.settle },
  recurIntervalRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  recurIntervalInput: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, paddingHorizontal: space.md, height: layout.touchMin, minWidth: 64, textAlign: 'center', borderWidth: 1, borderColor: colors.border },
});
