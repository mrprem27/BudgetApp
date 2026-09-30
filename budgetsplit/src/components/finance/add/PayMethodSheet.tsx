import { StyleSheet, Text } from 'react-native';
import { SheetModal } from '../../ui/SheetModal';
import { SecondaryButton } from '../../ui/SecondaryButton';
import { PayMethodSelector } from '../PayMethodSelector';
import { colors, space, type } from '../../tokens';
import { TabPills } from '../../ui/TabPills';
import { INCOME_LANDING, PAY_FROM_CHOICES, PAY_FROM_LABEL, assetOf, type PayMethod, type PayFrom } from '../../../constants/enums';
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
  /**
   * Where the money came from (`U-48`). Offered only when How allows a choice — UPI and Autopay
   * run from the bank, a credit card or a wallet. Changing How resets it to the usual.
   */
  payFrom?: PayFrom | '' | null;
  onChangeFrom?: (f: PayFrom | null) => void;
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
export function PayMethodSheet({ visible, onClose, value, onChange, accent, kind, onClear, payFrom, onChangeFrom }: Props) {
  const income = kind === 'income';
  const choices = !income && onChangeFrom && value ? PAY_FROM_CHOICES[value] : undefined;
  return (
    <SheetModal visible={visible} onClose={onClose} title={income ? 'Where did it land?' : 'How was it paid?'}>
      <PayMethodSelector
        value={value}
        onChange={(m) => { onChange(m); onChangeFrom?.(null); onClose(); }}
        accent={accent}
        options={income ? INCOME_LANDING : undefined}
      />
      {choices && value && (
        <>
          <Text style={styles.fromLabel}>From</Text>
          <TabPills
            tabs={choices.map(f => ({ key: f, label: PAY_FROM_LABEL[f] }))}
            active={payFrom || assetOf(value) || 'bank'}
            onChange={(k) => { onChangeFrom?.(k as PayFrom); onClose(); }}
            activeColor={accent}
          />
        </>
      )}
      {onClear && value !== '' && (
        <SecondaryButton label="Clear" icon="x" onPress={() => { onClear(); onClose(); }} style={styles.clear} />
      )}
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  clear: { marginTop: space.md },
  fromLabel: { ...type.label, color: colors.textSecondary, marginTop: space.md, marginBottom: space.xs },
});
