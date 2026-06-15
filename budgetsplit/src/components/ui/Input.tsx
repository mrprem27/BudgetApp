import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../tokens';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  label?: string;
  icon?: keyof typeof Feather.glyphMap;
  /** Right-align and use Space Mono for money entry. */
  amount?: boolean;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad' | 'email-address';
  autoFocus?: boolean;
  multiline?: boolean;
  editable?: boolean;
  style?: ViewStyle;
};

/**
 * Design-system text input: bgInput surface, 1px border (teal on focus),
 * optional leading icon, amount mode for money entry.
 */
export function Input({
  value,
  onChangeText,
  placeholder,
  label,
  icon,
  amount,
  keyboardType = 'default',
  autoFocus,
  multiline,
  editable = true,
  style,
}: Props) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={style}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.wrap, focused && styles.wrapFocused, !editable && styles.wrapDisabled]}>
        {icon ? (
          <Feather name={icon} size={16} color={focused ? colors.accent : colors.textMuted} style={styles.icon} />
        ) : null}
        <TextInput
          style={[
            styles.input,
            amount && styles.inputAmount,
            icon && { paddingLeft: 0 },
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          keyboardType={amount ? 'decimal-pad' : keyboardType}
          autoFocus={autoFocus}
          multiline={multiline}
          editable={editable}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    ...type.label,
    color: colors.textSecondary,
    marginBottom: space.xs,
  },
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    height: 48,
    paddingHorizontal: 14,
  },
  wrapFocused: {
    borderColor: colors.borderFocus,
  },
  wrapDisabled: {
    opacity: 0.5,
  },
  icon: {
    marginRight: space.sm,
  },
  input: {
    flex: 1,
    ...type.body,
    color: colors.textPrimary,
    paddingVertical: 0,
  },
  inputAmount: {
    fontFamily: 'SpaceMono_400Regular',
    textAlign: 'right',
  },
});
