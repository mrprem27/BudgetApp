import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { space } from '../tokens';
import { SheetModal } from './SheetModal';
import { PrimaryButton } from './PrimaryButton';
import { WheelPicker, WheelBand } from './WheelPicker';

export type TimeValue = { hour: number; minute: number };

type Props = {
  visible: boolean;
  value: TimeValue;
  title?: string;
  /** Minute granularity for the wheel (default 5). */
  minuteStep?: number;
  onClose: () => void;
  onSave: (value: TimeValue) => void;
};

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12

/**
 * A dependency-free time picker (no native datetime module → no rebuild needed).
 * Three snapping wheels — hour, minute, AM/PM — exact to the chosen minute step
 * (default 5), which is plenty for a reminder.
 */
export function TimePickerSheet({ visible, value, title = 'Pick a time', minuteStep = 5, onClose, onSave }: Props) {
  const [hour, setHour] = useState(value.hour);
  const [minute, setMinute] = useState(value.minute);

  // Re-sync when reopened against a (possibly changed) external value.
  useEffect(() => { if (visible) { setHour(value.hour); setMinute(value.minute); } }, [visible, value.hour, value.minute]);

  const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep);
  const isPM = hour >= 12;
  const h12 = hour % 12 === 0 ? 12 : hour % 12;

  // h is 1..12; convert to 24h. No haptic here — `WheelPicker` fires one when a
  // column settles, and both would double-tap on every change.
  const setH12 = (h: number, pm: boolean) => {
    const base = h % 12; // 12 → 0
    setHour(pm ? base + 12 : base);
  };

  const minuteIndex = Math.max(0, minutes.indexOf(minute));

  return (
    <SheetModal visible={visible} onClose={onClose} title={title} scroll={false}>
      {/*
        A wheel, not three strips of chips.
        
        The chip version made you scroll a horizontal list to find the hour, then
        scroll a second one for the minute — two searches for one everyday answer,
        and neither strip showed where you were in it. A wheel puts hour, minute
        and AM/PM side by side, each already parked on the current value, so the
        common case (nudge it by an hour) is one small drag.
      */}
      <View style={styles.wheel}>
        <WheelBand />
        <WheelPicker
          label="Hour"
          options={HOURS_12.map(String)}
          index={h12 - 1}
          onChange={(i) => setH12(HOURS_12[i], isPM)}
        />
        <WheelPicker
          label="Minute"
          options={minutes.map(m => String(m).padStart(2, '0'))}
          index={minuteIndex}
          onChange={(i) => setMinute(minutes[i])}
        />
        <WheelPicker
          label="AM or PM"
          options={['AM', 'PM']}
          index={isPM ? 1 : 0}
          onChange={(i) => setH12(h12, i === 1)}
        />
      </View>

      <PrimaryButton label="Save time" onPress={() => onSave({ hour, minute })} style={{ marginTop: space.md }} />
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  // The three columns share one centre band, so they sit in a single row and the
  // band is drawn once across all of them.
  wheel: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
});
