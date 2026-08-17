import React from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, layout } from '../../tokens';
import { MemberAvatar } from '../MemberAvatar';
import { PayMethodSelector } from '../PayMethodSelector';
import { formatRupees } from '../../../lib/money';
import { handoffVerb, type UpiHandoff } from '../../../hooks/useUpiHandoff';
import type { UpiRequest } from '../../../lib/upiIntent';
import { haptic } from '../../../lib/haptics';
import { oweView } from '../../../lib/owe';
import type { Person } from '../../../db/queries/persons';
import type { TransferScopes } from '../../../lib/settleScope';
import { TRANSFER_SCOPE_ALL, type TransferScope } from '../../../constants/enums';
import type { PayMethod } from '../../../constants/enums';
import { alpha } from '../../../theme';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, ReduceMotion } from 'react-native-reanimated';
import { PressableScale } from '../../ui/PressableScale';

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
  /** Computed by `useAddTxnForm` (`transferPayee`/`transferHandoff`/etc.) —
   *  shared with `QuickAddSheets`, which mounts the two sheets below, so
   *  neither this component nor that one duplicates the UPI logic. */
  payee: UpiRequest | null;
  handoff: UpiHandoff;
  canPay: boolean;
  canRequest: boolean;
  onOpenUpiUri: () => void;
  onOpenRequestQr: () => void;
};

/** Transfer body for the Add modal's "Transfer" pill — any payer → any recipient.
 *  The transfer reason is a real 'transfer' category picked via the shared
 *  category pill in Quick Add (same UI as Expense/Income). */
export function TransferBody({
  me, persons, fromId, toId, onPickSlot, onSwap, scopes, scope, payMethod, onPayMethod, note, onNote,
  amountPaise = 0, payee, handoff, canPay, canRequest, onOpenUpiUri, onOpenRequestQr,
}: Props) {
  const from = persons.find(p => p.id === fromId) ?? null;
  const to = persons.find(p => p.id === toId) ?? null;
  const nameOf = (p: Person | null, fallback: string) => p ? (p.id === me?.id ? 'You' : p.name.split(' ')[0]) : fallback;

  /**
   * Which *side* each role is on. Purely visual — `fromId`/`toId` remain the truth.
   *
   * Reversing flips this at the same moment it swaps from/to upstream, and the two changes
   * cancel: the same person stays on the same side, and only the arrow turns.
   */
  const [reversed, setReversed] = React.useState(false);
  const leftRole: 'from' | 'to' = reversed ? 'to' : 'from';
  const rightRole: 'from' | 'to' = reversed ? 'from' : 'to';
  const leftPerson = reversed ? to : from;
  const rightPerson = reversed ? from : to;

  function reverse() {
    setReversed(r => !r);
    onSwap();
  }

  // "You paid Riya" / "Riya paid you" — the payer is always `from`, whichever side it sits on.
  // Null until both are picked, so the card doesn't assert a direction it doesn't have yet.
  const directionLabel = from && to && fromId !== toId
    ? `${nameOf(from, '')} paid ${to.id === me?.id ? 'you' : nameOf(to, '')}`
    : null;

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
      // Me-facing phrasing/colour comes from oweView — the module that exists so
      // owe wording can't drift per-screen. Third-party ("A owes B") has no
      // me-centric reading, so it stays local.
      if (entry.from === me?.id) { const v = oweView(-bal); balLabel = v.withName(oweeName); balColor = v.color; }
      else if (entry.to === me?.id) { const v = oweView(bal); balLabel = v.withName(owerName); balColor = v.color; }
      else { balLabel = `${owerName} owes ${oweeName}`; balColor = colors.settle; }
    } else {
      noBalance = true;
    }
  }

  function payViaUpi() {
    if (payee) handoff.pay(payee);
  }

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

      {/* Two people and an arrow between them. No FROM/TO labels: with an arrow already
          stating the direction they were a third and fourth statement of the same fact, and
          the labels and the arrow disagreed about which metaphor the card was using.

          The slots are POSITIONS, not roles. Reversing turns the arrow and leaves the avatars
          where they are, so exactly one thing changes and you can see which — swapping the
          avatars instead (what this did before) is, by its own admission, indistinguishable
          from having mis-tapped a tile. */}
      <View style={[styles.dirCard, !!fromId && !!toId && fromId === toId && styles.dirCardError]}>
        <View style={styles.dirRow}>
          <TouchableOpacity
            style={styles.dirTile}
            onPress={() => onPickSlot(leftRole)}
            accessibilityRole="button"
            accessibilityLabel={leftRole === 'from' ? 'Choose who paid' : 'Choose who received'}
          >
            <MemberAvatar name={leftPerson?.name ?? '?'} color={leftPerson?.avatar_color ?? colors.accent} size={52} imageUri={leftPerson?.image_uri} />
            <Text style={styles.dirName} numberOfLines={1}>{nameOf(leftPerson, 'Pick')}</Text>
          </TouchableOpacity>

          <DirectionArrow reversed={reversed} onPress={reverse} label={directionLabel} />

          <TouchableOpacity
            style={styles.dirTile}
            onPress={() => onPickSlot(rightRole)}
            accessibilityRole="button"
            accessibilityLabel={rightRole === 'from' ? 'Choose who paid' : 'Choose who received'}
          >
            <MemberAvatar name={rightPerson?.name ?? '?'} color={rightPerson?.avatar_color ?? colors.accent} size={52} imageUri={rightPerson?.image_uri} />
            <Text style={styles.dirName} numberOfLines={1}>{nameOf(rightPerson, 'Pick')}</Text>
          </TouchableOpacity>
        </View>

        {/* The arrow is a glyph, and a glyph is the one thing a person can misread here. This
            says it in words, and it is the only line that changes when you reverse. */}
        {directionLabel && (
          <>
            <View style={styles.dirDivider} />
            <Text style={styles.dirSentence}>{directionLabel}</Text>
          </>
        )}
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
            onLongPress={onOpenUpiUri}
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
            onPress={onOpenRequestQr}
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
 * The direction indicator, which is also the control that changes it.
 *
 * One job now: it points the way the money goes, and tapping it points it the other way. That
 * is coherent in a way the old behaviour was not — there, tapping the arrow shuffled the two
 * avatars, so the glyph was a statement about direction wired to an action about position.
 *
 * A half-turn rather than a mirrored glyph: rotating through 180° shows the movement, where
 * swapping in the mirror image would just be a different static picture. Rotation is
 * native-driver-safe (AGENTS §11) and honours Reduce Motion.
 */
