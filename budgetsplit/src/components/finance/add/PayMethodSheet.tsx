import React from 'react';
import { StyleSheet } from 'react-native';
import { SheetModal } from '../../ui/SheetModal';
import { SecondaryButton } from '../../ui/SecondaryButton';
import { PayMethodSelector } from '../PayMethodSelector';
import { space } from '../../tokens';
import { INCOME_LANDING, type PayMethod } from '../../../constants/enums';
import type { AddKind } from '../../../constants/enums';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** `''` = unset. Add always has a default; an imported Review row need not. */
  value: PayMethod | '';
  onChange: (m: PayMethod) => void;
  /** Tint for the selected tile — the Add screen passes its kind colour. */
  accent?: string;
  /** Income asks "where did it land?" and offers only the arrival methods. */
  kind?: AddKind;
  /**
   * Offers a "Clear" action, for callers where "no pay method" is a legal state.
   * Review needs it (a bank export may carry no cue); Add never does.
   */
  onClear?: () => void;
};

/**
 * "How was it paid?" as a sheet, so the pay method can be a chip on the form
 * instead of a block of tiles taking permanent vertical space.
 *
 * A thin wrapper — `PayMethodSelector` stays the one pay-method picker in the app
 * (it's driven off the `PAY_METHOD` enum, so the set, labels and glyphs live in a
 * single place). **Review uses this sheet too**, which is why `onClear` exists: it used
 * to declare its own `payOption` rows selected in `colors.accent` while the destination
 * sheet beside it used `colors.settle` — one screen, two "selected" colours in adjacent
 * sheets.
 */
export function PayMethodSheet({ visible, onClose, value, onChange, accent, kind, onClear }: Props) {
  const income = kind === 'income';
  return (
    <SheetModal visible={visible} onClose={onClose} title={income ? 'Where did it land?' : 'How was it paid?'}>
      <PayMethodSelector
        value={value}
        onChange={(m) => { onChange(m); onClose(); }}
        accent={accent}
        options={income ? INCOME_LANDING : undefined}
      />
      {onClear && value !== '' && (
        <SecondaryButton label="Clear" icon="x" onPress={() => { onClear(); onClose(); }} style={styles.clear} />
      )}
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  clear: { marginTop: space.md },
});
