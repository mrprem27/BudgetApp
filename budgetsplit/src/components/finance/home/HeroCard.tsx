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
  /** Band colour for the ring + score text. */
  healthColor?: string;
  /** Tap handler for the ring — opens the health breakdown sheet. */
  onPressHealth?: () => void;
  /** While a period switch is loading, hide the delta so it doesn't flash a stale value. */
  settling?: boolean;
};

/**
 * The single hero of Home — answers "am I on pace this period?". One XL number
 * that counts up smoothly when the Today/Month/Year selector changes, a budget
 * pace bar that tweens to match, and a money-health ring in the top-right that
 * opens the breakdown sheet. The secondary line is ALWAYS one line tall so the
 * card never jumps between states:
 *   • budget set  → pace bar + "On pace · 72%" (or "1.2× budget" when over) and
 *                   the period budget total on the right.
 *   • no budget   → muted track + period-over-period delta.
 */
export function HeroCard({
  spent, periodLabel, budgetAllocated, prevSpending, prevLabel,
  obfuscate = false, healthScore = null, healthColor = colors.accent, onPressHealth, settling = false,
}: Props) {
  const hasBudget = budgetAllocated > 0;
  const util = hasBudget ? Math.round((spent / budgetAllocated) * 100) : 0;
  const over = util >= 100;
  const paceColor = over ? colors.expense : util >= 80 ? colors.healthAmber : colors.income;
  const barPct = Math.min(100, Math.max(0, util));
  // Over budget reads better as a multiple ("1.2× budget") than as ">100%".
  const overMultiple = hasBudget ? (spent / budgetAllocated).toFixed(1).replace(/\.0$/, '') : '0';

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

      <Text style={[styles.label, showRing && styles.gutter]}>{periodLabel}</Text>

      {/* The hero number on its own line; the period-over-period delta sits on a
          dedicated line directly beneath it (not crammed to the bottom-right). */}
      <View style={styles.numberRow}>
        {obfuscate
          ? <Text style={styles.obfuscated}>₹ ••••</Text>
          : <AmountText paise={spent} size="xl" forceColor={colors.textPrimary} compact zeroDash />
        }
      </View>
      {/* Delta line — always rendered (empty when N/A) so the hero never changes
          height between Today/Month/Year or while a switch is loading. */}
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

      {/* Secondary row — always one line tall, content varies by state. */}
      <View style={styles.paceRow}>
        {hasBudget ? (
          <>
            <View style={styles.paceLeft}>
              <View style={[styles.dot, { backgroundColor: paceColor }]} />
              <Text style={[styles.paceText, { color: paceColor }]}>
                {over ? `${overMultiple}× budget` : `On pace · ${util}%`}
              </Text>
            </View>
            <Text style={styles.paceSub}>Budget {formatCompact(budgetAllocated)}</Text>
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
