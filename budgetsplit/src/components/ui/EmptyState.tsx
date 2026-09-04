import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../tokens';
import { PrimaryButton } from './PrimaryButton';
import { IconCircle } from './IconCircle';

type Props = {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body?: string;
  /** Optional CTA. */
  actionLabel?: string;
  onAction?: () => void;
  /** Tint for the icon + its circle (defaults to accent). */
  tint?: string;
  /**
   * Centre in the space left over, instead of sitting at the top of it.
   *
   * **Opt-in, and it has to be** — see the note on `styles.fill`. Set it only when
   * this state OWNS the screen: nothing above it but chrome, nothing below it at
   * all. If there is real content on either side, leave it off; there is nothing
   * to centre within and the block just drifts away from what it belongs to.
   */
  fill?: boolean;
  /**
   * Replaces the icon circle — a number, an illustration, anything.
   *
   * Home's empty hero was hand-rolled largely for this: it shows a "₹0" in the
   * money face rather than a glyph, which says more than any icon could about a
   * ledger with nothing in it. That was worth keeping, and worth not forking a
   * second component to keep.
   */
  art?: React.ReactNode;
};

/**
 * The one empty-state layout used everywhere: icon circle → title → body →
 * optional primary action. Per AGENTS.md §2, never render a bare "nothing here".
 *
 * ## Where it sits — the half of the rule that was missing
 *
 * §2 specified the anatomy and said nothing about position, so position drifted:
 * the same state sat 48pt down one tab of Personal and 64pt down the next,
 * because one list used `paddingHorizontal` and the other `padding`. Switching
 * tabs moved the illustration, which is what Walk 1 opened with.
 *
 * The anatomy is fixed here; the anchor is `fill`, and it is deliberately opt-in
 * rather than the default — see `styles.fill`.
 */
export function EmptyState({
  icon, title, body, actionLabel, onAction, tint = colors.accent, fill, art,
}: Props) {
  return (
    <View style={[styles.wrap, fill && styles.fill]}>
      {art ?? <IconCircle icon={icon} size={64} color={tint} iconSize={26} style={styles.icon} />}
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <PrimaryButton label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: space.xxl, paddingHorizontal: space.xl, gap: space.sm },
  /*
   * ⚠️ NEVER make this the default.
   *
   * `flex: 1` resolves against an auto-height parent as **zero**, and roughly
   * thirty of this component's call sites are inside a `ScrollView` content
   * container or a `ListEmptyComponent` — both auto-height. Putting this on
   * `wrap` unconditionally collapses every one of them to nothing, silently, and
   * `ErrorState` wraps this component too, so the blast radius is ~71 places with
   * no render test anywhere to catch it.
   *
   * It is correct only where the parent is already `flex: 1` and this is its only
   * child. That is seven screens, and they pass `fill` explicitly.
   */
  fill: { flex: 1, justifyContent: 'center' },
  // Only `marginBottom` does anything here: `IconCircle` already sets the size and
  // the circle. The rest is a leftover of the shape it replaced.
  icon: { marginBottom: space.xs },
  title: { ...type.subheading, color: colors.textPrimary, textAlign: 'center' },
  body: { ...type.body, color: colors.textSecondary, textAlign: 'center', maxWidth: 320, lineHeight: 22 },
  action: { alignSelf: 'stretch', marginTop: space.md, paddingHorizontal: space.lg, borderRadius: radius.md },
});
