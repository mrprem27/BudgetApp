import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, type, space, layout } from '../tokens';
import { AnimatedBar } from '../ui/anim/AnimatedBar';
import { PressableScale } from '../ui/PressableScale';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import type { SyncStatusView } from '../../lib/syncStatus';

const ICON: Record<SyncStatusView['state'], React.ComponentProps<typeof Feather>['name']> = {
  syncing: 'refresh-cw',
  offline: 'cloud-off',
  'up-to-date': 'check-circle',
  waiting: 'upload-cloud',
  failed: 'alert-circle',
  'not-connected': 'link',
};

const TONE: Record<SyncStatusView['tone'], string> = {
  quiet: colors.textMuted,
  neutral: colors.textSecondary,
  error: colors.expense,
};

/**
 * The one sync status line (SPEC-SERVER.md §6.1, layout picked in S15): a quiet
 * line at the top of Settings → Sync and Settings → Account, and nowhere else —
 * never on Home, which already has three status surfaces (`A-01`).
 * `syncStatusSurfaces.test.ts` counts its call sites.
 *
 * `onPress` makes the line itself a way in (Account → Sync). `onConnect` is the
 * fix for a phone that is signed in but not yet joined to the account; without
 * it, "Connect" and "Sign in" both lead to Account, where the fix lives.
 * Reduce Motion is honoured by `AnimatedBar`.
 */
export function SyncStatus({ onPress, onConnect }: { onPress?: () => void; onConnect?: () => void }) {
  const router = useRouter();
  const status = useSyncStatus();
  if (!status) return null;
  const { view, retry } = status;
  const tint = TONE[view.tone];

  const act = () => {
    if (view.action?.kind === 'retry') retry();
    else if (view.action?.kind === 'connect' && onConnect) onConnect();
    else router.push('/settings/account');
  };

  const line = (
    <View style={styles.row} accessibilityRole={onPress ? 'button' : 'text'} accessibilityLabel={view.text}>
      <Feather name={ICON[view.state]} size={16} color={tint} />
      <Text style={[styles.text, { color: tint }]} numberOfLines={2}>{view.text}</Text>
      {view.action ? (
        <TouchableOpacity onPress={act} hitSlop={10} accessibilityRole="button" accessibilityLabel={view.action.label}>
          <Text style={[styles.action, { color: view.tone === 'error' ? colors.expense : colors.accent }]}>{view.action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  return (
    <View style={styles.wrap}>
      {onPress ? <PressableScale onPress={onPress}>{line}</PressableScale> : line}
      {view.progress != null && <AnimatedBar progress={view.progress} accessibilityLabel={view.text} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs, marginBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: layout.touchMin },
  text: { ...type.caption, flex: 1, lineHeight: 18 },
  action: { ...type.label },
});
