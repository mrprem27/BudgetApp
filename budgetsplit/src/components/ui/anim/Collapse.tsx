import React, { memo, useCallback } from 'react';
import Animated, {
  FadeOut, LinearTransition, ReduceMotion, runOnJS,
} from 'react-native-reanimated';

type Props = {
  /** Flip to false to animate the children out; they unmount when finished. */
  visible: boolean;
  children: React.ReactNode;
  /** Fires once the exit animation has finished. */
  onExited?: () => void;
  duration?: number;
};

/**
 * Fades its children out and closes the gap they leave behind.
 *
 * Used for a row acknowledging that it committed — Review's per-row Confirm,
 * which today produces no visible change at all and so is indistinguishable
 * from a no-op.
 *
 * Built on Reanimated's layout animations rather than RN's `Animated`, because
 * the *reflow* is the hard half: `height` isn't native-drivable, so animating it
 * with `Animated` interpolates on the JS thread. The obvious workaround —
 * `LayoutAnimation` — is a legacy global API that's unreliable under the New
 * Architecture and can't be scoped to one component, so a collapse here would
 * also animate unrelated layout changes landing in the same commit. `exiting` +
 * `layout` run entirely on the UI thread and are scoped to this subtree.
 *
 * `ReduceMotion.System` makes Reanimated skip the motion when the OS "Reduce
 * Motion" setting is on; the content still appears and disappears.
 */
export const Collapse = memo(function Collapse({
  visible, children, onExited, duration = 200,
}: Props) {
  // Layout-animation callbacks are invoked on the UI thread (Reanimated returns
  // them from inside a 'worklet'), so reaching a React closure needs runOnJS.
  const handleExited = useCallback((finished: boolean) => {
    'worklet';
    if (finished && onExited) runOnJS(onExited)();
  }, [onExited]);

  if (!visible) return null;

  return (
    <Animated.View
      exiting={FadeOut.duration(duration)
        .reduceMotion(ReduceMotion.System)
        .withCallback(handleExited)}
      layout={LinearTransition.duration(duration).reduceMotion(ReduceMotion.System)}
    >
      {children}
    </Animated.View>
  );
});
