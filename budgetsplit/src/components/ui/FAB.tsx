import React, { useRef } from 'react';
import {
  TouchableOpacity, View, Text, StyleSheet, Modal, Pressable, Animated, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, shadow, gradients } from '../tokens';
import { layout } from '../../constants/layout';
import type { FeatherName } from '../../constants/palette';
import { haptic } from '../../lib/haptics';

export type Action = {
  label: string;
  icon: FeatherName;
  onPress: () => void;
  disabled?: boolean;
  description?: string;
  /** Tint for the icon circle (defaults to accent). */
  tint?: string;
};

type Props = {
  /** Multi-action fan-out menu. Ignored when `onPress` is given. */
  actions?: Action[];
  /** Single-tap action — fires directly, no menu. Takes precedence over `actions`. */
  onPress?: () => void;
  /** Lift the FAB above the tab bar. Set false on pushed screens (no tab bar). */
  aboveTabBar?: boolean;
};

export function FAB({ actions, onPress, aboveTabBar = true }: Props) {
  const [open, setOpen] = React.useState(false);
  const insets = useSafeAreaInsets();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  // Defer an action's navigation until the menu modal has fully dismissed —
  // navigating while it's mid-dismiss races a modal-present and flashes black on iOS.
  const pendingAction = useRef<(() => void) | null>(null);
  // Single-tap mode when an onPress is supplied; otherwise fan out the menu.
  const single = typeof onPress === 'function';

  function pressIn() {
    Animated.spring(scaleAnim, { toValue: 0.9, useNativeDriver: true, speed: 40 }).start();
  }
  function pressOut() {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 12 }).start();
  }

  return (
    <>
      {!single && (
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        onDismiss={() => { const fn = pendingAction.current; pendingAction.current = null; fn?.(); }}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
            <View style={styles.handle} />
            {(actions ?? []).map((a) => {
              const tint = a.disabled ? colors.textMuted : (a.tint ?? colors.accent);
              return (
                <TouchableOpacity
                  key={a.label}
                  style={[styles.action, a.disabled && styles.actionDisabled]}
                  disabled={a.disabled}
                  onPress={() => {
                    haptic.light();
                    // iOS: run after the menu's onDismiss (avoids black-screen race).
                    // Android: no onDismiss, so run on the next tick after closing.
                    if (Platform.OS === 'ios') { pendingAction.current = a.onPress; setOpen(false); }
                    else { setOpen(false); setTimeout(a.onPress, 0); }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={a.label}
                >
                  <View style={[styles.actionIcon, { backgroundColor: tint + '22', borderColor: tint + '44' }]}>
                    <Feather name={a.icon} size={18} color={tint} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.actionLabel, a.disabled && { color: colors.textMuted }]}>{a.label}</Text>
                    {!!a.description && <Text style={styles.actionDesc}>{a.description}</Text>}
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
      )}

      <Animated.View
        style={[
          styles.fab,
          aboveTabBar
            ? {
                // Tab screens: centered + straddling the tab bar top (the 50% point
                // sits in the gap between Groups and Plan, so it covers no icon).
                left: '50%',
                bottom: insets.bottom + layout.tabBarHeight - 24,
                transform: [{ translateX: -28 }, { scale: scaleAnim }],
              }
            : {
                // Pushed screens (no tab bar): bottom-right, small fixed gap.
                right: space.lg,
                bottom: insets.bottom + space.sm,
                transform: [{ scale: scaleAnim }],
              },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.9}
          onPressIn={pressIn}
          onPressOut={pressOut}
          onPress={() => { haptic.light(); if (single) { onPress!(); } else { setOpen(true); } }}
          accessibilityRole="button"
          accessibilityLabel="Add expense"
        >
          <LinearGradient
            colors={gradients.brand}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fabGradient}
          >
            <Feather name="plus" size={28} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    ...shadow.fab,
    zIndex: 100,
  },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    ...shadow.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 38, height: 4, borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: space.md,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.xs,
    borderRadius: radius.md,
    minHeight: 56,
  },
  actionIcon: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  actionDisabled: {
    opacity: 0.5,
  },
  actionLabel: {
    ...type.body,
    color: colors.textPrimary,
    fontFamily: 'Inter_600SemiBold',
  },
  actionDesc: {
    ...type.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
});
