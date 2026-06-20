import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, Animated, PanResponder, Dimensions,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, type, space, radius, shadow } from '../tokens';

const SCREEN_H = Dimensions.get('window').height;
const DISMISS_DY = 120;   // drag distance past which we close
const DISMISS_VY = 0.8;   // …or a fast flick

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Wrap children in a ScrollView (for long content). Default true. */
  scroll?: boolean;
};

/**
 * The single bottom-sheet used across the app:
 * - spring-in on open, **drag the handle down to dismiss** (snaps back if you
 *   don't pull far enough), backdrop fades with the drag
 * - keyboard avoidance, tap-backdrop to dismiss, rounded top, safe-area padding
 * Improving this lifts every sheet in the app.
 */
export function SheetModal({ visible, onClose, title, children, scroll = true }: Props) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(SCREEN_H)).current;

  const animateClose = (cb: () => void) => {
    Animated.timing(translateY, { toValue: SCREEN_H, duration: 200, useNativeDriver: true }).start(({ finished }) => { if (finished) cb(); });
  };

  useEffect(() => {
    if (visible) {
      translateY.setValue(SCREEN_H);
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 2, speed: 14 }).start();
    }
  }, [visible]);

  // Drag handle (grabber) → follow the finger downward; release decides.
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => { if (g.dy > 0) translateY.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > DISMISS_DY || g.vy > DISMISS_VY) animateClose(onClose);
        else Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 16 }).start();
      },
    }),
  ).current;

  const backdropOpacity = translateY.interpolate({ inputRange: [0, SCREEN_H], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={() => animateClose(onClose)}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => animateClose(onClose)} accessibilityRole="button" accessibilityLabel="Close" />
      </Animated.View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.wrap}
        pointerEvents="box-none"
      >
        <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + space.md, transform: [{ translateY }] }]}>
          <View {...pan.panHandlers} style={styles.grabber}>
            <View style={styles.handle} />
            {title ? <Text style={styles.title}>{title}</Text> : null}
          </View>
          {scroll ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.content}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={styles.content}>{children}</View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
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
  grabber: { paddingBottom: space.xs },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: space.sm },
  title: { ...type.subheading, color: colors.textPrimary, marginBottom: space.sm },
  content: { gap: space.md, paddingTop: space.xs },
});
