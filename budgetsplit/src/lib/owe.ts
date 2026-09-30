import { colors } from '../theme';

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

/**
 * Who pays whom when settling with one person, from the balance between you.
 *
 * `net > 0` — they owe you, so *they* pay and the money comes to you. Otherwise you pay
 * them: you owe them, or you are already square and there is nothing to infer, in which
 * case the default of "I pay" stands. Same sign convention as {@link oweView}.
 */
export function settleDirection(net: number): 'they-pay' | 'i-pay' {
  return net > 0 ? 'they-pay' : 'i-pay';
}

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

/**
 * A payment between two people as a sentence, worded from the viewer's side: "You owe Aarav",
 * "Aarav owes you", "Aarav owes Riya". The counterparty comes FIRST when it is the long part, so a
 * long name is never the piece an ellipsis cuts off — which is what hid who you owed.
 */
export function paymentSentence(
  from: { name: string; is_me?: number | boolean },
  to: { name: string; is_me?: number | boolean },
): { lead: string; name: string; tail: string } {
  if (from.is_me) return { lead: 'You owe ', name: to.name, tail: '' };
  if (to.is_me) return { lead: '', name: from.name, tail: ' owes you' };
  return { lead: '', name: from.name, tail: ` owes ${to.name}` };
}

/**
 * The balance a group header states for the viewer: who owes whom in one line, coloured by direction.
 * "Settled up" when square — absence alone is not feedback (AGENTS §2).
 */
export function headerBalance(myNet: number): { direction: 'owe' | 'owed' | 'settled'; headline: string; amount: number } {
  const ov = oweView(myNet);
  if (ov.direction === 'settled') return { direction: 'settled', headline: 'Settled up', amount: 0 };
  return {
    direction: ov.direction,
    headline: ov.direction === 'owe' ? 'You owe' : "You're owed",
    amount: ov.amount,
  };
}

/**
 * A ledger of people (`U-13`): open balances first — who owes you, largest first, then whom you
 * owe, largest first — and everyone square after, in the order given.
 */
export function ledgerOrder<T>(people: T[], netOf: (p: T) => number): { open: T[]; square: T[] } {
  const open = people.filter(p => netOf(p) !== 0).sort((a, b) => {
    const x = netOf(a), y = netOf(b);
    if ((x > 0) !== (y > 0)) return x > 0 ? -1 : 1;
    return Math.abs(y) - Math.abs(x);
  });
  return { open, square: people.filter(p => netOf(p) === 0) };
}
