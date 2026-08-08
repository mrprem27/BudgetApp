import { colors } from '../theme';
import type { AddKind } from '../constants/enums';

/**
 * The colour that stands for a transaction kind.
 *
 * This exists so the *whole* Add screen can agree with itself. The palette
 * already assigns a colour per kind (AGENTS.md §10: `income` green, `settle`
 * purple, `accent` teal for ordinary spending), but only two things on the Add
 * screen ever consulted it — the kind toggle and the amount text. Every other
 * control stayed teal, so switching to Income produced a green amount sitting in
 * a teal form. Derive this once per render and thread it through the icons,
 * chips, chevrons and the save button.
 */
export function kindAccent(kind: AddKind): string {
  switch (kind) {
    case 'income':   return colors.income;
    case 'transfer': return colors.settle;
    default:         return colors.accent;
  }
}

/**
 * Gradient for the kind's primary button. A two-stop ramp from the kind colour to
 * a slightly deeper mix, matching the shape of `gradients.accent`.
 */
export function kindGradient(kind: AddKind): readonly [string, string] {
  switch (kind) {
    case 'income':   return [colors.income, colors.healthGreen];
    case 'transfer': return [colors.settle, colors.settle];
    default:         return [colors.accent, colors.accentDeep];
  }
}

/**
 * Colour for the amount text. Ordinary spending stays `textPrimary` rather than
 * teal — the amount is the screen's hero, and tinting it would make an expense
 * look like a status rather than a figure. Income and settlements do get their
 * colour, because there the sign is the meaning.
 */
export function kindAmountColor(kind: AddKind): string {
  switch (kind) {
    case 'income':   return colors.income;
    case 'transfer': return colors.settle;
    default:         return colors.textPrimary;
  }
}
