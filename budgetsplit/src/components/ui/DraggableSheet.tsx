import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Animated, Dimensions,
  KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
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
 * a Modal. Drag is powered by react-native-gesture-handler.
 */
export function DraggableSheet({ onClose, title, children, scroll = true, headerRight }: Props) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(SCREEN_H)).current;
  const [kbVisible, setKbVisible] = useState(false);
  const scrollY = useRef(0);
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
    translateY.setValue(SCREEN_H);
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 2, speed: 14 }).start();
  }, [translateY]);

  const animateClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.timing(translateY, { toValue: SCREEN_H, duration: 200, useNativeDriver: true }).start(({ finished }) => {
      if (finished && mountedRef.current) onClose();
    });
  };
  const springBack = () => Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 16 }).start();

  const nativeGesture = useMemo(() => Gesture.Native(), []);
  const pan = useMemo(
    () => Gesture.Pan()
      // These callbacks drive RN Animated (translateY.setValue / Animated.timing),
      // which is JS-thread only. With Reanimated present, gesture-handler would
      // otherwise workletize them onto the UI thread and crash — so pin to JS.
      .runOnJS(true)
      .activeOffsetY(12)
      .onUpdate((e) => { if (e.translationY > 0 && scrollY.current <= 0) translateY.setValue(e.translationY); })
      .onEnd((e) => {
        if (scrollY.current <= 0 && (e.translationY > DISMISS_DY || e.velocityY > DISMISS_VY)) animateClose();
        else springBack();
      })
      .simultaneousWithExternalGesture(nativeGesture),
    [nativeGesture], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const backdropOpacity = translateY.interpolate({ inputRange: [0, SCREEN_H], outputRange: [1, 0], extrapolate: 'clamp' });
  // Keep a small sensible gap above the keyboard (not flush), and the full
  // safe-area + margin when the keyboard is down.
  const bottomPad = kbVisible ? space.md : insets.bottom + space.md;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={animateClose} accessibilityRole="button" accessibilityLabel="Close" />
      </Animated.View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.wrap}
        pointerEvents="box-none"
      >
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.sheet, { paddingBottom: bottomPad, transform: [{ translateY }] }]}>
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
                  onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
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
