import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, type, space, radius } from '../../tokens';
import { SheetModal } from '../../ui/SheetModal';
import { Input } from '../../ui/Input';
import { PrimaryButton } from '../../ui/PrimaryButton';

const MIN_LENGTH = 6;

type Props = {
  visible: boolean;
  onClose: () => void;
  mode: 'create' | 'restore';
  onSubmit: (passphrase: string) => void;
  submitting?: boolean;
  /**
   * 0-100 while the key is being derived, or null when there is nothing to say.
   *
   * Unlocking a backup is 50,000 PBKDF2 rounds — most of a second on a phone, and
   * the only part of a restore with a visible wait. A bare spinner cannot tell
   * someone whether to wait or force-quit; a number that moves can.
   */
  progress?: number | null;
  /** Set after a failed restore attempt (e.g. wrong passphrase) — shown inline
   *  so a retry doesn't stack an Alert on top of this sheet. */
  error?: string | null;
  /** Extra controls for `create` mode, rendered above the fields (e.g. what to include). */
  extra?: React.ReactNode;
};

/**
 * `mode: 'create'` — set + confirm a new passphrase, with an explicit warning
 * that it's never stored and can't be recovered if forgotten.
 * `mode: 'restore'` — enter the passphrase for a picked backup file.
 */
export function PassphraseSheet({ visible, onClose, mode, onSubmit, submitting, progress, error, extra }: Props) {
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');

  useEffect(() => {
    if (visible) { setPass(''); setConfirm(''); }
  }, [visible, mode]);

  const tooShort = pass.length > 0 && pass.length < MIN_LENGTH;
  const mismatch = mode === 'create' && confirm.length > 0 && pass !== confirm;
  const canSubmit = mode === 'create'
    ? pass.length >= MIN_LENGTH && pass === confirm
    : pass.length > 0;

  return (
    <SheetModal visible={visible} onClose={onClose} title={mode === 'create' ? 'Set a backup passphrase' : 'Enter passphrase'}>
      {mode === 'create' ? (
        <>
          {/* What goes in the file, decided before the passphrase — it changes the
              size of the thing being made, so it belongs above the commit step. */}
          {extra}
          <Text style={styles.warning}>
            This passphrase encrypts your backup. It is never stored anywhere — not on this
            device, not by BudgetSplit. If you forget it, this backup can never be recovered
            by anyone, including you. Write it down somewhere safe.
          </Text>
          <Input
            label="Passphrase"
            value={pass}
            onChangeText={setPass}
            secureTextEntry
            autoCapitalize="none"
            placeholder={`At least ${MIN_LENGTH} characters`}
            style={styles.field}
          />
          <Input
            label="Confirm passphrase"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Type it again"
            style={styles.field}
          />
          {tooShort && <Text style={styles.error}>At least {MIN_LENGTH} characters.</Text>}
          {mismatch && <Text style={styles.error}>Passphrases don't match.</Text>}
        </>
      ) : (
        <>
          <Text style={styles.hint}>Enter the passphrase this backup was created with.</Text>
          <Input
            label="Passphrase"
            value={pass}
            onChangeText={setPass}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Passphrase"
            style={styles.field}
          />
          {error && <Text style={styles.error}>{error}</Text>}
        </>
      )}
      <PrimaryButton
        label={submitting && progress != null ? `Unlocking… ${progress}%` : mode === 'create' ? 'Continue' : 'Unlock'}
        onPress={() => onSubmit(pass)}
        disabled={!canSubmit || submitting}
        loading={submitting && progress == null}
        style={styles.button}
      />
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  warning: { ...type.caption, color: colors.healthAmber, lineHeight: 18, marginBottom: space.md, backgroundColor: colors.bgMuted, borderRadius: radius.md, padding: space.sm },
  hint: { ...type.caption, color: colors.textSecondary, lineHeight: 18, marginBottom: space.md },
  field: { marginBottom: space.sm },
  error: { ...type.caption, color: colors.expense, marginTop: -space.xs, marginBottom: space.sm },
  button: { marginTop: space.sm },
});
