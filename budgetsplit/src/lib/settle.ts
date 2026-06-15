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
 * For each expense/settlement txn, every share-holder owes each payer a slice
 * of their share proportional to how much that payer fronted. Settlements use
 * the same formula (payer + / receiver −), so a settlement naturally cancels
 * the matching debt. Reverse pairs (A→B and B→A) are netted at the end.
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
    const totalPaid = t.payments.reduce((a, p) => a + p.amount, 0);
    if (totalPaid <= 0) continue;
    for (const s of t.shares) {
      for (const p of t.payments) {
        if (p.personId === s.personId) continue;
        const owe = Math.round(s.amount * (p.amount / totalPaid));
        if (owe <= 0) continue;
        const key = `${s.personId}->${p.personId}`;
        pair[key] = (pair[key] ?? 0) + owe;
      }
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

export function computeNet(
  txns: Array<{
    payments: Array<{ personId: string; amount: number }>;
    shares:   Array<{ personId: string; amount: number }>;
  }>,
): Record<string, number> {
  const net: Record<string, number> = {};
  for (const txn of txns) {
    for (const p of txn.payments) {
      net[p.personId] = (net[p.personId] ?? 0) + p.amount;
    }
    for (const s of txn.shares) {
      net[s.personId] = (net[s.personId] ?? 0) - s.amount;
    }
  }
  return net;
}
