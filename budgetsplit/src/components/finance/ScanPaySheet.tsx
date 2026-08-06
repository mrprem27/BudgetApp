import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../tokens';
import { SheetModal } from '../ui/SheetModal';
import { PrimaryButton } from '../ui/PrimaryButton';
import { Input } from '../ui/Input';
import { parseAnyUpiQr, buildUpiUri, type ScanTarget } from '../../lib/upiIntent';
import { useUpiHandoff } from '../../hooks/useUpiHandoff';
import { UpiUriSheet } from './UpiUriSheet';
import { formatRupees, parseToPaise } from '../../lib/money';
import { haptic } from '../../lib/haptics';
import { getCurrentPlaceIfPermitted, type CapturedPlace } from '../../lib/location';
import { categoryForMcc } from '../../lib/mcc';
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
/**
 * Everything the scan knew, handed to whichever route files it.
 *
 * One type for both callbacks because they must record the *same* facts — they differ
 * only in when the payment is known to have happened, never in what we learned.
 */
export type ScannedPayment = {
  vpa: string;
  name?: string;
  amountPaise: number;
  /** From the code's MCC, when it carried one. Absent means "let the guesser decide". */
  category?: string;
  /** Where the user was at the moment of the scan. Absent if denied or unavailable. */
  lat?: number;
  lng?: number;
  placeLabel?: string;
};

