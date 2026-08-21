import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, shadow, alpha } from '../../tokens';
import { AmountText } from '../../ui/AmountText';
import { formatCompact } from '../../../lib/money';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Health ring geometry (top-right of the card).
const RING = 40;
const RING_STROKE = 3;
const RING_R = (RING - RING_STROKE) / 2;
const RING_CIRC = 2 * Math.PI * RING_R;

type Props = {
  /** My spend (paise) for the active period — ALL categories. The hero number. */
  spent: number;
  /** UPPERCASE label e.g. "SPENT THIS MONTH". */
  periodLabel: string;
  /** Budget rolled up at the active period; 0 when nothing is budgeted at it. */
  budgetAllocated: number;
  /**
   * The bar's numerator: my spend restricted to the categories behind
   * `budgetAllocated`. Deliberately NOT `spent` — see the note on the bar below.
   */
  budgetSpent: number;
  /** Is there a budget at all, at any cadence? Picks which empty copy is true. */
  budgetExists?: boolean;
  /** 'daily' | 'monthly' | 'yearly' — names the period in the empty copy. */
  periodNoun?: string;
  /** The part of `budgetSpent` that happened in a shared group — the bar's second
   *  segment. Must be a subset of `budgetSpent`, not a figure of its own. */
  budgetSpentShared?: number;
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
  /** Tap handler for the pace row — routes to Insights, in every state, not just over. */
  onPressPace?: () => void;
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
 * So: one time base, everything answering to the same pills. The horizon-scoped
 * figure moved out to `StsStrip`, above this card, where being unaffected by the
 * pills is legible instead of contradictory.
 *
 * The bar is the one deliberate second quantity — budgeted spend over budget,
 * on that same time base. It is a *subset* of the hero number, not a fraction of
 * it, and the row beneath prints both figures for exactly that reason.
 *
 * Every line is a fixed height so the card never jumps between states.
 */
/** Below this, the shared segment is a sliver that reads as a rendering glitch. */
const MIN_SHARED_FRACTION = 0.05;
/** The quieter weight of the same pace colour — never a second hue. */
const SHARED_OPACITY = 40;
export function HeroCard({
  spent, periodLabel, budgetAllocated, budgetSpent, budgetSpentShared = 0, budgetExists = false, periodNoun = 'monthly',
  prevSpending, prevLabel,
  obfuscate = false, healthScore = null, healthLocked = false, healthColor = colors.accent,
  onPressHealth, onPressPace, settling = false,
}: Props) {
  const hasBudget = budgetAllocated > 0;
  const util = hasBudget ? Math.round((budgetSpent / budgetAllocated) * 100) : 0;
  const over = util >= 100;
  // healthRed (not colors.expense) — "over budget" and "you owe money" are
  // different meanings and shouldn't share a color.
  const paceColor = over ? colors.healthRed : util >= 80 ? colors.healthAmber : colors.income;
  const barPct = Math.min(100, Math.max(0, util));

  const delta = spent - prevSpending;
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

  /*
   * How much of the fill was shared, drawn as a second segment.
   *
   * Both layers anchor left and scale from 0, so they cannot sit side by side —
   * which is why this draws the WHOLE fill in the quieter tint and then paints the
   * personal part back over it at full strength. The seam between them lands at the
   * personal figure without either layer needing a measured offset, so both stay on
   * pure `scaleX` and the native driver (AGENTS §11).
   *
   * The tint is the pace colour at lower alpha, never a colour of its own: over
   * budget is the louder fact, and a personal/group palette would outrank it.
   *
   * Below the threshold the seam is a sliver that reads as a rendering artefact,
   * so the bar stays one solid colour.
   */
  const sharedFrac = budgetSpent > 0 ? Math.min(1, Math.max(0, budgetSpentShared / budgetSpent)) : 0;
  const showShared = hasBudget && sharedFrac >= MIN_SHARED_FRACTION;
  const personalAnim = useRef(new Animated.Value((barPct / 100) * (1 - sharedFrac))).current;
  useEffect(() => {
    Animated.timing(personalAnim, {
      toValue: (barPct / 100) * (1 - sharedFrac), duration: 450, useNativeDriver: true,
    }).start();
  }, [barPct, sharedFrac, personalAnim]);

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
              {formatCompact(Math.abs(delta))} {up ? 'more' : 'less'} than {prevLabel}
            </Text>
          </>
        )}
      </View>

      {/*
        Track — always present (muted when no budget) so height is constant.

        The bar does NOT measure the number above it, and that is the design.
        It fills `budgetSpent / budgetAllocated`: spend in the categories that
        are actually budgeted *at this period*, over what they are budgeted. It
        used to divide the whole period's spend by the budgeted categories'
        total, so budgeting one category out of twelve pinned it red on launch —
        a numerator and a denominator from two different populations.

        Which lines are in scope moves with the pills, by `budgetKind`'s rule:
        Today counts daily lines, Month daily + monthly, Year all three. A yearly
        line is a pool on Month — it is spent when the trip happens, not ₹2,000
        every month — so it is out of both halves there, and back in on Year.

        So the bar can diverge from the hero number above it. The row below names
        what is left or over against the budget, which is the fact the bar is
        actually about.
      */}
      <View style={styles.track}>
        {hasBudget && (
          <Animated.View style={[styles.fill, { backgroundColor: showShared ? alpha(paceColor, SHARED_OPACITY) : paceColor, transform: [{ scaleX: barAnim }] }]} />
        )}
        {showShared && (
          <Animated.View style={[styles.fill, styles.fillOver, { backgroundColor: paceColor, transform: [{ scaleX: personalAnim }] }]} />
        )}
      </View>

      {/*
        Secondary row — always one line tall, content varies by state.

        The two figures sit at the two ends of the bar they describe: spend at
        the left where the fill starts, the budget at the right where the track
        ends. The `1.8×` multiplier that used to trail the left figure is gone —
        the bar already carries the proportion, so it was said twice, and a
        multiplier is the least legible way to say it. Colour carries over/under.

        The whole left group is the tap target in every state, not only when
        over — Insights is worth reaching whether you are on track or not.
      */}
      <View style={styles.paceRow}>
        {hasBudget ? (
          <>
            <PaceLeft
              onPress={onPressPace}
              color={paceColor}
              /* Privacy mode hides amounts, not proportions — a percentage is not
                 a figure, so the row stays informative instead of going blank. */
              label={obfuscate ? `${util}% used` : formatCompact(budgetSpent)}
              a11y={obfuscate
                ? `${util}% of budget used, see the breakdown`
                : `${formatCompact(budgetSpent)} of ${formatCompact(budgetAllocated)} budgeted, see the breakdown`}
            />
            <Text style={styles.paceSub}>{obfuscate ? '' : formatCompact(budgetAllocated)}</Text>
          </>
        ) : (
          /* Two different facts, and telling the wrong one is why a user who set
             a monthly budget in onboarding read "Set a budget" on the Today tab. */
          <Text style={styles.empty}>
            {budgetExists ? `No ${periodNoun} budget set` : 'Set a budget to track your pace'}
          </Text>
        )}
      </View>
    </View>
  );
}

