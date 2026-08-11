import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, type, space, radius } from '../tokens';
import { SheetModal } from '../ui/SheetModal';
import { PrimaryButton } from '../ui/PrimaryButton';
import { parseUpiQr, type ScannedUpi } from '../../lib/upiIntent';
import { haptic } from '../../lib/haptics';
import { pickQrFromLibrary, qrPickMessage } from '../../lib/qrFromImage';
import { PickQrFromPhotos } from './PickQrFromPhotos';

/**
 * Live camera scan of a friend's UPI QR.
 *
 * Typing `name@okhdfcbank` off someone else's phone screen was the highest-friction
 * step in setting up a settle-up, and the easiest to get subtly wrong — a mistyped
 * handle saves fine and then silently produces no Pay button. Their QR already
 * encodes the handle *and* their name, so a scan removes both problems at once.
 * Typing remains as the fallback.
 *
 * Only fires on a code that parses to a real VPA. An unrecognised code updates the
 * hint and keeps scanning rather than closing: a wrong payee is the one error that
 * must not happen when the next step is sending money.
 */
export function UpiQrScanner({
  visible,
  onClose,
  onScan,
}: {
  visible: boolean;
  onClose: () => void;
  onScan: (result: ScannedUpi) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [badCode, setBadCode] = useState(false);
  // The camera fires continuously; without this the same code lands many times
  // while the sheet is still closing.
  const [done, setDone] = useState(false);
  const [pickHint, setPickHint] = useState<string | null>(null);

  const accept = (raw: string) => {
    const parsed = parseUpiQr(raw);
    if (!parsed) return false;
    setDone(true);
    haptic.success();
    onScan(parsed);
    return true;
  };

  async function handlePickFromPhotos() {
    if (done) return;
    setPickHint(null);
    const res = await pickQrFromLibrary();
    if (res.status === 'ok') {
      if (!accept(res.data)) {
        setPickHint('That’s not a personal UPI QR — shop/BharatQR codes aren’t supported.');
      }
      return;
    }
    setPickHint(qrPickMessage(res.status));
  }

  if (!visible) return null;

  return (
    <SheetModal visible={visible} onClose={onClose} title="Scan their UPI QR">
      {!permission?.granted ? (
        <View style={styles.pad}>
          <Text style={styles.body}>
            {permission?.canAskAgain === false
              ? 'Camera access is off for BudgetSplit. Turn it on in your phone’s Settings to scan a UPI QR — or just type the ID instead.'
              : 'BudgetSplit needs the camera to read a UPI QR. Nothing is recorded or uploaded — the code is read on your device.'}
          </Text>
          {permission?.canAskAgain !== false && (
            <PrimaryButton label="Allow camera" onPress={requestPermission} />
          )}
          {/* Reading a saved QR needs no camera, so a denied camera must not block it. */}
          <PickQrFromPhotos onPress={handlePickFromPhotos} />
          {pickHint && <Text style={[styles.hint, styles.hintBad]}>{pickHint}</Text>}
        </View>
      ) : (
        <>
          <View style={styles.cameraWrap}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => {
                if (done) return;
                if (!accept(data)) setBadCode(true);
              }}
            />
            <View style={styles.reticle} pointerEvents="none" />
          </View>
          <Text style={[styles.hint, (badCode || !!pickHint) && styles.hintBad]}>
            {pickHint ?? (badCode
              ? 'That’s not a personal UPI QR — shop/BharatQR codes aren’t supported. Type the ID instead.'
              : 'Ask them to open their UPI app’s “Receive money” QR.')}
          </Text>
          {/* Their QR usually arrives as a screenshot, not a phone held up to yours. */}
          <PickQrFromPhotos onPress={handlePickFromPhotos} />
        </>
      )}
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  pad: { gap: space.md, paddingBottom: space.sm },
  body: { ...type.body, color: colors.textSecondary, lineHeight: 20 },
  cameraWrap: { height: 300, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.bgInput, marginBottom: space.md },
  reticle: { position: 'absolute', top: 40, left: 60, right: 60, bottom: 40, borderWidth: 2, borderColor: colors.accent, borderRadius: radius.md },
  hint: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginBottom: space.md, lineHeight: 16 },
  hintBad: { color: colors.expense },
});
