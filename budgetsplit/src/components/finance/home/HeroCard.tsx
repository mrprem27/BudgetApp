import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, shadow } from '../../tokens';
import { AmountText } from '../../ui/AmountText';
import { formatCompact, formatChangeMagnitude } from '../../../lib/money';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Health ring geometry (top-right of the card).
const RING = 40;
const RING_STROKE = 3;
const RING_R = (RING - RING_STROKE) / 2;
const RING_CIRC = 2 * Math.PI * RING_R;

type Props = {
  /** My spend (paise) for the active period. */
  spent: number;
  /** UPPERCASE label e.g. "SPENT THIS MONTH". */
  periodLabel: string;
  /** Budget for the active period, already scaled (day/month/year); 0 when none is set. */
  budgetAllocated: number;
  /** Prior-period spend + its label, for the delta row when no budget exists. */
  prevSpending: number;
  prevLabel: string;
  /** When true, amounts are replaced with ₹ •••• (privacy mode). */
  obfuscate?: boolean;
  /** Money-health score (0–100) for the corner ring; null hides the ring. */
  healthScore?: number | null;
  /** Score exists but is gated on minimum data: show an empty ring that opens
   *  the unlock checklist instead of a number. */
  healthLocked?: boolean;
  /** Band colour for the ring + score text. */
  healthColor?: string;
  /** Tap handler for the ring — opens the health breakdown sheet. */
  onPressHealth?: () => void;
  /** Tap handler for the over-budget pace row — routes to the overspend breakdown. */
  onPressOver?: () => void;
  /** While a period switch is loading, hide the delta so it doesn't flash a stale value. */
  settling?: boolean;
};

/**
 * The single hero of Home: what you spent in the selected period, and nothing
 * measured any other way.
 *
 * That constraint is the whole design. This card briefly led with Safe-to-Spend,
 * and the result was three time bases stacked in one card — a horizon-scoped
 * headline over a period-scoped spend figure over a bar showing
 * `spent / budgetAllocated`, with the Today/Month/Year pills that drive two of
 * the three sitting *below* the card. The bar is the card's loudest element and
 * it was explaining a number that wasn't the headline.
 *
 * So: one quantity, one time base, everything answering to the same pills. The
 * horizon-scoped figure moved out to `StsStrip`, above this card, where being
 * unaffected by the pills is legible instead of contradictory.
 *
 * Every line is a fixed height so the card never jumps between states.
 */
