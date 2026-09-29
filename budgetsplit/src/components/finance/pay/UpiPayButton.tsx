import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { UpiAppGrid } from './UpiAppGrid';
import { UpiAppIcon } from './UpiAppIcon';
import { handoffVerb, type UpiHandoff, type PayHooks, type PayOpts } from '../../../hooks/useUpiHandoff';
import { colors, type, space, layout } from '../../tokens';
import type { UpiRequest } from '../../../lib/upiIntent';

/**
 * The one control for handing a payment to a UPI app: the apps you can pay with, and the button.
 *
 * The apps are always on screen — one tap on an icon to choose, no disclosure to open first, and
 * choosing only *selects* (and remembers) it: nothing collapses, nothing closes, nothing is sent.
 * Paying is the button's job alone, so a mis-tap in the grid can never move money. (It used to be a
 * collapsed "Pay using X · Change" row that hid the choice one tap away and folded itself shut on
 * every selection — an extra step to see the options and another to lose them.)
 *
 * Scan & Pay and settle-up both use this, so the choice looks and behaves the same in both.
 */
export function UpiPayButton({
  handoff,
  request,
  hooks,
  opts,
  label,
  accessibilityLabel,
  disabled,
  onLongPress,
  onDone,
}: {
  handoff: UpiHandoff;
  /** `null` hides the whole control — same as the caller not rendering it. */
  request: UpiRequest | null;
  hooks?: PayHooks;
  opts?: PayOpts;
  label: string;
  /** Overrides `label` for screen readers — e.g. naming who a payment goes to, when the visible label is kept short. */
  accessibilityLabel?: string;
  disabled?: boolean;
  /** Reveals `UpiUriSheet` on the two call sites that offer it. */
  onLongPress?: () => void;
  /** Whatever app was opened, so the caller can close its own sheet. */
  onDone?: (opened: boolean) => void;
}) {
  async function go() {
    if (!request) return;
    onDone?.(await handoff.payWith(handoff.target, request, hooks, opts));
  }

  const dest = handoff.target;
  const apps = handoff.apps ?? [];
  const showDest = !!dest && !!request && apps.length > 0;
  const hint = dest && (opts?.bare || dest.blocked) ? handoffVerb(opts) : null;

  return (
    <>
      {showDest && (
        <View style={styles.picker}>
          <Text style={styles.caption}>Pay with</Text>
          {/* One app: nothing to choose between, so show it as a row, not a one-item grid. */}
          {handoff.canChoose ? (
            <UpiAppGrid apps={apps} opts={opts} selectedKey={dest!.key} onSelect={handoff.choose} />
          ) : (
            <View style={styles.single}>
              <UpiAppIcon app={dest!} size={40} />
              <Text style={styles.appName}>{dest!.label}</Text>
            </View>
          )}
          {/* The grid already captions each such app; the single-app row has no caption of its own. */}
          {hint && !handoff.canChoose && <Text style={styles.hint}>{`${dest!.label} · ${hint}`}</Text>}
        </View>
      )}
      <PrimaryButton
        label={label}
        accessibilityLabel={accessibilityLabel}
        onPress={go}
        onLongPress={onLongPress}
        disabled={disabled || !request}
      />
    </>
  );
}

const styles = StyleSheet.create({
  picker: { marginBottom: space.md },
  caption: { ...type.label, color: colors.textSecondary, marginBottom: space.sm },
  single: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: layout.rowMinHeight },
  appName: { ...type.bodySemi, color: colors.textPrimary },
  hint: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
});
