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

type Props = {
  /** Called once the close animation finishes (e.g. router.back / setVisible(false)). */
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Wrap children in a ScrollView (for long content). Default true. */
  scroll?: boolean;
  /** Optional control rendered at the right of the title row (e.g. a segmented toggle). */
  headerRight?: React.ReactNode;
};

/**
 * The bottom-sheet body WITHOUT an RN <Modal> wrapper — it fills its parent and
 * draws its own dimmed backdrop + draggable sheet. Use this directly as the root
 * of a `transparentModal` route screen (the route is the overlay; nesting a
 * Modal there collapses to a black screen once the keyboard opens). For an
 * inline sheet over a normal screen, use {@link SheetModal}, which wraps this in
 * a Modal. Drag is powered by react-native-gesture-handler + Reanimated, so the
 * gesture and the sheet transform stay on the UI thread (no JS-thread stutter).
 */
export function DraggableSheet({ onClose, title, children, scroll = true, headerRight }: Props) {
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

  const finishClose = () => { if (mountedRef.current) onClose(); };

  const animateClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    translateY.value = withTiming(SCREEN_H, { duration: 200 }, (finished) => {
      'worklet';
      if (finished) runOnJS(finishClose)();
    });
  };

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

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay },
  wrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.lg,
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