export function HeroCard({
  spent, periodLabel, budgetAllocated, prevSpending, prevLabel,
  obfuscate = false, healthScore = null, healthLocked = false, healthColor = colors.accent,
  onPressHealth, onPressOver, settling = false,
}: Props) {
  const hasBudget = budgetAllocated > 0;
  const util = hasBudget ? Math.round((spent / budgetAllocated) * 100) : 0;
  const over = util >= 100;
  // healthRed (not colors.expense) — "over budget" and "you owe money" are
  // different meanings and shouldn't share a color.
  const paceColor = over ? colors.healthRed : util >= 80 ? colors.healthAmber : colors.income;
  const barPct = Math.min(100, Math.max(0, util));
  // Over budget reads better as a multiple ("1.2× budget") than as ">100%" — but
  // the multiple is the *secondary* framing now. The rupees over is what a user
  // can act on, so it leads and the multiple sits in the sub-slot.
  const overMultiple = hasBudget ? (spent / budgetAllocated).toFixed(1).replace(/\.0$/, '') : '0';
  const overAmount = hasBudget ? Math.max(0, spent - budgetAllocated) : 0;

  const delta = spent - prevSpending;
  const deltaPct = prevSpending > 0 ? Math.round((delta / prevSpending) * 100) : null;
  const up = delta > 0;
  const deltaColor = delta === 0 ? colors.textMuted : up ? colors.expense : colors.income;

  // Note: the hero number is rendered directly (no count-up) — animating a
  // compact-formatted amount changes its width each frame, which shoves the
  // delta beside it around. The bar tween below carries the "smooth" feel.

  // Tween the pace bar to match — left-anchored scaleX so it runs on the native/UI
  // thread (animating `width %` would force useNativeDriver:false).
  const barAnim = useRef(new Animated.Value(barPct / 100)).current;
  useEffect(() => {
    Animated.timing(barAnim, { toValue: barPct / 100, duration: 450, useNativeDriver: true }).start();
  }, [barPct, barAnim]);

  // Sweep the health ring to its score.
  const showRing = healthScore != null && isFinite(healthScore);
  const ringAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(ringAnim, {
      toValue: showRing ? Math.min(100, Math.max(0, healthScore!)) / 100 : 0,
      duration: 600, useNativeDriver: false,
    }).start();
  }, [healthScore, showRing, ringAnim]);
  const ringOffset = ringAnim.interpolate({ inputRange: [0, 1], outputRange: [RING_CIRC, 0] });

  // Delta beside the number: spending UP vs prior period reads as bad (coral),
  // DOWN as good (green). Needs a prior baseline to compute a %.
  const showDelta = !obfuscate && prevSpending > 0 && !settling;

  return (
    <View style={styles.card}>
      {/* Gated score: an empty muted ring that opens the unlock checklist —
          the activation loop, not a fake number. */}
      {!showRing && healthLocked && (
        <TouchableOpacity
          onPress={onPressHealth}
          hitSlop={8}
          style={styles.ringAbs}
          accessibilityRole="button"
          accessibilityLabel="Money health locked, see what unlocks it"
        >
          <Svg width={RING} height={RING}>
            <Circle
              cx={RING / 2} cy={RING / 2} r={RING_R}
              stroke={colors.bgElevated} strokeWidth={RING_STROKE} fill="none"
              strokeDasharray="3 4"
            />
          </Svg>
          <View style={[StyleSheet.absoluteFill, styles.ringCenter]}>
            <Feather name="lock" size={13} color={colors.textMuted} />
          </View>
        </TouchableOpacity>
      )}

      {/* Health ring pinned top-right so the label sits tight above the number. */}
      {showRing && (
        <TouchableOpacity
          onPress={onPressHealth}
          hitSlop={8}
          style={styles.ringAbs}
          accessibilityRole="button"
          accessibilityLabel={`Money health ${Math.round(healthScore!)}, view breakdown`}
        >
          <Svg width={RING} height={RING}>
            <Circle cx={RING / 2} cy={RING / 2} r={RING_R} stroke={colors.bgElevated} strokeWidth={RING_STROKE} fill="none" />
            <AnimatedCircle
              cx={RING / 2} cy={RING / 2} r={RING_R}
              stroke={healthColor} strokeWidth={RING_STROKE} fill="none"
              strokeDasharray={`${RING_CIRC} ${RING_CIRC}`}
              strokeDashoffset={ringOffset}
              strokeLinecap="round"
              rotation={-90}
              origin={`${RING / 2}, ${RING / 2}`}
            />
          </Svg>
          <View style={[StyleSheet.absoluteFill, styles.ringCenter]}>
            <Text style={[styles.ringScore, { color: healthColor }]}>{Math.round(healthScore!)}</Text>
          </View>
        </TouchableOpacity>
      )}

      <Text style={[styles.label, (showRing || healthLocked) && styles.gutter]}>{periodLabel}</Text>
      <View style={styles.numberRow}>
        {obfuscate
          ? <Text style={styles.obfuscated}>₹ ••••</Text>
          : <AmountText paise={spent} size="xl" forceColor={colors.textPrimary} compact zeroDash />
        }
      </View>
      <View style={styles.deltaWrap}>
        {showDelta && (
          <>
            <Feather name={delta === 0 ? 'minus' : up ? 'arrow-up-right' : 'arrow-down-right'} size={13} color={deltaColor} />
            <Text style={[styles.deltaText, { color: deltaColor }]} numberOfLines={1}>
              {formatChangeMagnitude(deltaPct ?? 0)} vs {prevLabel}
            </Text>
          </>
        )}
      </View>

      {/* Track — always present (muted when no budget) so height is constant. */}
      <View style={styles.track}>
        {hasBudget && <Animated.View style={[styles.fill, { backgroundColor: paceColor, transform: [{ scaleX: barAnim }] }]} />}
      </View>

      {/* Secondary row — always one line tall, content varies by state.
          When over, the row becomes a way out. It used to read "1.2× budget"
          and stop there: the second-loudest thing on Home, in red, on every
          launch, with nothing to do about it. A multiple is also the least
          actionable form of the fact — "₹4,200 over" is a number you can go
          find. Rebalancing was the obvious target and is the wrong one: it
          trades headroom *between categories* and cannot raise the month's
          total, which is what has already gone. Insights is where the
          driving-overspend breakdown and "what to cut" actually live. */}
      <View style={styles.paceRow}>
        {hasBudget ? (
          <>
            {over && onPressOver ? (
              <TouchableOpacity
                onPress={onPressOver}
                style={styles.paceLeft}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`${formatCompact(overAmount)} over budget, see what drove it`}
              >
                <View style={[styles.dot, { backgroundColor: paceColor }]} />
                <Text style={[styles.paceText, { color: paceColor }]}>
                  {formatCompact(overAmount)} over
                </Text>
                <Feather name="chevron-right" size={13} color={paceColor} />
              </TouchableOpacity>
            ) : (
              <View style={styles.paceLeft}>
                <View style={[styles.dot, { backgroundColor: paceColor }]} />
                <Text style={[styles.paceText, { color: paceColor }]}>
                  {over ? `${formatCompact(overAmount)} over` : `On pace · ${util}%`}
                </Text>
              </View>
            )}
            <Text style={styles.paceSub}>
              {over ? `${overMultiple}× budget` : `Budget ${formatCompact(budgetAllocated)}`}
            </Text>
          </>
        ) : (
          <Text style={styles.empty}>Set a budget to track your pace</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.lg, marginBottom: space.md, borderWidth: 1, borderColor: colors.border, ...shadow.md, position: 'relative' },
  label: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: space.xs, fontFamily: 'Inter_600SemiBold' },
  // Reserve the right gutter so the label/number never slide under the ring.
  gutter: { paddingRight: RING + space.sm },
  ringAbs: { position: 'absolute', top: space.lg, right: space.lg, width: RING, height: RING, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  ringCenter: { alignItems: 'center', justifyContent: 'center' },
  ringScore: { fontFamily: 'SpaceMono_400Regular', fontSize: 13, letterSpacing: -0.5 },
  numberRow: { flexDirection: 'row', alignItems: 'flex-end' },
  deltaWrap: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: 6, height: 16 },
  deltaText: { ...type.label },
  track: { height: 4, backgroundColor: colors.bgElevated, borderRadius: 2, marginTop: space.md, marginBottom: space.sm, overflow: 'hidden' },
  fill: { height: 4, width: '100%', borderRadius: 2, transformOrigin: 'left' },
  // minHeight keeps the row exactly one line tall in every state → no jump.
  paceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 18 },
  paceLeft: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  paceText: { ...type.label, fontFamily: 'Inter_600SemiBold' },
  paceSub: { ...type.label, color: colors.textMuted },
  empty: { ...type.caption, color: colors.textMuted },
  obfuscated: { fontFamily: 'SpaceMono_400Regular', fontSize: 36, color: colors.textMuted, letterSpacing: 4, marginBottom: space.xs },
});
