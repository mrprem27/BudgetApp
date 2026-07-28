import React from 'react';
import { StyleSheet } from 'react-native';
import { space } from '../tokens';
import { SheetModal } from '../ui/SheetModal';
import { Input } from '../ui/Input';
import { PrimaryButton } from '../ui/PrimaryButton';

/**
 * A one-field sheet for naming a person — used to add a friend and to rename
 * anyone. There were three byte-similar copies of this (two in `friends.tsx`,
 * one in `group/[id]/members.tsx`), each repeating the same `Input` props
 * (autoFocus, words capitalisation, maxLength 30, submit-on-return) and the
 * same disabled-when-blank button.
 *
 * Keeping it in one place means the name constraints can't drift between the
 * two screens — a rename capped at 30 chars in one and 40 in the other is
 * exactly the kind of divergence this prevents.
 */
export function PersonNameSheet({
  visible,
  onClose,
  title,
  value,
  onChangeText,
  onSubmit,
  placeholder = 'Name',
  submitLabel = 'Save',
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  value: string;
  onChangeText: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  submitLabel?: string;
}) {
  const disabled = !value.trim();
  return (
    <SheetModal visible={visible} onClose={onClose} title={title}>
      <Input
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        autoFocus
        autoCapitalize="words"
        maxLength={30}
        returnKeyType="done"
        onSubmitEditing={() => { if (!disabled) onSubmit(); }}
        style={styles.gap}
      />
      <PrimaryButton label={submitLabel} onPress={onSubmit} disabled={disabled} />
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  gap: { marginBottom: space.md },
});
