import React, { useRef } from 'react';
import {
  TouchableOpacity, View, Text, StyleSheet, Modal, Pressable, Animated,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from './tokens';
import { layout } from '../constants/layout';

type Action = {
  label: string;
  icon: string;
  onPress: () => void;
  disabled?: boolean;
};

type Props = {
  actions: Action[];
};

export function FAB({ actions }: Props) {
  const [open, setOpen] = React.useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  function pulse() {
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 1.1, useNativeDriver: true, speed: 30 }),
      Animated.spring(scaleAnim, { toValue: 1,   useNativeDriver: true, speed: 30 }),
    ]).start();
  }

  return (
    <>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            {actions.map(a => (
              <TouchableOpacity
                key={a.label}
                style={[styles.action, a.disabled && styles.actionDisabled]}
                disabled={a.disabled}
                onPress={() => { setOpen(false); a.onPress(); }}
                accessibilityRole="button"
                accessibilityLabel={a.label}
              >
                <Feather name={a.icon as any} size={20} color={a.disabled ? colors.textMuted : colors.textPrimary} />
                <Text style={[styles.actionLabel, a.disabled && { color: colors.textMuted }]}>
                  {a.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Animated.View style={[styles.fab, { transform: [{ scale: scaleAnim }] }]}>
        <TouchableOpacity
          style={styles.fabInner}
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Add transaction"
        >
          <Feather name="plus" size={28} color={colors.bg} />
        </TouchableOpacity>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: layout.tabBarHeight + space.md,
    right: space.md,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    elevation: 6,
    shadowColor: colors.accent,
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    zIndex: 100,
  },
  fabInner: {
    flex: 1,
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
    padding: space.lg,
    gap: space.sm,
    marginBottom: layout.tabBarHeight,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
  },
  actionDisabled: {
    opacity: 0.5,
  },
  actionLabel: {
    ...type.body,
    color: colors.textPrimary,
  },
});
