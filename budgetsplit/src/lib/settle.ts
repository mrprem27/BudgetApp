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
