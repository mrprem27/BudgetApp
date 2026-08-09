import React from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Linking, Alert, ActionSheetIOS } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../tokens';
import { MemberAvatar } from './MemberAvatar';
import { PayMethodSelector } from './PayMethodSelector';
import { formatRupees } from '../../lib/money';
import { buildUpiUri, buildUpiRequestUri } from '../../lib/upiIntent';
import { RequestQrSheet } from './RequestQrSheet';
import { UpiUriSheet } from './UpiUriSheet';
import { useUpiHandoff, handoffVerb } from '../../hooks/useUpiHandoff';
import { haptic } from '../../lib/haptics';
import type { Person } from '../../db/queries/persons';
import type { TransferScopes } from '../../lib/settleScope';
import { TRANSFER_SCOPE_ALL, type TransferScope } from '../../constants/enums';
import type { PayMethod } from '../../constants/enums';
import { alpha } from '../../theme';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, ReduceMotion } from 'react-native-reanimated';
import { PressableScale } from '../ui/PressableScale';
import { useFeatureFlags } from '../system/FeatureFlagsProvider';

type Props = {
  me: Person | null;
  persons: Person[];
  fromId: string;
  toId: string;
  onPickSlot: (slot: 'from' | 'to') => void;
  onSwap: () => void;
  scopes: TransferScopes | null;
  /** Which debt is being settled. Chosen by the ContextPill above the amount;
   *  used here only to show the resulting balance line. */
  scope: TransferScope;
  payMethod: PayMethod;
  onPayMethod: (m: PayMethod) => void;
  note: string;
  onNote: (t: string) => void;
  /** Amount being settled, in paise — drives the UPI handoff. */
  amountPaise?: number;
};

/** Transfer body for the Add modal's "Transfer" pill — any payer → any recipient.
 *  The transfer reason is a real 'transfer' category picked via the shared
 *  category pill in Quick Add (same UI as Expense/Income). */
