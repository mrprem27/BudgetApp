import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../tokens';
import { SheetModal } from '../ui/SheetModal';
import { PrimaryButton } from '../ui/PrimaryButton';
import { Input } from '../ui/Input';
import { parseAnyUpiQr, buildUpiUri, type ScanTarget } from '../../lib/upiIntent';
import { useUpiHandoff } from '../../hooks/useUpiHandoff';
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
  const handoff = useUpiHandoff('Install a UPI app like PhonePe, Google Pay, Paytm or BHIM to pay from here.');

  function reset() {
    setTarget(null);
    setAmount('');
    setBadCode(false);
  }

  function close() {
    reset();
    onClose();
  }

  // When we're not going to ask, the button has to say where it's about to go, or the
  // app that opens looks like something the sheet picked at random.
  const soleApp = handoff.target;
  const amountPaise = target?.amountPaise ?? parseToPaise(amount);
  // A code that fixes its own amount is not editable — changing it would send a
  // figure the merchant did not ask for.
  const amountFixed = !!target?.amountPaise;
  // No `note`: a `tn` the payee never wrote makes the request differ from the code they
  // published, and `passthrough` carries the fields that say it *is* their request.
  const payee = target
    ? { vpa: target.vpa, name: target.name ?? 'Payee', amountPaise, passthrough: target.params }
    : null;
  const canPay = !!payee && amountPaise > 0 && !!buildUpiUri(payee);

  /**
   * Remember the payment, *then* leave. `openURL` resolves as the OS takes the
   * foreground, so anything started after it races our own suspension — and losing
   * that race means the payment is never recorded and the feature silently does
   * nothing, which is the entire point of it.
   */
  const hooks = {
    before: () =>
      payee ? onHandoff({ vpa: payee.vpa, name: target?.name, amountPaise }) : Promise.resolve(),
    // Cancelled or failed to launch, so the record above would ask about a payment
    // that was never even attempted.
    onCancel: onAbandon,
  };

  /** Closes only once an app actually opened — a cancelled picker leaves you here. */
  async function run(go: (req: typeof payee & object, h: typeof hooks) => Promise<boolean>) {
    if (!payee || !canPay) return;
    if (await go(payee, hooks)) { haptic.success(); close(); }
  }

  const pay = () => run(handoff.pay);
  const changeApp = () => run(handoff.choose);

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
          {/* Only worth drawing when there is somewhere else to go. */}
          {soleApp && handoff.canChoose && (
            <TouchableOpacity onPress={changeApp} hitSlop={8} accessibilityRole="button" style={styles.changeApp}>
              <Text style={styles.changeAppText}>Use a different app</Text>
            </TouchableOpacity>
          )}
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
  changeApp: { alignSelf: 'center', paddingVertical: space.sm, paddingHorizontal: space.md, minHeight: 44, justifyContent: 'center' },
  changeAppText: { ...type.body, color: colors.accent },
  footnote: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.sm, lineHeight: 16 },
});
