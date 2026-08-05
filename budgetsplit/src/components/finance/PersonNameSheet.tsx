import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { colors, type, space } from '../tokens';
import { SheetModal } from '../ui/SheetModal';
import { Input } from '../ui/Input';
import { PrimaryButton } from '../ui/PrimaryButton';
import { isValidVpa } from '../../lib/upiIntent';

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
  vpa,
  onChangeVpa,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  value: string;
  onChangeText: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  submitLabel?: string;
  /** Optional UPI handle. Omit both props to hide the field entirely. */
  vpa?: string;
  onChangeVpa?: (v: string) => void;
}) {
  const disabled = !value.trim();
  const vpaText = vpa ?? '';
  // Shown but never required: a person with no VPA just doesn't get the pay button.
  const vpaBad = vpaText.trim().length > 0 && !isValidVpa(vpaText);
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
      {onChangeVpa && (
        <>
          <Input
            label="UPI ID (optional)"
            value={vpaText}
            onChangeText={onChangeVpa}
            placeholder="name@bank"
            autoCapitalize="none"
            keyboardType="email-address"
            maxLength={256}
            style={styles.gap}
          />
          <Text style={[styles.hint, vpaBad && styles.hintBad]}>
            {vpaBad
              ? "That doesn't look like a UPI ID — expected something like name@bank."
              : 'Lets you settle up straight into their UPI app. Stays on this device.'}
          </Text>
        </>
      )}
      <PrimaryButton label={submitLabel} onPress={onSubmit} disabled={disabled} />
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  gap: { marginBottom: space.md },
  hint: { ...type.caption, color: colors.textMuted, marginTop: -space.sm, marginBottom: space.md },
  hintBad: { color: colors.expense },
});
