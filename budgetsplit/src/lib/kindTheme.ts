import { colors } from '../theme';
import type { AddKind, TxnKind } from '../constants/enums';

/**
 * The one colour per kind, everywhere a kind is shown (`U-51`): expense red, income green,
 * transfer purple. A stored row's kind is `TxnKind` (a transfer or an investment is a
 * `settlement`); the Add screen's is `AddKind`. Both read from here, so a filter chip, a
 * detail badge and the Add form can never disagree about what colour "expense" is.
 */
export function kindColor(kind: TxnKind | AddKind): string {
  const k: string = kind;
  if (k === 'income') return colors.income;
  if (k === 'settlement' || k === 'transfer' || k === 'invest') return colors.settle;
  return colors.expense;
}

/**
 * The colour that stands for a transaction kind on the Add screen.
 *
 * This exists so the *whole* Add screen can agree with itself: derive it once per render
 * and thread it through the icons, chips, chevrons and the save button. It is `kindColor` —
 * expense was teal here while every ledger drew spending red, one kind in two colours
 * (`U-51`). Invest shares `settle` with Transfer on purpose: they are the same movement in
 * the ledger (a settlement), told apart only by where the money went.
 */
export function kindAccent(kind: AddKind): string {
  return kindColor(kind);
}

/**
 * Gradient for the kind's primary button. A two-stop ramp from the kind colour to
 * a slightly deeper mix, matching the shape of `gradients.accent`.
 */
export function kindGradient(kind: AddKind): readonly [string, string] {
  switch (kind) {
    case 'income':   return [colors.income, colors.healthGreen];
    case 'transfer':
    case 'invest':   return [colors.settle, colors.settle];
    default:         return [colors.expense, colors.healthRed];
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
    case 'transfer':
    case 'invest':   return colors.settle;
    default:         return colors.textPrimary;
  }
}