function DirectionArrow({ reversed, onPress, label }: {
  reversed: boolean;
  onPress: () => void;
  label: string | null;
}) {
  // Accumulates rather than toggling between 0 and 180, so consecutive taps keep turning the
  // same way instead of rocking back and forth. Driven by `reversed` so the glyph can never
  // disagree with the data — a half-turn per flip lands it on the correct heading either way.
  const deg = useSharedValue(0);
  const turns = React.useRef(0);
  const mounted = React.useRef(false);
  React.useEffect(() => {
    // Mount must not animate: the effect runs once before any flip, and spinning there would
    // land the arrow pointing left on a card nobody has touched.
    if (!mounted.current) { mounted.current = true; return; }
    turns.current += 1;
    deg.value = withSpring(turns.current * 180, ARROW_SPRING);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reversed]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${deg.value}deg` }] }));

  return (
    <PressableScale
      onPress={() => { haptic.selection(); onPress(); }}
      hitSlop={12}
      // The glyph's heading is invisible to a screen reader, so the state it encodes has to be
      // spoken. Falls back to the action alone before anyone is picked.
      accessibilityLabel={label ? `${label}. Tap to reverse.` : 'Reverse who pays whom'}
      style={styles.arrowBtn}
    >
      <Animated.View style={[styles.arrowDisc, style]}>
        <Feather name="arrow-right" size={20} color={colors.settle} />
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
  dirCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md },
  dirCardError: { borderColor: colors.expense, borderWidth: 1.5 },
  dirRow: { flexDirection: 'row', alignItems: 'center' },
  dirTile: { flex: 1, alignItems: 'center', gap: space.xs },
  dirDivider: { height: 1, backgroundColor: colors.border, marginTop: space.md, marginBottom: space.sm },
  dirSentence: { ...type.label, color: colors.textSecondary, textAlign: 'center', fontFamily: 'Inter_600SemiBold' },
  dirName: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  arrowBtn: { width: layout.touchMin, height: layout.touchMin, alignItems: 'center', justifyContent: 'center' },
  // A bare glyph between two 52pt avatars read as a separator rather than a control, so the
  // one thing on this card you can tap looked like the one thing you couldn't. The disc is
  // what makes it a button; it stays tinted rather than filled so it doesn't outrank the
  // avatars it sits between.
  arrowDisc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha(colors.settle, 15),
    borderWidth: 1,
    borderColor: alpha(colors.settle, 33),
  },
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
