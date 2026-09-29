import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { SheetModal } from '../../ui/SheetModal';
import { UpiAppGrid } from './UpiAppGrid';
import { handoffVerb, type UpiHandoff, type PayHooks, type PayOpts } from '../../../hooks/useUpiHandoff';
import { colors, type, space } from '../../tokens';
import type { UpiRequest } from '../../../lib/upiIntent';

/**
 * The one control for handing a payment to a UPI app: a button, the destination it's
 * about to open, and a way to change it — Scan & Pay and settle-up each hand-rolled this
 * trio (down to a comment on one reading "mirrors [the other]'s destination row"), which
 * is exactly the copy this component exists to remove (`AGENTS.md` §9 on hand-rolled
 * pills applies here too — one shape, one implementation).
 *
 * The "Change app" picker sheet is rendered here, but its open/closed state is
 * **controlled by the caller** (`pickerOpen`/`onPickerOpenChange`) rather than owned
 * internally — a caller that hosts this inside its own `SheetModal` (`ScanPaySheet`)
 * MUST fold `pickerOpen` into that outer sheet's own `visible` (`visible={mainVisible
 * && !pickerOpen}`), or the picker's `claimStage()` evicts the outer sheet and nothing
 * ever tells it to reclaim the stage — two `SheetModal`s effectively visible in
 * overlapping windows is the exact RN-Modal hang `lib/sheetStage.ts`'s own header
 * documents. A caller with no outer sheet (`TransferBody`, a route-level screen) just
 * threads a local `useState` through with nothing else to coordinate.
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
  pickerOpen,
  onPickerOpenChange,
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
  /** Controlled — see the file header on why the caller must own this. */
  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
}) {
  async function go(app: typeof handoff.target) {
    if (!request) return;
    onPickerOpenChange(false);
    onDone?.(await handoff.payWith(app, request, hooks, opts));
  }

  const dest = handoff.target;
  const showDest = !!dest && !!request && handoff.apps && handoff.apps.length > 0;

  return (
    <>
      <PrimaryButton
        label={label}
        accessibilityLabel={accessibilityLabel}
        onPress={() => go(dest)}
        onLongPress={onLongPress}
        disabled={disabled || !request}
      />
      {showDest && (
        <View style={styles.destRow}>
          <Text style={styles.destText} numberOfLines={1}>
            {opts?.bare || dest!.blocked
              ? `Opens ${dest!.label} — ${handoffVerb(opts)}`
              : `Opens ${dest!.label}`}
          </Text>
          {handoff.canChoose && (
            <TouchableOpacity onPress={() => onPickerOpenChange(true)} hitSlop={12} accessibilityRole="button">
              <Text style={styles.destChange}>Change</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      <SheetModal visible={pickerOpen} onClose={() => onPickerOpenChange(false)} title="Choose a UPI app">
        <UpiAppGrid apps={handoff.apps ?? []} opts={opts} onSelect={go} />
      </SheetModal>
    </>
  );
}

const styles = StyleSheet.create({
  destRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, marginTop: space.sm, minHeight: 24 },
  destText: { ...type.caption, color: colors.textSecondary, flexShrink: 1 },
  destChange: { ...type.caption, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
});
