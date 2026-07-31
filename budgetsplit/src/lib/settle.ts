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
 *
 * Slices are allocated so that each share is fully spent AND each payer is
 * credited exactly what they fronted (see the carry below). Rounding each slice
 * independently used to leave a person's net a paise away from the ledger's,
 * which showed as the same group reporting different figures either side of the
 * "Simplify debts" toggle.
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
    // Allocate every share across the payers with a carried remainder, so BOTH
    // margins come out exact: each share is fully allocated, AND each payer is
    // credited exactly what they fronted. Rounding each slice on its own gets
    // the first right and the second wrong — the leftover paise always landed on
    // the same (first) payer, so their net drifted away from the ledger.
    const carry = t.payments.map(() => 0);
    for (const s of t.shares) {
      if (s.amount <= 0) continue;

      const slices = t.payments.map((p, idx) => {
        const want = (s.amount * p.amount) / totalPaid + carry[idx];
        const base = Math.floor(want);
        carry[idx] = want - base; // fraction owed forward to the next share
        return base;
      });

      // Hand the rounding remainder to whoever is furthest along fractionally.
      let remainder = s.amount - slices.reduce((a, b) => a + b, 0);
      while (remainder > 0) {
        let best = 0;
        for (let i = 1; i < carry.length; i++) if (carry[i] > carry[best]) best = i;
        slices[best]++;
        carry[best] -= 1;
        remainder--;
      }

      t.payments.forEach((p, idx) => {
        if (p.personId === s.personId) return; // you don't owe yourself
        const owe = slices[idx];
        if (owe <= 0) return;
        const key = `${s.personId}->${p.personId}`;
        pair[key] = (pair[key] ?? 0) + owe;
      });
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

