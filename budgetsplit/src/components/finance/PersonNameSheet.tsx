import React, { useState } from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, type, space, layout } from '../tokens';
import { SheetModal } from '../ui/SheetModal';
import { Input } from '../ui/Input';
import { PrimaryButton } from '../ui/PrimaryButton';
import { Feather } from '@expo/vector-icons';
import { isValidVpa } from '../../lib/upiIntent';
import { UpiQrScanner } from './UpiQrScanner';

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
  phone,
  onChangePhone,
  onDelete,
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
  /**
   * Optional phone number — what a WhatsApp reminder is sent to. Omit both props
   * to hide the field. Always yours to set: if a linked account ever offers a
   * number, it is offered *into* this field, never written over it.
   */
  phone?: string;
  onChangePhone?: (v: string) => void;
  /**
   * Remove this person entirely. Omit to hide.
   *
   * Only ever offered for somebody with no history — the query refuses anyone
   * else — which is why it can be a plain destructive action rather than a
   * warning about what it will take with it. It takes nothing with it; that is
   * the condition of it being allowed at all.
   */
  onDelete?: () => void;
}) {
  const [scanning, setScanning] = useState(false);
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
          <TouchableOpacity style={styles.scanBtn} onPress={() => setScanning(true)} accessibilityRole="button" accessibilityLabel="Scan their UPI QR code">
            <Feather name="maximize" size={14} color={colors.accent} />
            <Text style={styles.scanText}>Scan their UPI QR instead</Text>
          </TouchableOpacity>
          <Text style={[styles.hint, vpaBad && styles.hintBad]}>
            {vpaBad
              ? "That doesn't look like a UPI ID — expected something like name@bank."
              : 'Lets you settle up straight into their UPI app. Stays on this device.'}
          </Text>
        </>
      )}
      {onChangePhone && (
        <>
          <Input
            label="Phone (optional)"
            value={phone ?? ''}
            onChangeText={onChangePhone}
            placeholder="+91 98765 43210"
            keyboardType="phone-pad"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={24}
            style={styles.gap}
          />
          <Text style={styles.hint}>
            Used to remind them on WhatsApp. Stays on this device.
          </Text>
        </>
      )}
      <PrimaryButton label={submitLabel} onPress={onSubmit} disabled={disabled} />
      {onDelete && (
        <TouchableOpacity
          style={styles.removeBtn}
          onPress={onDelete}
          accessibilityRole="button"
        >
          <Feather name="trash-2" size={14} color={colors.expense} />
          <Text style={styles.removeText}>Remove this person</Text>
        </TouchableOpacity>
      )}

      <UpiQrScanner
        visible={scanning}
        onClose={() => setScanning(false)}
        onScan={({ vpa: scanned, name }) => {
          onChangeVpa?.(scanned);
          // The QR usually carries their name too — used only when the field is
          // still empty, never overwriting a name the user deliberately typed.
          if (name && !value.trim()) onChangeText(name);
          setScanning(false);
        }}
      />
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  gap: { marginBottom: space.md },
  hint: { ...type.caption, color: colors.textMuted, marginTop: -space.sm, marginBottom: space.md },
  hintBad: { color: colors.expense },
  scanBtn: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start', marginTop: -space.sm, marginBottom: space.sm, paddingVertical: space.xs },
  scanText: { ...type.caption, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  // `layout.touchMin` tall so the one destructive control in this sheet is not
  // the hardest thing in it to hit (§6).
  removeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs,
    minHeight: layout.touchMin, marginTop: space.smd,
  },
  removeText: { ...type.caption, color: colors.expense, fontFamily: 'Inter_600SemiBold' },
});
