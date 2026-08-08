import React, { memo, useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

type Props = {
  /** Identifies the current step. Changing it triggers the transition. */
  stepKey: string;
  /** Which way the user is moving. Drives the slide direction. */
  direction?: 'forward' | 'back';
  children: React.ReactNode;
  /** Slide distance in px. */
  distance?: number;
};

/**
 * Cross-fades and slides between the steps of a wizard.
 *
 * Both multi-step flows in the app swap their content with no transition at all:
 * onboarding renders sibling conditional blocks keyed off a `stage` string, and
 * the itemized split renders one of four step bodies. In both, advancing makes
 * the screen change under you rather than leading you somewhere — which is a
 * large part of why the onboarding questionnaire reads as a form.
 *
 * It renders the outgoing children while they animate out, so it holds two trees
 * only for the ~120ms of the exit. Steps must therefore keep their state
 * *outside* this component (onboarding already does — `useOnboardingForm` owns
 * everything, and the screen has zero `useState`).
 */
export const StepTransition = memo(function StepTransition({
  stepKey, direction = 'forward', children, distance = 20,
}: Props) {
  const anim = useRef(new Animated.Value(1)).current;
  const [shown, setShown] = useState({ key: stepKey, node: children });
  const reduced = useReducedMotion();

  // Keep the visible tree fresh while the key is unchanged (re-renders of the
  // same step must pass straight through, or typing wouldn't update the screen).
  if (shown.key === stepKey && shown.node !== children) {
    setShown({ key: stepKey, node: children });
  }

  useEffect(() => {
    if (shown.key === stepKey) return;

    if (reduced) {
      setShown({ key: stepKey, node: children });
      anim.setValue(1);
      return;
    }

    Animated.timing(anim, { toValue: 0, duration: 120, useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      setShown({ key: stepKey, node: children });
      Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, reduced]);

  if (reduced) return <View style={{ flex: 1 }}>{shown.node}</View>;

  // Exiting content leaves the way the user came from; entering content arrives
  // from the direction of travel.
  const sign = direction === 'forward' ? 1 : -1;

  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: anim,
        transform: [
          { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [sign * distance, 0] }) },
        ],
      }}
    >
      {shown.node}
    </Animated.View>
  );
});
