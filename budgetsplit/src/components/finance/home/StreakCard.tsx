import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../../constants/colors';
import { type } from '../../../constants/typography';
import { space, radius, shadow } from '../../../constants/layout';

interface Props {
  streak: number;
  daysInMonth: number;
  loggedDays: Set<string>; // 'YYYY-MM-DD' strings
}

export function StreakCard({ streak, daysInMonth, loggedDays }: Props) {
  if (streak < 3) return null;
  const now = new Date();
  const yr = now.getFullYear();
  const mo = now.getMonth();

  return (
    <View style={styles.card}>
      <Text style={styles.label}>TRACKING STREAK</Text>
      <View style={styles.inner}>
        <View style={styles.badge}>
          <Text style={styles.fireEmoji}>🔥</Text>
          <Text style={styles.count}>{streak}</Text>
        </View>
        <View style={styles.right}>
          <Text style={styles.headline}>{streak}-day streak!</Text>
          <Text style={styles.sub}>You've logged every day this month.</Text>
          <View style={styles.dots}>
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayDate = new Date(yr, mo, i + 1);
              const key = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
              const future = dayDate > now;
              const logged = loggedDays.has(key);
              return (
                <View
                  key={i}
                  style={[styles.dot, future ? styles.dotFuture : logged ? styles.dotLogged : styles.dotMissed]}
                />
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginBottom: space.md,
    ...shadow.sm,
  },
  label: {
    ...type.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '700',
    marginBottom: space.sm,
  },
  inner: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  badge: {
    width: 54,
    height: 54,
    borderRadius: 14,
    backgroundColor: colors.expenseTint,
    borderWidth: 1,
    borderColor: colors.expenseTintStrong,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    gap: 2,
  },
  fireEmoji: { fontSize: 20, lineHeight: 24 },
  count: { fontFamily: 'SpaceMono_400Regular', fontSize: 16, color: '#FF7A6D', lineHeight: 18 },
  right: { flex: 1 },
  headline: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: colors.textPrimary, marginBottom: 2 },
  sub: { ...type.caption, color: colors.textSecondary, marginBottom: space.sm },
  dots: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  dot: { width: 10, height: 10, borderRadius: 3 },
  dotLogged: { backgroundColor: '#FF7A6D' },
  dotMissed: { backgroundColor: '#FF7A6D', opacity: 0.2 },
  dotFuture: { backgroundColor: colors.bgMuted },
});
