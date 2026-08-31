export type Settlement = {
  from: string;
  to: string;
  amount: number;
};

export function simplify(net: Record<string, number>): Settlement[] {
  const creditors = Object.entries(net)
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, amt: v }))
    .sort((a, b) => b.amt - a.amt);

  const debtors = Object.entries(net)
    .filter(([, v]) => v < 0)
    .map(([id, v]) => ({ id, amt: -v }))
    .sort((a, b) => b.amt - a.amt);

  const result: Settlement[] = [];
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    if (pay > 0) {
      result.push({ from: debtors[i].id, to: creditors[j].id, amount: pay });
    }
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt === 0) i++;
    if (creditors[j].amt === 0) j++;
  }

  return result;
}

/**
 * Raw pairwise debts — who owes whom directly, WITHOUT global minimization.
 * Used when a group's "Simplify debts" toggle is off.
 *
 * ## One transaction at a time, from each person's net position in it
 *
 * Within a single transaction, what somebody owes is exactly what they consumed
 * minus what they fronted. Matching the negatives against the positives *inside
 * that transaction* is therefore the whole answer, and it is `simplify` scoped to
 * one row rather than to the group — which is precisely what "raw" means here:
 * debts arise from the bills they arose from, and are not routed across the
 * group's other business.
 *
 * ## What this replaces, and why it had to
 *
 * It used to allocate every share across every payer proportionally, carrying a
 * fractional remainder between shares. The share-holder's own slice was then
 * discarded — correctly, you do not owe yourself — but only AFTER the carry had
 * already been mutated for it. That fraction then belonged to nobody: it rolled
 * into the next share, could drive a carry negative, and a negative carry makes
 * `Math.floor` return **−1**, which the remainder loop then over-corrected.
 *
 * The visible result was debts invented out of nothing. Three people who each
 * paid one paise and each owed one paise — everybody exactly square, every net
 * zero — produced two pairwise debts, so the group could never reach "settled
 * up" with Simplify turned off. The amounts at risk were sub-paise; the state was
 * unreachable, which is worse, because it is the one the user is trying to get to.
 *
 * Settlements need no special case: a payer is positive and a receiver negative,
 * so a settlement cancels the debt it repays by arithmetic rather than by rule.
 */
export function rawDebts(
  txns: Array<{
    kind?: string;
    payments: Array<{ personId: string; amount: number }>;
    shares:   Array<{ personId: string; amount: number }>;
  }>,
): Settlement[] {
  const pair: Record<string, number> = {}; // `${debtor}->${creditor}` => paise
  for (const t of txns) {
    if (t.kind === 'income') continue;

    // Each person's position in THIS transaction: fronted minus consumed.
    // Integer paise throughout, so there is nothing to round and nothing to
    // carry — the arithmetic that produced phantom debts is simply gone.
    const net: Record<string, number> = {};
    for (const p of t.payments) net[p.personId] = (net[p.personId] ?? 0) + p.amount;
    for (const s of t.shares) net[s.personId] = (net[s.personId] ?? 0) - s.amount;

    // Scoped to the row, which is what makes these raw: `simplify` over the whole
    // group is the other toggle.
    for (const d of simplify(net)) {
      const key = `${d.from}->${d.to}`;
      pair[key] = (pair[key] ?? 0) + d.amount;
    }
  }

  // Net out reverse pairs so we never show both A→B and B→A.
  const seen = new Set<string>();
  const result: Settlement[] = [];
  for (const key of Object.keys(pair)) {
    if (seen.has(key)) continue;
    const [from, to] = key.split('->');
    const rev = `${to}->${from}`;
    seen.add(key); seen.add(rev);
    const net = (pair[key] ?? 0) - (pair[rev] ?? 0);
    if (net > 0) result.push({ from, to, amount: net });
    else if (net < 0) result.push({ from: to, to: from, amount: -net });
  }
  return result.sort((a, b) => b.amount - a.amount);
}

