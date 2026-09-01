import React, { memo, useEffect, useRef, useState } from 'react';
import { Animated, Text, type TextStyle, type StyleProp } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

type Props = {
  /** The target value, in whatever unit `format` expects (paise, for money). */
  value: number;
  /** Renders the value. Pass `formatRupees` for money. */
  format: (n: number) => string;
  duration?: number;
  style?: StyleProp<TextStyle>;
  /** Falls back to `format(value)` for screen readers, which shouldn't hear a count-up. */
  accessibilityLabel?: string;
};

/**
 * Counts a number up to its value when it changes.
 *
 * For the one number on a screen that matters (AGENTS.md §1: "Each screen has
 * ONE number ... make it visually dominant"). Landing on the figure rather than
 * printing it draws the eye to it, which is exactly what the onboarding payoff
 * stage needs to do — it exists to prove the questions were worth answering.
 *
 * This is the one primitive here that can't use the native driver: text content
 * has to be set from JS, so the value is read back through a listener. That's
 * fine for a single hero figure — but it's why this must not be used per-row in
 * a list. Integer-only: `format` receives a rounded value, so money stays in
 * whole paise (AGENTS.md: "Money is always integer paise").
 */
export const AnimatedNumber = memo(function AnimatedNumber({
  value, format, duration = 650, style, accessibilityLabel,
}: Props) {
  const reduced = useReducedMotion();
  /*
   * Seeded at 0, not at `value`, so the first render actually counts UP.
   *
   * Seeding from `value` meant nothing moved on the render that matters: the
   * figures this is for are gated on their data (`{money && <TotalMoneyCard …>}`),
   * so the component mounts already holding the final number and `Animated.timing`
   * ran from N to N. The count-up only appeared after an edit — never on the load
   * it was written for.
   *
   * Under Reduce Motion it seeds at `value` instead. Starting at 0 there would
   * paint one frame of "₹0" before the effect corrected it — a flash shown only
   * to the people who asked for no motion, which is the wrong way round.
   */
  const anim = useRef(new Animated.Value(reduced ? value : 0)).current;
  const [shown, setShown] = useState(reduced ? value : 0);

  useEffect(() => {
    if (reduced) { setShown(value); return; }

    const sub = anim.addListener(({ value: v }) => setShown(Math.round(v)));
    Animated.timing(anim, { toValue: value, duration, useNativeDriver: false }).start(() => {
      setShown(value); // land exactly on the target, never a rounding artefact
    });

    return () => { anim.removeListener(sub); };
  }, [value, anim, duration, reduced]);

  return (
    <Text style={style} accessibilityLabel={accessibilityLabel ?? format(value)}>
      {format(shown)}
    </Text>
  );
});
