/**
 * How your money adds up, as lines you could check by hand — one structure for Money's card
 * and for the editor behind it, so the two can never show different arithmetic:
 *
 *     Bank + Cash + Wallet (+ Paid from not set) − In goals = Spendable
 *     + Invested − Card owed = Net worth
 *
 * "In goals" is money set aside for goals: it is held back from Spendable, so without its own
 * line the places did not add up to the total under them.
 */
export type MoneyPlace = 'bank' | 'cash' | 'wallet';

export type MoneySumLine = {
  key: MoneyPlace | 'unattributed' | 'goals' | 'spendable' | 'invested' | 'card' | 'networth';
  op: '' | '+' | '−' | '=';
  value: number;
  total?: boolean;
};

export function moneySumLines(m: {
  places: Record<MoneyPlace, number>;
  unattributed?: number;
  inGoals?: number;
  investments: number;
  creditUsed: number;
}): { lines: MoneySumLine[]; spendable: number; netWorth: number } {
  const unattributed = m.unattributed ?? 0;
  const inGoals = Math.max(0, m.inGoals ?? 0);
  // Largest first, so the lines and Money's bar agree on order.
  const places = (Object.keys(m.places) as MoneyPlace[])
    .map(k => ({ key: k, value: m.places[k] }))
    .sort((a, b) => b.value - a.value);
  const spendable = places.reduce((a, p) => a + p.value, 0) + unattributed - inGoals;
  const netWorth = spendable + m.investments - m.creditUsed;

  const lines: MoneySumLine[] = places.map((p, i) => ({ key: p.key, op: i === 0 ? '' : '+', value: p.value }));
  if (unattributed) lines.push({ key: 'unattributed', op: '+', value: unattributed });
  if (inGoals > 0) lines.push({ key: 'goals', op: '−', value: inGoals });
  lines.push({ key: 'spendable', op: '=', value: spendable, total: true });
  lines.push({ key: 'invested', op: '+', value: m.investments });
  if (m.creditUsed > 0) lines.push({ key: 'card', op: '−', value: m.creditUsed });
  lines.push({ key: 'networth', op: '=', value: netWorth, total: true });
  return { lines, spendable, netWorth };
}

/**
 * The starting balance to store so a place reads `typed` now. A place's balance is its starting
 * figure plus its own movement since; the editor asks for what is there today, which is the
 * figure you can read off your bank app, and works the starting one out.
 */
export function openingFor(typed: number, current: number, opening: number): number {
  return typed - (current - opening);
}

/**
 * Is this move the WHOLE "Paid from not set" amount going to one place, in the direction that
 * clears it? Then it is written on the entries themselves, not as a move beside them (`U-99`):
 * out of Not set when the line is positive, into it when it is spending with no source.
 */
export function movesWholeUnset(
  from: { kind: string }, to: { kind: string }, amountPaise: number, unattributed: number,
): boolean {
  const place = from.kind === 'unset' ? to : to.kind === 'unset' ? from : null;
  return place?.kind === 'bucket' && unattributed !== 0
    && amountPaise === Math.abs(unattributed) && (from.kind === 'unset') === (unattributed > 0);
}
