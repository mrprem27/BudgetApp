import React, { useState } from 'react';
import { Text, StyleSheet, TouchableOpacity, Share } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SheetModal } from '../../ui/SheetModal';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { colors, type, space, radius, layout } from '../../tokens';
import { haptic } from '../../../lib/haptics';

/**
 * The one time this code is ever shown.
 *
 * It replaces asking the user to invent a passphrase, because the passphrase's
 * only job is keeping the server blind and 20 characters of real randomness do
 * that better than anything typed. The wall of inventing and remembering an
 * unrecoverable secret is what made people leave the switch off — and a feature
 * nobody turns on protects nothing.
 *
 * Two rules this screen exists to honour:
 *
 * 1. **Say the cost, before the switch flips.** Lose the phone and never save the
 *    code, and the copy cannot be opened by anybody, including us. That is not a
 *    regression — it is exactly today's position for somebody with no account —
 *    but it must be said here rather than discovered later.
 * 2. **Do not pretend it can be shown again.** It genuinely cannot: it goes
 *    straight into the keychain and is never rendered anywhere else. "Saved it"
 *    is a real acknowledgement, not a formality, so the button says so.
 */
export function RecoveryCodeSheet({
  visible, code, onConfirm, onClose, submitting = false,
}: {
  visible: boolean;
  /** Null when nothing has been generated yet — the sheet stays closed. */
  code: string | null;
  onConfirm: (code: string) => void;
  onClose: () => void;
  submitting?: boolean;
}) {
  const [saved, setSaved] = useState(false);

  /**
   * The share sheet, not the clipboard.
   *
   * A clipboard entry is one copy away from being gone, and this is a secret the
   * user needs in six months on a phone they do not own yet. The share sheet
   * reaches a password manager, Notes, or their own email — somewhere it will
   * still be. `Share` is already how this app hands out an invite link, so it is
   * a known-good path here rather than a new dependency.
   */
  async function save() {
    if (!code) return;
    try {
      const res = await Share.share({ message: code });
      // `dismissedAction` means they backed out without choosing anywhere, so the
      // code is not saved and the button must not claim otherwise.
      if (res.action === Share.dismissedAction) return;
      setSaved(true);
      haptic.success();
    } catch {
      haptic.error();
    }
  }

  return (
    <SheetModal
      visible={visible && !!code}
      onClose={onClose}
      title="Save your recovery code"
    >
      <Text style={styles.body}>
        This is the only thing that can open your copy. We never see it, so we can’t
        reset it — save it somewhere before you carry on.
      </Text>

      {/* Selectable, so somebody who would rather transcribe it can. */}
      <TouchableOpacity style={styles.codeBox} onPress={save} accessibilityRole="button" accessibilityLabel="Save recovery code">
        <Text style={styles.code} selectable>{code}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.copyBtn} onPress={save} accessibilityRole="button">
        <Feather name={saved ? 'check' : 'share'} size={14} color={colors.accent} />
        <Text style={styles.copyText}>{saved ? 'Saved' : 'Save it somewhere'}</Text>
      </TouchableOpacity>

      <Text style={styles.warn}>
        If you lose this phone and haven’t saved this code, the copy can’t be opened
        by anyone.
      </Text>

      {/*
        Gated on having actually saved it. This is the one screen where "I'll do
        it later" reliably means never, and the cost lands months from now on
        somebody who has just lost their phone — so the button will not pretend.
      */}
      <PrimaryButton
        label={saved ? 'I’ve saved it' : 'Save it first'}
        onPress={() => code && onConfirm(code)}
        disabled={!saved}
        loading={submitting}
      />
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  body: { ...type.body, color: colors.textSecondary, marginBottom: space.md },
  codeBox: {
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space.md,
    paddingHorizontal: space.smd,
    alignItems: 'center',
  },
  // SpaceMono, like every other figure in the app: this is copied character by
  // character, so an ambiguous glyph is a support ticket.
  code: { fontFamily: 'SpaceMono_400Regular', fontSize: 17, color: colors.textPrimary, letterSpacing: 1 },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs,
    minHeight: layout.touchMin, marginBottom: space.sm,
  },
  copyText: { ...type.caption, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  warn: { ...type.caption, color: colors.textMuted, marginBottom: space.md },
});
