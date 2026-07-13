import React from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { colors } from '../../tokens';

type Props = {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  maxLength?: number;
  accessibilityLabel: string;
};

/** A single note/title card input (the top field in Add, and the note inside More). */
export function NoteField({ value, onChangeText, placeholder, maxLength = 80, accessibilityLabel }: Props) {
  return (
    <View style={styles.noteCard}>
      <TextInput
        style={styles.noteCardInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="sentences"
        maxLength={maxLength}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  noteCard: { backgroundColor: colors.bgCard, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  noteCardInput: { fontFamily: 'Inter_400Regular', fontSize: 15, color: colors.textPrimary, paddingHorizontal: 14, paddingVertical: 10 },
});
