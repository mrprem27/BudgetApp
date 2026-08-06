import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Alert, ActionSheetIOS } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../tokens';
import { SheetModal } from '../ui/SheetModal';
import { PrimaryButton } from '../ui/PrimaryButton';
import { Input } from '../ui/Input';
import { parseAnyUpiQr, buildUpiUri, type ScanTarget } from '../../lib/upiIntent';
import { useUpiApps } from '../../hooks/useUpiApps';
import { formatRupees, parseToPaise } from '../../lib/money';
import { haptic } from '../../lib/haptics';
import { alpha } from '../../theme';

/**
 * Scan a UPI QR, enter the amount, hand off to a UPI app — and remember the payment
 * so it can be recorded on return.
 *
 * The point is to stop people typing in transactions they already made. Paying
 * *through* the app is the only moment BudgetSplit can know a payment happened
 * without a bank feed, which both blocked ingestion routes (`F4` GPay export format,
 * `F5` Gmail CASA) would otherwise have supplied.
 *
 * It still cannot observe the *outcome* — the UPI app never reports back — so nothing
 * is written here. `onHandoff` persists the attempt and the app asks on return.
 */
export function ScanPaySheet({
  visible,
  onClose,
  onHandoff,
  onAbandon,
}: {
  visible: boolean;
  onClose: () => void;
  /** Persist what we know about the payment. Awaited *before* the UPI app opens. */
  onHandoff: (p: { vpa: string; name?: string; amountPaise: number }) => Promise<void>;
  /** Undo that record — the hand-off never actually happened. */
  onAbandon: () => Promise<void>;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [target, setTarget] = useState<ScanTarget | null>(null);
  const [amount, setAmount] = useState('');
  const [badCode, setBadCode] = useState(false);
  const iosApps = useUpiApps();

  function reset() {
    setTarget(null);
    setAmount('');
    setBadCode(false);
  }

  function close() {
    reset();
    onClose();
  }

  // Exactly one installed app means no picker — so the button has to say which one it
  // is, or the app that opens looks like something the sheet chose at random.
  const soleApp = iosApps?.length === 1 ? iosApps[0] : null;
  const amountPaise = target?.amountPaise ?? parseToPaise(amount);
  // A code that fixes its own amount is not editable — changing it would send a
  // figure the merchant did not ask for.
  const amountFixed = !!target?.amountPaise;
  const payee = target ? { vpa: target.vpa, name: target.name ?? 'Payee', amountPaise, note: 'BudgetSplit' } : null;
  const canPay = !!payee && amountPaise > 0 && !!buildUpiUri(payee);

  async function open(uri: string | null) {
    if (!uri || !payee) return;

    // Record BEFORE handing over, not after. `openURL` resolves at the moment the OS
    // takes the foreground away, so a write started in its `.then` races our own
    // suspension — and if it loses, the payment is never remembered and the feature
    // silently does nothing. Persisting first costs one storage write on a path that
    // is about to leave the app anyway.
    try {
      await onHandoff({ vpa: payee.vpa, name: target?.name, amountPaise });
    } catch {
      // Couldn't remember it, so don't pretend we will. Paying is still the point.
    }

    try {
      await Linking.openURL(uri);
      haptic.success();
      close();
    } catch {
      // No app switch happened, so the record above would ask about a payment that
      // was never even attempted.
      await onAbandon().catch(() => {});
      Alert.alert('Couldn’t open that app', 'Try another UPI app, or pay in your bank app and add it here.');
    }
  }

  /** Identical hand-off rules to settle-up — see `useUpiApps` for the platform split. */
  function pay() {
    if (!payee || !canPay) return;
    if (iosApps === null) { open(buildUpiUri(payee)); return; }
    if (iosApps.length === 0) {
      Alert.alert('No UPI app found', 'Install a UPI app like PhonePe, Google Pay, Paytm or BHIM to pay from here.');
      return;
    }
    if (iosApps.length === 1) { open(buildUpiUri(payee, iosApps[0].key)); return; }
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Cancel', ...iosApps.map(a => a.label)], cancelButtonIndex: 0, title: `Pay ${formatRupees(amountPaise)}` },
      i => { if (i > 0) open(buildUpiUri(payee, iosApps[i - 1].key)); },
    );
  }

  if (!visible) return null;

  return (
    <SheetModal visible={visible} onClose={close} title={target ? 'Pay' : 'Scan to pay'}>
      {!target ? (
        !permission?.granted ? (
          <View style={styles.pad}>
            <Text style={styles.body}>
              {permission?.canAskAgain === false
                ? 'Camera access is off for BudgetSplit. Turn it on in your phone’s Settings to scan a payment QR.'
                : 'BudgetSplit needs the camera to read a payment QR. The code is read on your device and nothing is uploaded.'}
            </Text>
            {permission?.canAskAgain !== false && <PrimaryButton label="Allow camera" onPress={requestPermission} />}
          </View>
        ) : (
          <>
            <View style={styles.cameraWrap}>
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={({ data }) => {
                  if (target) return;
                  const parsed = parseAnyUpiQr(data);
                  if (!parsed) { setBadCode(true); return; }
                  haptic.selection();
                  setTarget(parsed);
                }}
              />
              <View style={styles.reticle} pointerEvents="none" />
            </View>
            <Text style={[styles.hint, badCode && styles.hintBad]}>
              {badCode
                ? 'That isn’t a UPI payment code. Try again, or pay in your bank app and add it here.'
                : 'Point at any UPI QR — a shop’s counter code or a person’s.'}
            </Text>
          </>
        )
      ) : (
        <>
          <View style={styles.payeeCard}>
            <View style={styles.payeeIcon}>
              <Feather name={target.kind === 'merchant' ? 'shopping-bag' : 'user'} size={16} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.payeeName} numberOfLines={1}>{target.name ?? target.vpa}</Text>
              <Text style={styles.payeeVpa} numberOfLines={1}>{target.vpa}</Text>
            </View>
            <TouchableOpacity onPress={reset} hitSlop={10} accessibilityRole="button" accessibilityLabel="Scan a different code">
              <Feather name="refresh-cw" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {amountFixed ? (
            <View style={styles.fixedRow}>
              <Text style={styles.fixedLabel}>Amount set by the code</Text>
              <Text style={styles.fixedValue}>{formatRupees(amountPaise)}</Text>
            </View>
          ) : (
            <Input
              label="Amount"
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              keyboardType="decimal-pad"
              autoFocus
              style={styles.gap}
            />
          )}

          <PrimaryButton
            label={
              !canPay ? 'Pay'
                : soleApp ? `Pay ${formatRupees(amountPaise)} with ${soleApp.label}`
                : `Pay ${formatRupees(amountPaise)}`
            }
            onPress={pay}
            disabled={!canPay}
          />
          {/* The app never learns the outcome, so it must not claim to. */}
          <Text style={styles.footnote}>
            Opens your UPI app. Come back and we’ll ask whether it went through, then add it for you.
          </Text>
        </>
      )}
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  pad: { gap: space.md, paddingBottom: space.sm },
  body: { ...type.body, color: colors.textSecondary, lineHeight: 20 },
  gap: { marginBottom: space.md },
  cameraWrap: { height: 300, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.bgInput, marginBottom: space.md },
  reticle: { position: 'absolute', top: 40, left: 60, right: 60, bottom: 40, borderWidth: 2, borderColor: colors.accent, borderRadius: radius.md },
  hint: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginBottom: space.md, lineHeight: 16 },
  hintBad: { color: colors.expense },
  payeeCard: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, marginBottom: space.md },
  payeeIcon: { width: 32, height: 32, borderRadius: radius.lg, backgroundColor: alpha(colors.accent, 13), alignItems: 'center', justifyContent: 'center' },
  payeeName: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  payeeVpa: { ...type.caption, color: colors.textMuted, marginTop: 1 },
  fixedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
  fixedLabel: { ...type.caption, color: colors.textMuted },
  fixedValue: { fontFamily: 'SpaceMono_400Regular', fontSize: 18, color: colors.textPrimary },
  footnote: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.sm, lineHeight: 16 },
});
