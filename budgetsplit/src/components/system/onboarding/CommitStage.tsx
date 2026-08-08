import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useReducedMotion } from 'react-native-reanimated';
import { IconCircle } from '../../ui/IconCircle';
import { colors, type, space, layout } from '../../tokens';

/**
 * What `finalizeOnboarding` actually does, in the order it does it — see
 * `src/lib/onboarding.ts`. These are labels for real work, not invented reassurance.
 */
const PHASES = [
  { icon: 'tag', label: 'Setting up your categories' },
  { icon: 'sliders', label: 'Personalising your view' },
  { icon: 'bell', label: 'Lining up your reminders' },
] as const;

/** Minimum time each phase is shown, so a fast commit doesn't strobe. */
const PHASE_MS = 420;

type Props = {
  /** False once the real DB commit has resolved. */
  saving: boolean;
};

/**
 * "Setting things up" — the beat that covers the single commit.
 *
 * `finalizeOnboarding` is one atomic write, deliberately: it can't be half-applied by
 * someone who abandons setup. That means there is **no real per-phase progress to
 * report**, so this ticks phases on a timer while the write is in flight.
 *
 * Two rules keep that from becoming a lie:
 *  - the last phase never completes until `saving` is actually false, so the screen
 *    can't claim to be finished before the write returns;
 *  - the phases name work the commit genuinely performs, rather than inventing steps.
 *
 * It exists because the one moment the app writes everything the user just told it was
 * previously a silent pause on the permissions screen.
 */
export function CommitStage({ saving }: Props) {
  const [phase, setPhase] = useState(0);
  const reduced = useReducedMotion();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (reduced) { setPhase(PHASES.length - 1); return; }
    timer.current = setInterval(() => {
      // Hold on the last phase; only `saving` turning false completes it.
      setPhase(p => (p >= PHASES.length - 1 ? p : p + 1));
    }, PHASE_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [reduced]);

  return (
    <View style={styles.wrap}>
      <IconCircle icon="check-circle" size={72} color={colors.accent} iconSize={32} />
      <Text style={styles.title}>Setting things up</Text>
      <Text style={styles.body}>One moment — saving everything you just told us.</Text>

      <View style={styles.list}>
        {PHASES.map((p, i) => {
          // The final phase is only done when the write has actually returned.
          const done = i < phase || (i === phase && !saving);
          const active = i === phase && saving;
          return (
            <View key={p.label} style={styles.row}>
              <View style={styles.mark}>
                {done ? (
                  <Feather name="check" size={16} color={colors.income} />
                ) : active ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Feather name={p.icon} size={15} color={colors.textMuted} />
                )}
              </View>
              <Text style={[styles.label, done && styles.labelDone, !done && !active && styles.labelIdle]}>
                {p.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.md },
  title: { ...type.title, color: colors.textPrimary, textAlign: 'center', marginTop: space.md },
  body: { ...type.body, color: colors.textSecondary, textAlign: 'center' },
  list: { alignSelf: 'stretch', gap: space.sm, marginTop: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: layout.rowMinHeight },
  mark: { width: 24, alignItems: 'center', justifyContent: 'center' },
  label: { ...type.body, color: colors.textPrimary, flex: 1 },
  labelDone: { color: colors.income },
  labelIdle: { color: colors.textMuted },
});