export function TransferBody({ me, persons, fromId, toId, onPickSlot, onSwap, scopes, scope, payMethod, onPayMethod, note, onNote, amountPaise = 0 }: Props) {
  const { flags } = useFeatureFlags();
  const from = persons.find(p => p.id === fromId) ?? null;
  const to = persons.find(p => p.id === toId) ?? null;
  const nameOf = (p: Person | null, fallback: string) => p ? (p.id === me?.id ? 'You' : p.name.split(' ')[0]) : fallback;

  const entry = scope === TRANSFER_SCOPE_ALL ? scopes?.all : scopes?.groups.find(g => g.groupId === scope);
  const bal = entry?.amount ?? 0;

  // Me-aware balance label (net-negative = "You owe"), consistent with the rest of
  // the app. The amount renders right-aligned beside it.
  let balLabel: string | null = null;
  let balColor: string = colors.settle;
  // Distinct from "nobody picked yet": once both people are chosen, a zero balance is a fact
  // worth stating, because it tells you this is a fresh transfer and not a settlement.
  let noBalance = false;
  if (fromId && toId) {
    if (bal > 0 && entry) {
      const owerName = nameOf(persons.find(p => p.id === entry.from) ?? null, 'Someone');
      const oweeName = nameOf(persons.find(p => p.id === entry.to) ?? null, 'someone');
      if (entry.from === me?.id) { balLabel = `You owe ${oweeName}`; balColor = colors.expense; }
      else if (entry.to === me?.id) { balLabel = `${owerName} owes you`; balColor = colors.income; }
      else { balLabel = `${owerName} owes ${oweeName}`; balColor = colors.settle; }
    } else {
      noBalance = true;
    }
  }

  // Only when we know who is being paid, have their handle, and have an amount.
  // No VPA → no button, and settling behaves exactly as it did before.
  const payee = flags.upiSettle && to && to.id !== me?.id && to.upi_vpa && amountPaise > 0
    // Settling up with a friend is always person-to-person, so no `tr` — see UpiRequest.
    ? { vpa: to.upi_vpa, name: to.name, amountPaise, note: note || 'BudgetSplit settle up', kind: 'person' as const }
    : null;
  // Every hand-off rule — the Android/iOS split, the remembered app, the picker —
  // lives in the hook, so this path and Scan & Pay cannot drift apart again.
  const handoff = useUpiHandoff(
    'Install a UPI app like PhonePe, Google Pay, Paytm or BHIM to pay from here — or record this settlement manually.',
  );
  // A malformed VPA yields no URI at all, so there is nothing to offer.
  const canPay = !!payee && !!buildUpiUri(payee);

  function payViaUpi() {
    if (payee) handoff.pay(payee);
  }

  /**
   * The other direction, which had no affordance at all.
   *
   * `payee` above requires `to.id !== me.id`, so when the money is owed *to* you this
   * block rendered nothing — the one case the hand-off could never serve, since we
   * cannot reach into someone else's phone to open their UPI app.
   *
   * A QR does reach it, and better than an intent would: the payer's own camera starts
   * the payment inside their own app, so there is no external intent for PhonePe or
   * Paytm to refuse. See `RequestQrSheet`.
   *
   * Needs your handle set — Settings › Getting paid. Deliberately hidden rather than
   * shown-then-explained: the escape from here would be a route change out of a
   * half-filled wizard, which costs more than the row is worth.
   */
  const canRequest = flags.upiSettle
    && !!me?.upi_vpa
    && to?.id === me.id
    && !!from && from.id !== me.id
    && amountPaise > 0
    && !!buildUpiRequestUri(me.upi_vpa, me.name, amountPaise);
  const [showRequest, setShowRequest] = React.useState(false);
  const [showUris, setShowUris] = React.useState(false);

  return (
    <View style={styles.wrap}>
      {/* Only the *balance* line, and only when there is one. The old fallback prose ("Pick who
          paid and who received") restated what the two labelled tiles and the arrow below
          already say — and it occupied the same slot as a real balance, so the one line worth
          reading looked like a hint. */}
      {balLabel && (
        <View style={styles.balRow}>
          <Text style={[styles.balRowLabel, { color: balColor }]} numberOfLines={1}>{balLabel}</Text>
          <Text style={[styles.balRowAmt, { color: balColor }]}>{formatRupees(bal)}</Text>
        </View>
      )}
      {noBalance && (
        <Text style={styles.hint}>No balance between them — enter any amount</Text>
      )}

      {/* FROM → TO direction */}
      <View style={[styles.dirCard, !!fromId && !!toId && fromId === toId && styles.dirCardError]}>
        <TouchableOpacity style={styles.dirTile} onPress={() => onPickSlot('from')} accessibilityRole="button" accessibilityLabel="Choose who paid">
          <Text style={styles.dirLabel}>FROM</Text>
          <MemberAvatar name={from?.name ?? '?'} color={from?.avatar_color ?? colors.accent} size={52} imageUri={from?.image_uri} />
          <Text style={styles.dirName} numberOfLines={1}>{nameOf(from, 'Pick')}</Text>
        </TouchableOpacity>

        {/* The centre states the direction and reverses it — one control, because "which way
            does the money go" and "send it the other way" are the same question asked twice.
            A `repeat` glyph sat here before and said neither. */}
        <DirectionArrow onSwap={onSwap} />

        <TouchableOpacity style={styles.dirTile} onPress={() => onPickSlot('to')} accessibilityRole="button" accessibilityLabel="Choose who received">
          <Text style={styles.dirLabel}>TO</Text>
          <MemberAvatar name={to?.name ?? '?'} color={to?.avatar_color ?? colors.accent} size={52} imageUri={to?.image_uri} />
          <Text style={styles.dirName} numberOfLines={1}>{nameOf(to, 'Pick')}</Text>
        </TouchableOpacity>
      </View>
      {!!fromId && !!toId && fromId === toId && (
        <Text style={styles.errText}>From and To must be different people.</Text>
      )}

      {/* How was it paid? */}
      <Text style={styles.label}>HOW WAS IT PAID?</Text>
      <PayMethodSelector value={payMethod} onChange={onPayMethod} accent={colors.settle} />

      {canPay && (
        <>
          <Text style={styles.label}>PAY NOW</Text>
          <TouchableOpacity
            style={styles.upiBtn}
            onPress={payViaUpi}
            // Long-press reveals the exact URIs, and lets a blocked app be handed a payment
            // deliberately — see UpiUriSheet. Settling up is where a P2P route actually gets
            // tested, so the sheet has to be reachable from here and not only from Scan & Pay.
            onLongPress={() => setShowUris(true)}
            accessibilityRole="button"
            accessibilityLabel={`Pay ${formatRupees(amountPaise)} to ${nameOf(to, 'them')} via UPI`}
          >
            <Feather name="smartphone" size={16} color={colors.settle} />
            <Text style={styles.upiBtnText}>Pay {formatRupees(amountPaise)} via UPI</Text>
          </TouchableOpacity>
          {/* Which app this goes to, and how to change it.
              Scan & Pay had this and settling up did not, which left a trap with no way
              out: pick a blocked app once and it is remembered, so every later settle-up
              opens it bare with no picker and nothing pre-filled — indistinguishable from
              the feature breaking. The remembered app has to be visible where it is used. */}
          {handoff.target && (
            <View style={styles.destRow}>
              <Text style={styles.destText} numberOfLines={1}>
                {handoff.target.blocked
                  ? `Opens ${handoff.target.label} — ${handoffVerb()}`
                  : `Opens ${handoff.target.label}`}
              </Text>
              {handoff.canChoose && (
                <TouchableOpacity onPress={() => payee && handoff.choose(payee)} hitSlop={12} accessibilityRole="button">
                  <Text style={styles.destChange}>Change</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {/* Opens their UPI app pre-filled; the money moves between their own
              accounts. Saving stays a separate, explicit step — this app never
              sees whether the payment actually went through, so it must not
              record a settlement it did not observe. */}
          <Text style={styles.upiHint}>Opens your UPI app. Come back and save to record it.</Text>
        </>
      )}

      {canRequest && (
        <>
          <Text style={styles.label}>GET PAID</Text>
          <TouchableOpacity
            style={styles.upiBtn}
            onPress={() => setShowRequest(true)}
            accessibilityRole="button"
            accessibilityLabel={`Show a QR code for ${nameOf(from, 'them')} to scan and pay ${formatRupees(amountPaise)}`}
          >
            <Feather name="maximize" size={16} color={colors.settle} />
            <Text style={styles.upiBtnText}>Show QR to get {formatRupees(amountPaise)}</Text>
          </TouchableOpacity>
          {/* Same rule as paying: we never observe the outcome, so recording stays an
              explicit step the user takes. */}
          <Text style={styles.upiHint}>They scan it from their phone. Save here to record it.</Text>
        </>
      )}

      {/* No `opts`: settling up has no code to scan, which is what decides where a blocked
          app lands. Passing nothing here is the same as what `pay` passes. */}
      <UpiUriSheet
        visible={showUris}
        onClose={() => setShowUris(false)}
        request={payee}
        apps={handoff.apps}
      />

      <RequestQrSheet
        visible={showRequest}
        onClose={() => setShowRequest(false)}
        vpa={me?.upi_vpa ?? null}
        name={me?.name}
        amountPaise={amountPaise}
        payerName={from && from.id !== me?.id ? from.name.split(' ')[0] : undefined}
      />

      <Text style={styles.label}>NOTES</Text>
      <TextInput
        style={styles.noteInput}
        value={note}
        onChangeText={onNote}
        placeholder="Add a note (optional)"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Transfer notes"
        maxLength={80}
      />
    </View>
  );
}

/**
 * The direction indicator, which is also the swap control.
 *
 * Tapping it reverses the transfer, and the arrow **flips to match** — the animation is the
 * acknowledgement. Without it the only feedback is two avatars exchanging places, which is easy
 * to miss and impossible to distinguish from having mis-tapped a tile.
 *
 * A half-turn rather than a mirror: rotating through 180° shows the movement, where swapping the
 * glyph for its mirror image would just be a different static picture. Rotation is
 * native-driver-safe (AGENTS §11) and honours Reduce Motion.
 */
function DirectionArrow({ onSwap }: { onSwap: () => void }) {
  // Accumulates rather than toggling between 0 and 180, so consecutive taps keep turning the
  // same way instead of rocking back and forth.
  //
  // The spring is applied when the value CHANGES, not inside the style. `withSpring` returns an
  // animation object, so interpolating one into a template string yields "[object Object]deg" —
  // it type-checks (both are `number` to TypeScript) and fails at runtime. Same trap as
  // `interpolateColor`; see the note in `ui/TabPills`.
  const deg = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${deg.value}deg` }] }));

  return (
    <PressableScale
      onPress={() => {
        haptic.selection();
        deg.value = withSpring(deg.value + 180, ARROW_SPRING);
        onSwap();
      }}
      hitSlop={12}
      accessibilityLabel="Reverse the direction — swap who paid and who received"
      style={styles.arrowBtn}
    >
      <Animated.View style={style}>
        <Feather name="arrow-right" size={18} color={colors.settle} />
      </Animated.View>
    </PressableScale>
  );
}

const ARROW_SPRING = { damping: 18, stiffness: 200, mass: 0.6, reduceMotion: ReduceMotion.System };

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  hint: { ...type.label, color: colors.textMuted, textAlign: 'center', marginBottom: space.xs },
  balRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, backgroundColor: colors.bgMuted, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, marginBottom: space.xs },
  balRowLabel: { ...type.label, fontFamily: 'Inter_600SemiBold', flexShrink: 1 },
  balRowAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 15, flexShrink: 0 },
  label: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Inter_600SemiBold', marginTop: space.sm },
  dirCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md },
  dirCardError: { borderColor: colors.expense, borderWidth: 1.5 },
  dirTile: { flex: 1, alignItems: 'center', gap: space.xs },
  dirLabel: { ...type.caption, color: colors.textMuted, letterSpacing: 0.5, fontFamily: 'Inter_600SemiBold' },
  dirName: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  arrowBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  errText: { ...type.caption, color: colors.expense, textAlign: 'center' },
  upiBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.settle, backgroundColor: alpha(colors.settle, 8) },
  upiBtnText: { ...type.body, color: colors.settle, fontFamily: 'Inter_600SemiBold' },
  upiHint: { ...type.caption, color: colors.textMuted, marginTop: space.sm },
  // Mirrors ScanPaySheet's destination row — same information, same shape, so the two
  // hand-off surfaces read identically.
  destRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm, minHeight: 24 },
  destText: { ...type.caption, color: colors.textSecondary, flexShrink: 1 },
  destChange: { ...type.caption, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  noteInput: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border, marginTop: space.xs },
});
