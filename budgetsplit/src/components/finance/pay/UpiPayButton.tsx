import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { Collapse } from '../../ui/anim/Collapse';
import { UpiAppGrid } from './UpiAppGrid';
import { UpiAppIcon } from './UpiAppIcon';
import { handoffVerb, type UpiHandoff, type PayHooks, type PayOpts } from '../../../hooks/useUpiHandoff';
import { colors, type, space, radius, layout } from '../../tokens';
import type { UpiRequest, UpiAppSpec } from '../../../lib/upiIntent';

/**
 * The one control for handing a payment to a UPI app: which app it'll open, a way to
 * change it, and the button — Scan & Pay and settle-up each hand-rolled this trio, which
 * is exactly the copy this component exists to remove (`AGENTS.md` §9 on hand-rolled
 * pills applies here too — one shape, one implementation).
 *
 * The app choice is an **inline disclosure** above the button, not a separate sheet.
 * It used to be a caption-sized "Change" link opening a `SheetModal`: a small target,
 * easy to miss, and a sheet that had to be swapped against the caller's own sheet
 * (`lib/sheetStage.ts`). Now the row itself — the chosen app's icon and name — is the
 * target, and tapping it reveals every installed app right there. Picking one only
 * *selects* it (and remembers it); paying is still the button's job alone, so a
 * mis-tap in the grid can never send money.
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
  const [expanded, setExpanded] = useState(false);

  async function go() {
    if (!request) return;
    setExpanded(false);
    onDone?.(await handoff.payWith(handoff.target, request, hooks, opts));
  }

  function pick(app: UpiAppSpec) {
    handoff.choose(app);
    setExpanded(false);
  }

  const dest = handoff.target;
  const showDest = !!dest && !!request && !!handoff.apps && handoff.apps.length > 0;
  const hint = dest && (opts?.bare || dest.blocked) ? handoffVerb(opts) : null;

  return (
    <>
      {showDest && (
        <View style={styles.picker}>
          <TouchableOpacity
            style={styles.header}
            onPress={() => setExpanded(e => !e)}
            disabled={!handoff.canChoose}
            accessibilityRole="button"
            accessibilityLabel={`Paying with ${dest!.label}${hint ? `, ${hint}` : ''}${handoff.canChoose ? '. Change app' : ''}`}
            accessibilityState={{ expanded, disabled: !handoff.canChoose }}
          >
            <UpiAppIcon app={dest!} size={32} />
            <View style={styles.headerText}>
              <Text style={styles.caption}>Pay using</Text>
              <Text style={styles.appName} numberOfLines={1}>
                {dest!.label}
                {hint && <Text style={styles.hint}>{` · ${hint}`}</Text>}
              </Text>
            </View>
            {handoff.canChoose && (
              <View style={styles.changePill}>
                <Text style={styles.changeText}>{expanded ? 'Done' : 'Change'}</Text>
                <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.accent} />
              </View>
            )}
          </TouchableOpacity>
          <Collapse visible={expanded && handoff.canChoose}>
            <View style={styles.body}>
              <UpiAppGrid apps={handoff.apps ?? []} opts={opts} selectedKey={dest!.key} onSelect={pick} />
            </View>
          </Collapse>
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
  picker: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.bgInput,
    marginBottom: space.md,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: layout.rowMinHeight,
  },
  headerText: { flex: 1, minWidth: 0 },
  caption: { ...type.caption, color: colors.textMuted },
  appName: { ...type.bodySemi, color: colors.textPrimary },
  hint: { ...type.caption, color: colors.textSecondary },
  changePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.accentMuted,
  },
  changeText: { ...type.captionSemi, color: colors.accent },
  body: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
