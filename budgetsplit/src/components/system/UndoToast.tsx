import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, layout, shadow } from '../tokens';

const UNDO_MS = 5000;

type UndoRequest = { message: string; onUndo: () => void };
type Ctx = { showUndo: (req: UndoRequest) => void };

const UndoContext = createContext<Ctx>({ showUndo: () => {} });

/** Wrap the app so any screen can show a 5s "Undo" toast after a destructive
 *  action. The toast lives above navigation, so it survives `router.back()`. */
export function UndoProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [req, setReq] = useState<UndoRequest | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(1)).current;

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => setReq(null));
  }, [opacity]);

  const showUndo = useCallback((r: UndoRequest) => {
    if (timer.current) clearTimeout(timer.current);
    setReq(r);
    opacity.setValue(0);
    progress.setValue(1);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    Animated.timing(progress, { toValue: 0, duration: UNDO_MS, easing: Easing.linear, useNativeDriver: false }).start();
    timer.current = setTimeout(() => dismiss(), UNDO_MS);
  }, [opacity, progress, dismiss]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <UndoContext.Provider value={{ showUndo }}>
      {children}
      {req && (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.wrap, { bottom: insets.bottom + layout.tabBarHeight + space.sm, opacity }]}
        >
          <View style={styles.toast}>
            <Feather name="trash-2" size={15} color={colors.textSecondary} />
            <Text style={styles.message} numberOfLines={1}>{req.message}</Text>
            <TouchableOpacity
              onPress={() => { req.onUndo(); dismiss(); }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Undo"
            >
              <Text style={styles.undo}>Undo</Text>
            </TouchableOpacity>
          </View>
          <Animated.View style={[styles.progress, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
        </Animated.View>
      )}
    </UndoContext.Provider>
  );
}

export function useUndo() {
  return useContext(UndoContext);
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: layout.screenPaddingH, right: layout.screenPaddingH, borderRadius: radius.md, overflow: 'hidden', ...shadow.lg },
  toast: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bgMuted, paddingHorizontal: space.md, paddingVertical: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  message: { ...type.body, color: colors.textPrimary, flex: 1 },
  undo: { ...type.body, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  progress: { position: 'absolute', bottom: 0, left: 0, height: 2, backgroundColor: colors.accent },
});
