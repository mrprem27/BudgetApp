import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { PressableScale } from '../../ui/PressableScale';
import { UpiAppIcon } from './UpiAppIcon';
import { handoffVerb, type PayOpts } from '../../../hooks/useUpiHandoff';
import { colors, type, space, radius } from '../../tokens';
import type { UpiAppSpec } from '../../../lib/upiIntent';

/**
 * Every installed UPI app, as a row of tappable icons — the iOS replacement for
 * `ActionSheetIOS`'s plain-text list.
 *
 * The text list could never show a real icon and read identically whether an app
 * would arrive pre-filled or not (a `— scan it there` suffix buried in a row of
 * text). A grid puts the same information where it's easier to scan at a glance,
 * and shows each app's own icon (see `UpiAppIcon`).
 */
export function UpiAppGrid({
  apps,
  opts,
  selectedKey,
  onSelect,
}: {
  apps: UpiAppSpec[];
  /** Same options the pay button hands off with, so a row's caption matches what tapping it does. */
  opts?: PayOpts;
  /** The app the Pay button will open — ringed, so the current choice is visible in the grid. */
  selectedKey?: string | null;
  onSelect: (app: UpiAppSpec) => void;
}) {
  // One row that scrolls, not a grid: every installed app used to stack into a tall block above
  // the Pay button, and a quarter-width cell cut "Amazon Pay" and "super.money" off (`U-14`).
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip} contentContainerStyle={styles.row}>
      {apps.map(app => {
        const selected = app.key === selectedKey;
        return (
        <PressableScale
          key={app.key}
          onPress={() => onSelect(app)}
          style={styles.cell}
          accessibilityLabel={app.label}
          accessibilityState={{ selected }}
        >
          <View style={[styles.ring, selected && styles.ringOn]}>
            <UpiAppIcon app={app} size={52} />
          </View>
          <Text style={[styles.label, selected && styles.labelOn]} numberOfLines={2}>{app.label}</Text>
          {(opts?.bare || app.blocked) && (
            <Text style={styles.sub} numberOfLines={1}>{handoffVerb(opts)}</Text>
          )}
        </PressableScale>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { flexGrow: 0 },
  row: { gap: space.sm, paddingBottom: space.xs },
  cell: { width: 72, alignItems: 'center', gap: space.xs },
  // Always 2pt, transparent when unselected, so selecting doesn't shift the grid.
  ring: { padding: 3, borderRadius: radius.lg, borderWidth: 2, borderColor: 'transparent' },
  ringOn: { borderColor: colors.accent },
  label: { ...type.caption, color: colors.textPrimary, textAlign: 'center', lineHeight: 15 },
  labelOn: { color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  sub: { ...type.caption, color: colors.textMuted, fontSize: 10, textAlign: 'center' },
});