/**
 * The bar's left endpoint: a tinted dot, the spent figure with its ratio, and
 * the way through to Insights. Extracted only so the tappable and untappable
 * forms can't drift — they were two hand-copied JSX blocks differing in a
 * chevron, and the untappable one had already lost a style.
 *
 * No handler means no chevron: an arrow that promises a destination and does
 * nothing is worse than no arrow.
 */
function PaceLeft({ onPress, color, label, a11y }: {
  onPress?: () => void;
  color: string;
  label: string;
  a11y: string;
}) {
  const body = (
    <>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.paceText, { color }]} numberOfLines={1}>{label}</Text>
      {!!onPress && <Feather name="chevron-right" size={13} color={color} />}
    </>
  );
  if (!onPress) return <View style={styles.paceLeft}>{body}</View>;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.paceLeft}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={a11y}
    >
      {body}
    </TouchableOpacity>
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
  // The personal layer sits on top of the full-width one; absolute so it doesn't
  // push the track's height around.
  fillOver: { position: 'absolute', left: 0, top: 0 },
  track: { height: 4, backgroundColor: colors.bgElevated, borderRadius: 2, marginTop: space.md, marginBottom: space.sm, overflow: 'hidden' },
  fill: { height: 4, width: '100%', borderRadius: 2, transformOrigin: 'left' },
  // minHeight keeps the row exactly one line tall in every state → no jump.
  paceSub: { ...type.label, color: colors.textSecondary },
  paceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 18 },
  paceLeft: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  paceText: { ...type.label, fontFamily: 'Inter_600SemiBold' },
  empty: { ...type.caption, color: colors.textMuted },
  obfuscated: { fontFamily: 'SpaceMono_400Regular', fontSize: 36, color: colors.textMuted, letterSpacing: 4, marginBottom: space.xs },
});
