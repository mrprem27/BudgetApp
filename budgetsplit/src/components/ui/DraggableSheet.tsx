import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Dimensions,
  KeyboardAvoidingView, Platform, Keyboard, type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, interpolate,
  Extrapolation, runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, type, space, radius, shadow } from '../tokens';

const SCREEN_H = Dimensions.get('window').height;
const DISMISS_DY = 90;   // px dragged past which we dismiss
const DISMISS_VY = 800;  // px/s flick velocity past which we dismiss
/** Must match the close timing below — {@link SheetModal} waits this long before unmounting. */
export const SHEET_EXIT_MS = 200;

type Props = {
  /** Called once the close animation finishes (e.g. router.back / setVisible(false)). */
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Wrap children in a ScrollView (for long content). Default true. */
  scroll?: boolean;
  /** Optional control rendered at the right of the title row (e.g. a segmented toggle). */
  headerRight?: React.ReactNode;
  /**
   * Set by {@link SheetModal} when the parent has closed the sheet but is still rendering it,
   * so the slide-out plays instead of the sheet vanishing. `onClose` is NOT called again in
   * that case — the parent already knows.
   */
  exiting?: boolean;
};

/**
 * The bottom-sheet body WITHOUT an RN <Modal> wrapper — it fills its parent and
 * draws its own dimmed backdrop + draggable sheet. Use this directly as the root
 * of a `transparentModal` route screen (the route is the overlay; nesting a
 * Modal there collapses to a black screen once the keyboard opens). For an
 * inline sheet over a normal screen, use {@link SheetModal}, which wraps this in
 * a Modal. Drag is powered by react-native-gesture-handler + Reanimated, so the
 * gesture and the sheet transform stay on the UI thread (no JS-thread stutter).
 *
 * Three ways it can close, and all three animate: a drag past the threshold, a backdrop tap,
 * and the parent clearing `visible` (which arrives here as `exiting`). That last one used to
 * skip the animation entirely — the sheet was simply unmounted — which is what made a Done
 * button feel like a glitch rather than a dismissal.
 */
export function DraggableSheet({ onClose, title, children, scroll = true, headerRight, exiting = false }: Props) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(SCREEN_H);
  // Scroll offset as a shared value so the pan worklet can read it on the UI thread
  // (only start a drag-to-dismiss when the inner list is at the top).
  const scrollY = useSharedValue(0);
  const [kbVisible, setKbVisible] = useState(false);
  // Guards so onClose fires exactly once and never after unmount: drag-dismiss,
  // backdrop-tap and a parent flipping `visible` can otherwise overlap.
  const closingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKbVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKbVisible(false));
    return () => { mountedRef.current = false; show.remove(); hide.remove(); };
  }, []);

  // Spring in on mount.
  useEffect(() => {
    translateY.value = SCREEN_H;
    translateY.value = withSpring(0, { damping: 16, stiffness: 170, mass: 0.7 });
  }, [translateY]);

  // Reopened while still sliding out (SheetModal keeps us mounted for that window): cancel the
  // exit and come back from wherever we got to, rather than snapping off-screen first.
  useEffect(() => {
    if (exiting) return;
    closingRef.current = false;
    translateY.value = withSpring(0, { damping: 16, stiffness: 170, mass: 0.7 });
  }, [exiting, translateY]);

  const finishClose = () => { if (mountedRef.current) onClose(); };

  const animateClose = React.useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    translateY.value = withTiming(SCREEN_H, { duration: SHEET_EXIT_MS }, (finished) => {
      'worklet';
      if (finished) runOnJS(finishClose)();
    });
  }, [translateY]); // eslint-disable-line react-hooks/exhaustive-deps

  // A parent-initiated close: play the exit, but don't call back — the parent already flipped
  // its own state, and calling `onClose` again would re-enter whatever handler closed us.
  useEffect(() => {
    if (!exiting || closingRef.current) return;
    closingRef.current = true;
    translateY.value = withTiming(SCREEN_H, { duration: SHEET_EXIT_MS });
  }, [exiting, translateY]);

  const nativeGesture = useMemo(() => Gesture.Native(), []);
  const pan = useMemo(
    () => Gesture.Pan()
      .activeOffsetY(12)
      .onUpdate((e) => {
        'worklet';
        if (e.translationY > 0 && scrollY.value <= 0) translateY.value = e.translationY;
      })
      .onEnd((e) => {
        'worklet';
        if (scrollY.value <= 0 && (e.translationY > DISMISS_DY || e.velocityY > DISMISS_VY)) {
          runOnJS(animateClose)();
        } else {
          translateY.value = withSpring(0, { damping: 30, stiffness: 300 });
        }
      })
      .simultaneousWithExternalGesture(nativeGesture),
    [nativeGesture], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP),
  }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Keep a small sensible gap above the keyboard (not flush), and the full
  // safe-area + margin when the keyboard is down.
  const bottomPad = kbVisible ? space.md : insets.bottom + space.md;

  const onBodyScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.value = e.nativeEvent.contentOffset.y;
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={animateClose} accessibilityRole="button" accessibilityLabel="Close" />
      </Animated.View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.wrap}
        pointerEvents="box-none"
      >
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.sheet, { paddingBottom: bottomPad }, sheetStyle]}>
            <View style={styles.grabber}>
              <View style={styles.handle} />
              {(title || headerRight) ? (
                <View style={styles.titleRow}>
                  {title ? <Text style={styles.title}>{title}</Text> : <View />}
                  {headerRight}
                </View>
              ) : null}
            </View>
            {scroll ? (
              <GestureDetector gesture={nativeGesture}>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                  scrollEventThrottle={16}
                  onScroll={onBodyScroll}
                  style={styles.bodyWrap}
                  contentContainerStyle={styles.content}
                >
                  {children}
                </ScrollView>
              </GestureDetector>
            ) : (
              <View style={styles.content}>{children}</View>
            )}
          </Animated.View>
        </GestureDetector>
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * The sheet's horizontal inset, exported so a full-bleed child can cancel it.
 *
 * A list inside the sheet inherits this padding, which puts its scroll indicator 24pt in from
 * the edge — hard against the content instead of beside it. Such a child sets
 * `marginHorizontal: -SHEET_PADDING_H` and re-applies the padding to its own content
 * container, so the indicator rides the real edge and the content keeps its inset.
 */
export const SHEET_PADDING_H = space.lg;

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay },
  wrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: SHEET_PADDING_H,
    paddingTop: space.sm,
    maxHeight: '88%',
    ...shadow.lg,
  },
  bodyWrap: { flexShrink: 1 },
  grabber: { paddingBottom: space.xs },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: space.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  title: { ...type.subheading, color: colors.textPrimary },
  content: { gap: space.md, paddingTop: space.xs },
});
