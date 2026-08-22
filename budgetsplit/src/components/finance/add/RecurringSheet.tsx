import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { SheetModal } from '../../ui/SheetModal';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { RecurringControls } from './RecurringControls';
import { space } from '../../tokens';
import type { RecurFreq, RecurEndMode } from '../../../constants/enums';

type Props = {
  visible: boolean;
  onClose: () => void;
  enabled: boolean; setEnabled: (b: boolean) => void;
  freq: RecurFreq; setFreq: (f: RecurFreq) => void;
  interval: string; setInterval: (s: string) => void;
  endMode: RecurEndMode; setEndMode: (m: RecurEndMode) => void;
  endMs: number | null; setEndMs: (n: number | null) => void;
  count: string; setCount: (s: string) => void;
  txnDate: number;
  onPickEndDate: () => void;
};

/**
 * The recurrence editor as a sheet.
 *
 * `RecurringControls` is unchanged — it was already presentational — but it used
 * to sit inline inside the "More options" accordion, where a purple card with
 * frequency pills, a next-charge preview and three end modes appeared out of
 * nowhere and shoved the split summary two screens down. As a sheet it's the same
 * control with a door in front of it.
 */
export function RecurringSheet({ visible, onClose, ...controls }: Props) {
  const { enabled, setEnabled } = controls;

  /*
   * Opening this IS the intent to repeat, so turn it on.
   *
   * It used to open on an off switch with nothing below it: you tapped a chip
   * labelled "Repeat", landed on a sheet titled "Repeat this", and then had to
   * find a third control saying the same thing before any options appeared. Three
   * statements of one intention, and two taps before the screen showed you
   * anything. The switch stays as the way back off.
   */
  useEffect(() => {
    if (visible && !enabled) setEnabled(true);
  }, [visible, enabled, setEnabled]);

  return (
    <SheetModal visible={visible} onClose={onClose} title="Repeat this">
      <RecurringControls {...controls} />
      <PrimaryButton label="Done" onPress={onClose} style={styles.done} />
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  done: { marginTop: space.md },
});