export function ScanPaySheet({
  visible,
  onClose,
  onHandoff,
  onAbandon,
  onRecordOnly,
}: {
  visible: boolean;
  onClose: () => void;
  /** Persist what we know about the payment. Awaited *before* the UPI app opens. */
  onHandoff: (p: ScannedPayment) => Promise<void>;
  /** Undo that record — the hand-off never actually happened. */
  onAbandon: () => Promise<void>;
  /**
   * File the transaction without handing off, for a code we can't re-emit honestly.
   *
   * Deliberately not `onHandoff`: that one arms the "did it go through?" prompt for
   * when the user returns from a UPI app, and here they never leave. Asking on the
   * next foreground would be asking about a payment we watched them not make.
   */
  onRecordOnly: (p: ScannedPayment) => Promise<void>;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [target, setTarget] = useState<ScanTarget | null>(null);
  const [amount, setAmount] = useState('');
  const [badCode, setBadCode] = useState(false);
  const [showUris, setShowUris] = useState(false);
  const [place, setPlace] = useState<CapturedPlace | null>(null);
  const handoff = useUpiHandoff('Install a UPI app like PhonePe, Google Pay, Paytm or BHIM to pay from here.');

  /**
   * Start the location fix as soon as a code is recognised — and never wait for it.
   *
   * This is the one import that runs while the user is standing at the merchant, so the
   * device's position *is* the transaction's location. But a GPS fix takes seconds, and
   * this flow exists to be fast: awaiting one when they tap Pay would put a stall between
   * the tap and the UPI app for the sake of a bonus field. Started here, it is almost
   * always ready by the time they have read the payee and typed an amount; if it isn't,
   * the payment goes without it.
   *
   * Never prompts — see `getCurrentPlaceIfPermitted`.
   */
  useEffect(() => {
    if (!target) return;
    let alive = true;
    getCurrentPlaceIfPermitted().then(p => { if (alive) setPlace(p); }).catch(() => {});
    return () => { alive = false; };
  }, [target]);

  function reset() {
    setTarget(null);
    setAmount('');
    setBadCode(false);
    setPlace(null);
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
  // No invented `pn` either — the UPI app resolves the real name from the VPA.
  const payee = target
    ? {
        vpa: target.vpa, name: target.name, amountPaise,
        // Deliberately no `mode` — the scanned code's is not ours to repeat. See buildUpiUri.
        passthrough: target.params, kind: target.kind,
      }
    : null;

  /**
   * What we file, as opposed to what we send a UPI app. Superset: the URI carries only
   * NPCI parameters, while the record also keeps the category and where we were.
   */
  const scanned: ScannedPayment | null = payee && {
    vpa: payee.vpa,
    name: target?.name,
    amountPaise,
    // The merchant's MCC off the QR, which outranks a guess from their display name —
    // it is what they registered with their own bank. Null falls through to the guesser.
    category: categoryForMcc(target?.params?.mc) ?? undefined,
    ...(place ? { lat: place.lat, lng: place.lng, placeLabel: place.label ?? undefined } : {}),
  };
  const canPay = !!payee && amountPaise > 0 && !!buildUpiUri(payee);
  // A shop code we can't re-emit honestly. We know everything except how they'll pay.
  const recordOnly = !!target && !target.canHandoff;

  /**
   * Remember the payment, *then* leave. `openURL` resolves as the OS takes the
   * foreground, so anything started after it races our own suspension — and losing
   * that race means the payment is never recorded and the feature silently does
   * nothing, which is the entire point of it.
   */
  const hooks = {
    before: () =>
      scanned ? onHandoff(scanned) : Promise.resolve(),
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

  async function recordIt() {
    if (!scanned || amountPaise <= 0) return;
    try {
      await onRecordOnly(scanned);
      haptic.success();
      close();
    } catch {
      haptic.error();
      Alert.alert('Couldn’t save that', 'Please add the expense yourself this time.');
    }
  }

  /**
   * Which apps are worth launching bare, and in a signed-QR flow that is *all* of them.
   *
   * Normally only the blocked ones: an app that accepts a hand-off should receive the
   * payment pre-filled, not be opened for the user to retype. But when the code is signed
   * we cannot re-emit it to anybody, so every installed app is in the same position — and
   * scanning the code again in the user's own app is the whole answer.
   */
  const launchable = recordOnly ? [...(handoff.apps ?? []), ...handoff.blocked] : handoff.blocked;
  const launchLabel = launchable.length === 1 ? launchable[0].label : 'UPI app';

  /**
   * Record, then open the app so the payment can be made there.
   *
   * The record is not conditional on the launch: `openApp` files it via `before` and, if the
   * launch then fails, `onAbandon` unwinds it — the same contract the paying path uses. What
   * must never happen is leaving with the money spent and no row to review.
   */
  async function recordAndOpen() {
    if (!payee || amountPaise <= 0) return;
    if (await handoff.openApp(launchable, hooks)) { haptic.success(); close(); }
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
            {/*
              The VPA leads, the name follows. A QR's `pn` is written by whoever made the
              code and nothing here can check it — a swapped sticker can carry an honest
              name over a stranger's handle. NPCI reached the same conclusion and now
              requires UPI apps to display only the *bank-registered* name, resolved from
              the handle; ours cannot resolve it, so it must not present an unverifiable
              name as the answer to "who am I paying".
            */}
            <View style={{ flex: 1 }}>
              <Text style={styles.payeeVpaLead} numberOfLines={1}>{target.vpa}</Text>
              <Text style={styles.payeeNameSub} numberOfLines={1}>
                {target.name ? `“${target.name}” — as written on the code` : 'No name on this code'}
              </Text>
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

          {recordOnly ? (
            <>
              {/*
                Opening the app is the *answer* here, not a consolation. A signed code
                cannot be re-emitted to anyone, and scanning it again in the user's own app
                is exactly how it is meant to be paid — so take them there rather than
                leaving them to find it.
              */}
              <PrimaryButton
                label={launchable.length > 0
                  ? `Record & open ${launchLabel}`
                  : (amountPaise > 0 ? `Record ${formatRupees(amountPaise)}` : 'Record it')}
                onPress={launchable.length > 0 ? recordAndOpen : recordIt}
                disabled={amountPaise <= 0}
              />
              {/*
                Said plainly, because the alternative is handing off to a payment that
                fails only after they've entered their PIN.
              */}
              <Text style={styles.footnote}>
                This shop’s code is secured, so it has to be paid from your UPI app directly.
                Scan it again there and we’ll have it waiting in your review inbox — nothing to type.
              </Text>
            </>
          ) : (
            <>
              {/* Long-press reveals the exact URIs — see UpiUriSheet for why that exists. */}
              <PrimaryButton
                label={canPay ? `Pay ${formatRupees(amountPaise)}` : 'Pay'}
                onPress={pay}
                onLongPress={() => canPay && setShowUris(true)}
                disabled={!canPay}
              />

              {/*
                Destination and the way to change it on one line, rather than a long
                button label plus a separate link plus a footnote — three stacked blocks
                saying what one row can. Absent when nothing is remembered, because the
                picker is about to ask anyway.
              */}
              {soleApp && (
                <View style={styles.destRow}>
                  {/* `handoff.target` can only be an app that accepts us — blocked ones are
                      filtered out upstream, so this never needs a refusal state. */}
                  <Text style={styles.destText} numberOfLines={1}>Opens {soleApp.label}</Text>
                  {handoff.canChoose && (
                    <TouchableOpacity onPress={changeApp} hitSlop={12} accessibilityRole="button">
                      <Text style={styles.destChange}>Change</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/*
                Always offered, not only when hand-off is known-broken.
                PhonePe and Amazon Pay refuse externally-supplied intents by policy, and
                nothing reports that back to us — so without this the user is left having
                made a payment with no record of it, which is precisely what Scan & Pay
                exists to prevent. The scan already knows payee, amount and category.
              */}
              {/*
                One row, never two. When a refusing app is installed this becomes the way
                round it — PhonePe and Paytm reject *externally-supplied* intents, but a live
                scan in their own app is their most-trusted input, so with the code still in
                front of you it completes the payment they blocked, and the expense is filed
                on the way out.

                It replaces "Record it, I'll pay" rather than sitting beside it. The cost is
                that paying in cash while PhonePe is installed opens an app you didn't want —
                minor, and the record is made either way.

                A "Type amount there" action briefly sat here too, handing over the payee with
                `am` withheld. It failed on PhonePe, Paytm and Amazon Pay alike, each giving
                the identical error it gave with the amount pre-filled, so it was removed.
              */}
              <TouchableOpacity
                onPress={launchable.length > 0 ? recordAndOpen : recordIt}
                disabled={amountPaise <= 0}
                hitSlop={8}
                accessibilityRole="button"
                style={styles.recordRow}
              >
                <Text style={[styles.recordText, amountPaise <= 0 && styles.recordTextOff]}>
                  {launchable.length > 0 ? `Record & open ${launchLabel}` : 'Record it, I’ll pay'}
                </Text>
              </TouchableOpacity>

              {/* The app never learns the outcome, so it must not claim to. */}
              <Text style={styles.footnote}>We’ll ask whether it went through when you come back.</Text>
            </>
          )}
        </>
      )}

      <UpiUriSheet
        visible={showUris}
        onClose={() => setShowUris(false)}
        request={payee}
        apps={handoff.apps}
      />
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
  payeeVpaLead: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  payeeNameSub: { ...type.caption, color: colors.textMuted, marginTop: 1 },
  fixedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
  fixedLabel: { ...type.caption, color: colors.textMuted },
  fixedValue: { fontFamily: 'SpaceMono_400Regular', fontSize: 18, color: colors.textPrimary },
  destRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, marginTop: space.md, minHeight: 24 },
  destText: { ...type.caption, color: colors.textSecondary, flexShrink: 1 },
  destChange: { ...type.caption, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  recordRow: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: space.md, marginTop: space.xs },
  recordText: { ...type.body, color: colors.accent },
  recordTextOff: { color: colors.textMuted },
  footnote: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.sm, lineHeight: 16 },
});
