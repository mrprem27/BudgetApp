import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, layout, shadow } from '../tokens';

const UNDO_MS = 5000;
const INFO_MS = 4000;

type UndoRequest = { message: string; onUndo: () => void };
type ToastRequest = {
  message: string;
  icon?: keyof typeof Feather.glyphMap;
  /** Tints the icon. Neutral by default — a toast is information, not a verdict. */
  tone?: 'neutral' | 'good' | 'bad';
};

type Shown =
  | ({ kind: 'undo' } & UndoRequest)
  | ({ kind: 'info' } & ToastRequest);

type Ctx = {
  /** Destructive action + a 5s way back. */
  showUndo: (req: UndoRequest) => void;
  /** A transient message with no action attached. */
  showToast: (req: ToastRequest) => void;
};

const ToastContext = createContext<Ctx>({ showUndo: () => {}, showToast: () => {} });

/**
 * Wrap the app so any screen can raise a transient toast. It lives above
 * navigation, so it survives `router.back()` — which is what makes it usable for
 * feedback about an action whose screen is already dismissing.
 *
 * Two shapes, one implementation: `showUndo` (destructive action + 5s way back)
 * and `showToast` (a message, no action). The second exists because "that leaves
 * you ₹19,000" has to appear *after* the Add screen closes; standing up a second
 * toast stack to say so would have been the same component twice.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [req, setReq] = useState<Shown | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(1)).current;

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => setReq(null));
  }, [opacity]);

  const show = useCallback((next: Shown, ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    setReq(next);
    opacity.setValue(0);
    progress.setValue(1);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    Animated.timing(progress, { toValue: 0, duration: ms, easing: Easing.linear, useNativeDriver: false }).start();
    timer.current = setTimeout(() => dismiss(), ms);
  }, [opacity, progress, dismiss]);

  const showUndo = useCallback((r: UndoRequest) => show({ kind: 'undo', ...r }, UNDO_MS), [show]);
  const showToast = useCallback((r: ToastRequest) => show({ kind: 'info', ...r }, INFO_MS), [show]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const iconName: keyof typeof Feather.glyphMap = req == null
    ? 'info'
    : req.kind === 'undo' ? 'trash-2' : (req.icon ?? 'info');
  const iconColor = req?.kind === 'info' && req.tone === 'good' ? colors.income
    : req?.kind === 'info' && req.tone === 'bad' ? colors.healthRed
    : colors.textSecondary;

  return (
    <ToastContext.Provider value={{ showUndo, showToast }}>
      {children}
      {req && (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.wrap, { bottom: insets.bottom + layout.tabBarHeight + space.sm, opacity }]}
        >
          <View style={styles.toast}>
            <Feather name={iconName} size={15} color={iconColor} />
            <Text style={styles.message} numberOfLines={2}>{req.message}</Text>
            {req.kind === 'undo' && (
              <TouchableOpacity
                onPress={() => { req.onUndo(); dismiss(); }}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Undo"
              >
                <Text style={styles.undo}>Undo</Text>
              </TouchableOpacity>
            )}
          </View>
          <Animated.View style={[styles.progress, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: layout.screenPaddingH, right: layout.screenPaddingH, borderRadius: radius.md, overflow: 'hidden', ...shadow.lg },
  toast: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bgMuted, paddingHorizontal: space.md, paddingVertical: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  message: { ...type.body, color: colors.textPrimary, flex: 1 },
  undo: { ...type.body, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  progress: { position: 'absolute', bottom: 0, left: 0, height: 2, backgroundColor: colors.accent },
});
