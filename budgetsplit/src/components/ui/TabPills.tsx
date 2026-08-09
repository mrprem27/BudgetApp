import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue, withSpring, interpolateColor, ReduceMotion,
} from 'react-native-reanimated';
import { colors, type, radius } from '../tokens';

type Tab = {
  key: string;
  label: string;
};

type Props = {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
  /**
   * Fill colour of the active pill. Defaults to `colors.accent`.
   *
   * Exists so a control can carry the meaning of what it selects — the Add
   * screen tints itself by transaction kind (expense / income / settlement), and
   * the switcher needs to agree with the rest of the form.
   */
  activeColor?: string;
  /**
   * `'sm'` (36pt pills) for a secondary segmented choice inside a screen.
   * `'lg'` (56pt overall) for a control that is the primary decision on the
   * screen — big enough to hit without aiming (AGENTS.md §6).
   */
  size?: 'sm' | 'lg';
};

const TRACK_PAD = 3;
const TRACK_PAD_LG = 4;

/** One spring for the pill and the labels, so nothing arrives ahead of anything else. */
const SPRING = { damping: 20, stiffness: 220, mass: 0.6, reduceMotion: ReduceMotion.System };

/**
 * Shared pill-style tab bar used across dashboard, group detail, and anywhere a
 * segmented choice is needed. `bgMuted` track, accent active fill.
 *
 * **The active fill is one pill that slides**, not a background that blinks on and off. It used
 * to be a conditional `backgroundColor` on whichever button was active, so switching tabs was
 * an instant swap with nothing connecting the two positions — the most-touched control in the
 * app and the only one with no motion at all.
 *
 * Implementation notes, because this renders on ~10 screens and a cheap mistake here is
 * expensive everywhere:
 * - the indicator moves with **`translateX`**, which is native-driver-safe (AGENTS §11). An
 *   earlier attempt animated a percentage `left`, which is a *layout* property and re-runs
 *   layout every frame — the exact thing §11 exists to prevent;
 * - which means the track's width has to be measured, hence the single `onLayout`. Cheap: it
 *   fires on mount and on rotation, and the indicator simply isn't drawn until it has a width,
 *   so there is no frame at x=0;
 * - the pill width is derived per render rather than memoised, because the tab **count** changes
 *   at runtime (the Add screen drops Transfer when `flags.splitting` is off) and a cached width
 *   would leave the indicator the wrong size;
 * - `ReduceMotion.System` on the shared spring, so it snaps when the OS asks.
 *
 * Labels cross-fade between muted and on-fill rather than switching at the tap, which would
 * otherwise recolour the text before the pill had travelled under it. Colour is animated by
 * Reanimated on the UI thread — not a layout property, so the §11 constraint is satisfied.
 *
 * ⚠️ **`withSpring` returns an animation, not a number.** It is only valid where a *style value*
 * is expected, or assigned to a shared value. Passing one as an argument to `interpolateColor`
 * type-checks, since both are `number` to TypeScript, and then crashes the app at runtime with
 * `Invalid color value: "rgba(NaN, NaN, NaN, NaN)"` — the helper's return value is an object, so
 * the interpolation reads NaN out of it. Both animations here therefore drive a shared value and
 * the animated style only reads it.
 */
export function TabPills({ tabs, active, onChange, activeColor = colors.accent, size = 'sm' }: Props) {
  const [trackW, setTrackW] = useState(0);
  if (tabs.length === 0) return null;
  const lg = size === 'lg';
  const pad = lg ? TRACK_PAD_LG : TRACK_PAD;

  // Clamped: an `active` key that isn't in `tabs` (one render after the list changed) would
  // otherwise drive the indicator off the end of the track.
  const rawIndex = tabs.findIndex(t => t.key === active);
  const index = rawIndex < 0 ? 0 : rawIndex;

  const pillW = trackW > 0 ? (trackW - pad * 2) / tabs.length : 0;

  const onTrackLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    // Guarded so an identical re-layout doesn't re-render every pill.
    setTrackW(prev => (Math.abs(prev - w) > 0.5 ? w : prev));
  };

  return (
    <View style={[styles.track, lg && styles.trackLg]} onLayout={onTrackLayout}>
      {pillW > 0 && (
        <Indicator x={index * pillW} width={pillW} color={activeColor} pad={pad} />
      )}
      {tabs.map((t, i) => (
        <Pressable
          key={t.key}
          style={[styles.pill, lg && styles.pillLg]}
          onPress={() => onChange(t.key)}
          hitSlop={{ top: 6, bottom: 6 }}
          accessibilityRole="tab"
          accessibilityState={{ selected: i === index }}
        >
          <PillLabel label={t.label} on={i === index} lg={lg} />
        </Pressable>
      ))}
    </View>
  );
}

/**
 * The sliding fill. Absolutely positioned inside the track's padding box, so it sits behind
 * the labels without taking part in layout.
 */
const Indicator = React.memo(function Indicator({ x, width, color, pad }: {
  x: number; width: number; color: string; pad: number;
}) {
  // The spring drives a shared value, and the style only *reads* it. See the note on
  // `withSpring` in this file's header: an animation helper is not a number.
  const tx = useSharedValue(x);
  useEffect(() => { tx.value = withSpring(x, SPRING); }, [x, tx]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.indicator, { top: pad, bottom: pad, left: pad, width, backgroundColor: color }, style]}
    />
  );
});

/** Label colour follows the pill rather than the tap, so the two never disagree mid-slide. */
const PillLabel = React.memo(function PillLabel({ label, on, lg }: {
  label: string; on: boolean; lg: boolean;
}) {
  const progress = useSharedValue(on ? 1 : 0);
  useEffect(() => { progress.value = withSpring(on ? 1 : 0, SPRING); }, [on, progress]);

  const style = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [colors.textSecondary, colors.bg]),
  }));

  return (
    <Animated.Text style={[styles.label, lg && styles.labelLg, style]} numberOfLines={1}>
      {label}
    </Animated.Text>
  );
});

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.bgMuted,
    borderRadius: radius.pill,
    padding: TRACK_PAD,
    // The indicator is absolutely positioned against this box.
    position: 'relative',
  },
  trackLg: { padding: TRACK_PAD_LG },
  indicator: { position: 'absolute', borderRadius: radius.pill },
  pill: {
    flex: 1,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillLg: { height: 48 },
  label: { ...type.labelSemi, color: colors.textSecondary },
  labelLg: { ...type.button },
});
