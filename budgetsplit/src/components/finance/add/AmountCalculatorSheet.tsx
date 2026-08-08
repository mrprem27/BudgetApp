import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SheetModal } from '../../ui/SheetModal';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { colors, type, space, radius, layout } from '../../tokens';
import { formatRupees, parseToPaise } from '../../../lib/money';
import { haptic } from '../../../lib/haptics';
import { applyStep, stepIsUsable, divisionRemainder, operandKind, type CalcOp } from '../../../lib/amountCalc';
import { alpha } from '../../../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Current amount text from the form (rupees). */
  amountText: string;
  /** Writes back through the form's own setter so sanitize/format still own the display. */
  onApply: (rupees: string) => void;
  accent?: string;
};

const OPS: { op: CalcOp; icon: keyof typeof Feather.glyphMap; label: string }[] = [
  { op: '+', icon: 'plus', label: 'Add' },
  { op: '-', icon: 'minus', label: 'Subtract' },
  { op: '*', icon: 'x', label: 'Multiply by' },
  { op: '/', icon: 'divide', label: 'Divide by' },
];

/**
 * Adjust the amount arithmetically: split a bill, add a tip, apply tax.
 *
 * Sequential, one step at a time — see `lib/amountCalc` for why this isn't an expression
 * parser. The running total is always integer paise and every step rounds once, so the
 * figure shown here is exactly the figure that gets saved.
 *
 * Writes back through the form's `setAmountText`, so `sanitizeAmountInput` /
 * `formatAmountInput` keep owning the display and there's no second formatting path.
 */
export function AmountCalculatorSheet({ visible, onClose, amountText, onApply, accent = colors.accent }: Props) {
  const [acc, setAcc] = useState(0);
  const [op, setOp] = useState<CalcOp>('/');
  const [operand, setOperand] = useState('');

  // Re-seed from the form each time it opens — the amount may have been edited since.
  useEffect(() => {
    if (visible) { setAcc(parseToPaise(amountText)); setOperand(''); }
  }, [visible, amountText]);

  const preview = applyStep(acc, op, operand);
  const usable = stepIsUsable(acc, op, operand);
  const remainder = op === '/' ? divisionRemainder(acc, operand) : 0;
  const kind = operandKind(op);

  const commitStep = () => {
    if (!usable) return;
    haptic.selection();
    setAcc(preview);
    setOperand('');
  };

  const done = () => {
    // A pending step is applied on Done rather than silently discarded — someone who
    // types "÷ 3" and taps Done means it.
    const final = usable ? preview : acc;
    onApply((final / 100).toString());
    onClose();
  };

  return (
    <SheetModal visible={visible} onClose={onClose} title="Adjust amount" scroll={false}>
      {/* Running total — the one figure that matters here. */}
      <View style={styles.totalWrap}>
        <Text style={styles.totalLabel}>{usable ? 'Result' : 'Amount'}</Text>
        <Text style={[styles.total, { color: usable ? accent : colors.textPrimary }]}>
          {formatRupees(usable ? preview : acc)}
        </Text>
        {usable && <Text style={styles.was}>from {formatRupees(acc)}</Text>}
      </View>

      <View style={styles.opRow}>
        {OPS.map(o => {
          const on = op === o.op;
          return (
            <TouchableOpacity
              key={o.op}
              style={[styles.opBtn, on && { backgroundColor: alpha(accent, 13), borderColor: accent }]}
              onPress={() => { haptic.selection(); setOp(o.op); setOperand(''); }}
              accessibilityRole="button"
              accessibilityLabel={o.label}
              accessibilityState={{ selected: on }}
            >
              <Feather name={o.icon} size={18} color={on ? accent : colors.textSecondary} />
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.hint}>
        {kind === 'money'
          ? `${op === '+' ? 'Add' : 'Subtract'} an amount`
          : op === '/' ? 'Divide by — e.g. 3 to split three ways'
          : 'Multiply by — e.g. 1.18 to add 18% tax'}
      </Text>

      <Keypad
        value={operand}
        onChange={setOperand}
        prefix={kind === 'money' ? '₹' : '×÷'.charAt(op === '*' ? 0 : 1)}
      />

      {remainder > 0 && (
        <Text style={styles.remainder}>
          Doesn't divide evenly — {formatRupees(remainder)} left over, so the shares won't
          add back to the total exactly.
        </Text>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.equals, !usable && styles.equalsOff]}
          onPress={commitStep}
          disabled={!usable}
          accessibilityRole="button"
          accessibilityLabel="Apply this step and keep going"
        >
          <Text style={[styles.equalsText, { color: usable ? accent : colors.textMuted }]}>= keep going</Text>
        </TouchableOpacity>
        <View style={styles.doneWrap}>
          <PrimaryButton label="Use amount" onPress={done} />
        </View>
      </View>
    </SheetModal>
  );
}

/** Digit pad. A plain numeric row set, so no keyboard covers the running total. */
function Keypad({ value, onChange, prefix }: { value: string; onChange: (v: string) => void; prefix: string }) {
  const push = (ch: string) => {
    if (ch === '.' && value.includes('.')) return;
    haptic.selection();
    onChange(value + ch);
  };
  return (
    <View style={styles.pad}>
      <View style={styles.padValueRow}>
        <Text style={styles.padPrefix}>{prefix}</Text>
        <Text style={styles.padValue}>{value || '0'}</Text>
        <TouchableOpacity
          onPress={() => { haptic.selection(); onChange(value.slice(0, -1)); }}
          hitSlop={10}
          disabled={!value}
          accessibilityRole="button"
          accessibilityLabel="Delete last digit"
        >
          <Feather name="delete" size={18} color={value ? colors.textSecondary : colors.border} />
        </TouchableOpacity>
      </View>
      {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['.', '0', '']].map((row, ri) => (
        <View key={ri} style={styles.padRow}>
          {row.map((ch, ci) => ch === '' ? <View key={ci} style={styles.key} /> : (
            <TouchableOpacity key={ci} style={styles.key} onPress={() => push(ch)} accessibilityRole="button" accessibilityLabel={ch}>
              <Text style={styles.keyText}>{ch}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  totalWrap: { alignItems: 'center', marginBottom: space.md },
  totalLabel: { ...type.sectionLabel, color: colors.textMuted, marginBottom: space.xs },
  total: { ...type.amountXL },
  was: { ...type.caption, color: colors.textMuted, marginTop: space.xs },

  opRow: { flexDirection: 'row', gap: space.sm },
  opBtn: {
    flex: 1, minHeight: layout.touchMin, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard,
  },
  hint: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.sm },

  pad: { marginTop: space.md, gap: space.sm },
  padValueRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    backgroundColor: colors.bgInput, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: space.md, minHeight: layout.touchMin,
  },
  padPrefix: { ...type.amountSM, color: colors.textMuted },
  padValue: { ...type.amountMD, color: colors.textPrimary, flex: 1, textAlign: 'right' },
  padRow: { flexDirection: 'row', gap: space.sm },
  key: {
    flex: 1, minHeight: layout.touchMin + 4, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.md, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
  },
  keyText: { ...type.amountMD, color: colors.textPrimary },

  remainder: { ...type.caption, color: colors.healthAmber, marginTop: space.md, lineHeight: 16 },
  actions: { marginTop: space.lg, gap: space.sm },
  equals: { minHeight: layout.touchMin, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  equalsOff: { opacity: 0.5 },
  equalsText: { ...type.labelSemi },
  doneWrap: {},
});
