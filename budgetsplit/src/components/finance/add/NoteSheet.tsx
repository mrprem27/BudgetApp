import React from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { SheetModal } from '../../ui/SheetModal';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { colors, type, space, radius } from '../../tokens';

type Props = {
  visible: boolean;
  onClose: () => void;
  value: string;
  onChangeText: (t: string) => void;
  maxLength?: number;
};

/**
 * A longer free-text note, opened from the "Note" detail chip.
 *
 * Multiline here, unlike the single-line title field on the form: this is the
 * place for the sentence you'd actually want to read back in six months, so it
 * shouldn't be a one-line box you can't see the end of.
 */
export function NoteSheet({ visible, onClose, value, onChangeText, maxLength = 120 }: Props) {
  return (
    <SheetModal visible={visible} onClose={onClose} title="Note" scroll={false}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder="What was this for?"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Note"
        autoCapitalize="sentences"
        maxLength={maxLength}
        multiline
        autoFocus
      />
      <PrimaryButton label="Done" onPress={onClose} style={styles.done} />
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  input: {
    ...type.body,
    color: colors.textPrimary,
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    paddingVertical: space.smd,
    minHeight: 96,
    textAlignVertical: 'top',
  },
  done: { marginTop: space.md },
});
