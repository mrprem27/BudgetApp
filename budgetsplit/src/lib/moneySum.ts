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

type Place = { kind: 'bucket'; bucket: 'bank' | 'cash' | 'wallet' } | { kind: 'asset'; id: string } | { kind: 'unset' };

/**
 * What Move money opens on. Ordinarily bank → your first asset (the common "I bought an
 * investment" case), or bank → cash with no assets. From the "Paid from not set" line it opens
 * on that money (`U-99`): out of Not set when the line holds money, into it from the bank when
 * it is spending with no source, with the whole amount filled in and yours to lower.
 */
export function moveMoneySeed(
  fromUnsetLine: boolean, unattributed: number, firstAssetId: string | undefined, toInput: (paise: number) => string,
): { from: Place; to: Place; amount: string } {
  const bank: Place = { kind: 'bucket', bucket: 'bank' };
  if (!fromUnsetLine) {
    return { from: bank, to: firstAssetId ? { kind: 'asset', id: firstAssetId } : { kind: 'bucket', bucket: 'cash' }, amount: '' };
  }
  const unset: Place = { kind: 'unset' };
  const amount = unattributed !== 0 ? toInput(Math.abs(unattributed)) : '';
  return unattributed >= 0 ? { from: unset, to: bank, amount } : { from: bank, to: unset, amount };
}
