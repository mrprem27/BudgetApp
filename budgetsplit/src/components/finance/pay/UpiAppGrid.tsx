import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PressableScale } from '../../ui/PressableScale';
import { UpiAppIcon } from './UpiAppIcon';
import { handoffVerb, type PayOpts } from '../../../hooks/useUpiHandoff';
import { colors, type, space } from '../../tokens';
import type { UpiAppSpec } from '../../../lib/upiIntent';

/**
 * Every installed UPI app, as tappable icons — the iOS replacement for
 * `ActionSheetIOS`'s plain-text list.
 *
 * The text list could never show a real icon and read identically whether an app
 * would arrive pre-filled or not (a `— scan it there` suffix buried in a row of
 * text). A grid puts the same information where it's easier to scan at a glance,
 * and gives `UpiAppSpec.logo` somewhere to actually appear once real artwork
 * exists (see `UpiAppIcon`).
 */
export function UpiAppGrid({
  apps,
  opts,
  onSelect,
}: {
  apps: UpiAppSpec[];
  /** Same options the pay button hands off with, so a row's caption matches what tapping it does. */
  opts?: PayOpts;
  onSelect: (app: UpiAppSpec) => void;
}) {
  return (
    <View style={styles.grid}>
      {apps.map(app => (
        <PressableScale key={app.key} onPress={() => onSelect(app)} style={styles.cell} accessibilityLabel={app.label}>
          <UpiAppIcon app={app} size={48} />
          <Text style={styles.label} numberOfLines={1}>{app.label}</Text>
          {(opts?.bare || app.blocked) && (
            <Text style={styles.sub} numberOfLines={1}>{handoffVerb(opts)}</Text>
          )}
        </PressableScale>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, paddingBottom: space.sm },
  cell: { width: 72, alignItems: 'center', gap: space.xs },
  label: { ...type.caption, color: colors.textPrimary, textAlign: 'center' },
  sub: { ...type.caption, color: colors.textMuted, fontSize: 10, textAlign: 'center' },
});
