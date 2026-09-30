import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ViewStyle } from 'react-native';
import { colors, type, space, radius, layout } from '../tokens';
import { Input } from './Input';
import { splitPhone, joinPhone, type PhoneParts } from '../../lib/phone';

/**
 * A phone number with its country code in a box of its own, +91 by default (`U-44`).
 * `value` and `onChangeText` carry the stored form (`+91 98765 43210`, or '' for none),
 * so callers keep treating it as one string.
 */
export function PhoneInput({ value, onChangeText, label, accessibilityLabel, style }: {
  value: string;
  onChangeText: (stored: string) => void;
  label?: string;
  accessibilityLabel?: string;
  style?: ViewStyle;
}) {
  const [parts, setParts] = useState<PhoneParts>(() => splitPhone(value));
  // What we last emitted, so only a change from outside (a sheet reopened for someone
  // else) re-reads `value`; our own echo must not reset a code typed before the number.
  const emitted = useRef(value);
  useEffect(() => {
    if (value !== emitted.current) { emitted.current = value; setParts(splitPhone(value)); }
  }, [value]);

  function update(next: PhoneParts) {
    setParts(next);
    emitted.current = joinPhone(next);
    onChangeText(emitted.current);
  }

  return (
    <View style={style}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        <View style={styles.codeBox}>
          <Text style={styles.plus}>+</Text>
          <TextInput
            style={styles.code}
            value={parts.code}
            onChangeText={t => update({ ...parts, code: t.replace(/\D/g, '') })}
            keyboardType="number-pad"
            maxLength={3}
            accessibilityLabel="Country code"
          />
        </View>
        <Input
          value={parts.local}
          // A pasted `+91 …` moves its code into the code box instead of doubling it.
          onChangeText={t => update(t.trim().startsWith('+') && splitPhone(t).code ? splitPhone(t) : { ...parts, local: t })}
          placeholder="98765 43210"
          keyboardType="phone-pad"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
          accessibilityLabel={accessibilityLabel ?? label ?? 'Phone number'}
          style={styles.number}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...type.label, color: colors.textSecondary, marginBottom: space.xs },
  row: { flexDirection: 'row', gap: space.sm },
  codeBox: {
    flexDirection: 'row', alignItems: 'center', width: 72, height: layout.fieldHeight,
    paddingHorizontal: 12, backgroundColor: colors.bgInput, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  plus: { fontFamily: 'Inter_400Regular', fontSize: 15, color: colors.textMuted },
  code: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15, color: colors.textPrimary, paddingVertical: 0, marginLeft: 2 },
  number: { flex: 1 },
});
