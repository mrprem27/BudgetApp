import { colors } from '../constants/colors';

/**
 * The single, canonical interpretation of an Owe/Owed balance for the whole app.
 * Every screen that shows "you owe" / "owes you" / "settled" must derive its
 * wording, color and sign from {@link oweView} so they can never drift apart.
 *
 * Sign convention (matches {@link BalanceChip} and getMyExposure's perPerson):
 *   net > 0 = owed to me   (green / income, "+")
 *   net < 0 = I owe        (coral / expense, "−")
 *   net = 0 = settled up   (muted, no sign)
 */
export type OweDirection = 'owe' | 'owed' | 'settled';

export type OweView = {
  direction: OweDirection;
  /** Always positive paise; 0 when settled. */
  amount: number;
  /** colors.expense (owe) | colors.income (owed) | colors.textMuted (settled). */
  color: string;
  /** Prefix for the amount: '−' when I owe, '+' when owed to me, '' when settled. */
  sign: '+' | '−' | '';
  /** First-person label, e.g. for a "me vs other" row: "You owe" | "Owes you" | "Settled up". */
  label: string;
  /** First-person label with the other person's name woven in. */
  withName: (name: string) => string;
  /** Third-person label for a roster row about one person: "Owes" | "Owed" | "Settled". */
  thirdPerson: string;
};

export function oweView(net: number): OweView {
  if (net < 0) {
    return {
      direction: 'owe',
      amount: -net,
      color: colors.expense,
      sign: '−',
      label: 'You owe',
      withName: (name) => `You owe ${name}`,
      thirdPerson: 'Owes',
    };
  }
  if (net > 0) {
    return {
      direction: 'owed',
      amount: net,
      color: colors.income,
      sign: '+',
      label: 'Owes you',
      withName: (name) => `${name} owes you`,
      thirdPerson: 'Owed',
    };
  }
  return {
    direction: 'settled',
    amount: 0,
    color: colors.textMuted,
    sign: '',
    label: 'Settled up',
    withName: () => 'Settled up',
    thirdPerson: 'Settled',
  };
}
