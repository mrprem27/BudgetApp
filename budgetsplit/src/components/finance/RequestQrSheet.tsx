import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SheetModal } from '../ui/SheetModal';
import { EmptyState } from '../ui/EmptyState';
import { PrimaryButton } from '../ui/PrimaryButton';
import { buildUpiRequestUri } from '../../lib/upiIntent';
import { formatRupees } from '../../lib/money';
import { colors, type, space, radius } from '../tokens';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Your own handle. `null` when it has never been set — see the empty state. */
  vpa: string | null;
  /** Your name, shown to the payer as `pn`. */
  name?: string;
  /** Absent or non-positive renders an open-amount code. */
  amountPaise?: number;
  /** Who is being asked to scan, for the instruction line. */
  payerName?: string;
  /** Offered only when there is a balance to clear — Settings has nothing to settle. */
  onSettled?: () => void;
  /** Routes to wherever the handle is set. Required for the no-VPA empty state to help. */
  onSetUpiId?: () => void;
};

/**
 * A UPI QR **we display and someone else scans** — the settle-up direction the hand-off
 * never covered.
 *
 * Everything in `useUpiHandoff` is the payer's side: we build an intent and hand it to a
 * UPI app, which then decides whether to trust an intent it did not originate. PhonePe
 * and Paytm decided no, and no payload change moved either of them. This sheet does not
 * argue with that decision — it removes the thing being judged. There is no inbound
 * intent to attribute and no caller to identify, because the payment starts inside the
 * payer's own app when their camera reads this code. Every UPI app supports that path,
 * and it is subject to no gallery-QR cap and no intent risk scoring.
 *
 * The cost is that both people must be in the same room. That is a real limit, and the
 * reason this is an addition rather than a replacement.
 */
export function RequestQrSheet({
  visible, onClose, vpa, name, amountPaise, payerName, onSettled, onSetUpiId,
}: Props) {
  // Null on a malformed handle, so a bad VPA shows the empty state rather than a square
  // that scans into nothing.
  const uri = vpa ? buildUpiRequestUri(vpa, name, amountPaise) : null;
  const hasAmount = Number.isFinite(amountPaise) && (amountPaise as number) > 0;

  return (
    <SheetModal visible={visible} onClose={onClose} title={hasAmount ? 'Request' : 'Your UPI QR'}>
      {!uri ? (
        <EmptyState
          icon="credit-card"
          title="Add your UPI ID first"
          body={
            vpa
              ? 'That handle doesn’t look like a UPI ID. It should read like name@bank.'
              : 'We need your own UPI ID to make a code others can scan. Nothing leaves your phone — it only goes into the QR.'
          }
          actionLabel={onSetUpiId ? 'Add UPI ID' : undefined}
          onAction={onSetUpiId}
        />
      ) : (
        <View style={styles.wrap}>
          {hasAmount && <Text style={styles.amount}>{formatRupees(amountPaise as number)}</Text>}

          {/* White card, black modules — deliberate, not a theme slip. The app is dark
              and a QR rendered in theme colours is unreliable to scan: cameras want a
              light quiet zone and high contrast. */}
          <View style={styles.qrCard}>
            <QRCode value={uri} size={QR_SIZE} backgroundColor="#FFFFFF" color="#000000" ecl="M" />
          </View>

          <Text style={styles.instruction}>
            {payerName
              ? `Ask ${payerName} to scan this with any UPI app`
              : 'Scan this with any UPI app'}
            {hasAmount ? '' : ' to pay any amount'}
          </Text>

          {/* The fallback when the camera won't cooperate — and the only way to check
              the code points where you think it does. */}
          <Text style={styles.vpa} selectable>{vpa}</Text>

          {/* We never learn the outcome — nothing returns from another app's payment —
              so the row is written on the user's say-so, as with record-only Scan & Pay. */}
          {onSettled && (
            <PrimaryButton label="Mark as settled" onPress={onSettled} style={styles.settle} />
          )}
        </View>
      )}
    </SheetModal>
  );
}

/** Big enough to scan across a table at an angle, small enough to clear the sheet. */
const QR_SIZE = 220;

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingBottom: space.md, gap: space.md },
  amount: { ...type.amountXL, color: colors.textPrimary },
  qrCard: {
    backgroundColor: '#FFFFFF',
    padding: space.md,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instruction: { ...type.body, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: space.lg },
  vpa: { ...type.amountSM, color: colors.textMuted },
  settle: { alignSelf: 'stretch', marginTop: space.sm },
});
