import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Dimensions, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, shadow } from '../tokens';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const PIECES = 22;
const CONFETTI_COLORS = [colors.accent, colors.income, colors.coral, colors.settle, colors.healthAmber];

/**
 * A lightweight, dependency-free celebration overlay — a burst of falling
 * confetti + a "Goal reached!" card. Shown when a savings goal hits 100%.
 * Auto-dismisses; tap to dismiss early.
 */
export function GoalCelebration({ visible, goalName, onDone }: { visible: boolean; goalName: string; onDone: () => void }) {
  const pieces = useRef(
    Array.from({ length: PIECES }, (_, i) => ({
      x: (i / PIECES) * SCREEN_W,
      driftX: (Math.random() - 0.5) * 120,
      delay: Math.random() * 250,
      size: 7 + Math.random() * 7,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      fall: new Animated.Value(0),
    })),
  ).current;
  const cardScale = useRef(new Animated.Value(0.8)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    cardScale.setValue(0.8);
    cardOpacity.setValue(0);
    pieces.forEach(p => p.fall.setValue(0));

    Animated.parallel([
      Animated.spring(cardScale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ...pieces.map(p =>
        Animated.timing(p.fall, { toValue: 1, duration: 1800, delay: p.delay, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ),
    ]).start();

    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [visible]);

  if (!visible) return null;

  return (
    <Pressable style={styles.overlay} onPress={onDone}>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: p.x,
            top: -20,
            width: p.size,
            height: p.size * 1.6,
            borderRadius: 2,
            backgroundColor: p.color,
            opacity: p.fall.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateY: p.fall.interpolate({ inputRange: [0, 1], outputRange: [0, SCREEN_H * 0.9] }) },
              { translateX: p.fall.interpolate({ inputRange: [0, 1], outputRange: [0, p.driftX] }) },
              { rotate: p.fall.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '540deg'] }) },
            ],
          }}
        />
      ))}
      <Animated.View style={[styles.card, { opacity: cardOpacity, transform: [{ scale: cardScale }] }]}>
        <View style={styles.iconCircle}>
          <Feather name="award" size={30} color={colors.income} />
        </View>
        <Text style={styles.title}>Goal reached!</Text>
        <Text style={styles.sub} numberOfLines={2}>You fully funded “{goalName}”. Time for the next one.</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  card: { alignItems: 'center', gap: space.sm, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingVertical: space.xl, paddingHorizontal: space.lg, marginHorizontal: space.xl, ...shadow.lg },
  iconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.income + '22', alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  title: { ...type.title, color: colors.textPrimary },
  sub: { ...type.body, color: colors.textSecondary, textAlign: 'center' },
});
