import { simplify, rawDebts } from '../lib/settle';

const txn = (payments: [string, number][], shares: [string, number][], kind = 'expense') => ({
  kind,
  payments: payments.map(([personId, amount]) => ({ personId, amount })),
  shares: shares.map(([personId, amount]) => ({ personId, amount })),
});

describe('simplify', () => {
  it('produces the minimum payment from debtor to creditor', () => {
    const r = simplify({ a: 50000, b: -50000 });
    expect(r).toEqual([{ from: 'b', to: 'a', amount: 50000 }]);
  });
  it('returns nothing when everyone is settled', () => {
    expect(simplify({ a: 0, b: 0 })).toEqual([]);
  });
  it('every payment balances out the nets', () => {
    const r = simplify({ a: 30000, b: 20000, c: -50000 });
    const paid = r.reduce((s, x) => s + x.amount, 0);
    expect(paid).toBe(50000);
  });
});

describe('rawDebts', () => {
  it('shows the direct debt from a single split expense', () => {
    const r = rawDebts([txn([['a', 1000]], [['a', 500], ['b', 500]])]);
    expect(r).toEqual([{ from: 'b', to: 'a', amount: 500 }]);
  });
  it('ignores income', () => {
    expect(rawDebts([txn([['a', 1000]], [], 'income')])).toEqual([]);
  });

  /**
   * The two views are alternatives for the same group and are never summed
   * together. Their TOTALS legitimately differ — `simplify` cancels chains
   * (a→b→c collapses to a→c) while `rawDebts` shows the direct debts — so the
   * invariant that must hold is per-person NET, not the sum of transfers.
   *
   * That is what breaks when a share is allocated across payers with an
   * independent `Math.round` per payer: the slices stop summing to the share,
   * and a person's net drifts by a paise between the two toggle states.
   */
  describe('per-person net agrees with simplify', () => {
    /** Net position per person: what they paid minus what they consumed. */
    const netOf = (txns: ReturnType<typeof txn>[]) => {
      const net: Record<string, number> = {};
      for (const t of txns) {
        if (t.kind === 'income') continue;
        for (const p of t.payments) net[p.personId] = (net[p.personId] ?? 0) + p.amount;
        for (const s of t.shares)   net[s.personId] = (net[s.personId] ?? 0) - s.amount;
      }
      return net;
    };
    /** Net implied by a set of transfers: received minus paid. */
    const netOfTransfers = (rows: { from: string; to: string; amount: number }[]) => {
      const net: Record<string, number> = {};
      for (const r of rows) {
        net[r.to]   = (net[r.to]   ?? 0) + r.amount;
        net[r.from] = (net[r.from] ?? 0) - r.amount;
      }
      return net;
    };
    const dropZeros = (n: Record<string, number>) =>
      Object.fromEntries(Object.entries(n).filter(([, v]) => v !== 0));

    it('matches on a multi-payer split that does not divide evenly', () => {
      // 1000 fronted 600/400, split three ways: 333/333/334.
      const t = txn([['a', 600], ['b', 400]], [['a', 333], ['b', 333], ['c', 334]]);
      const expected = dropZeros(netOf([t]));
      expect(dropZeros(netOfTransfers(rawDebts([t])))).toEqual(expected);
      expect(dropZeros(netOfTransfers(simplify(netOf([t]))))).toEqual(expected);
    });

    it('matches across several awkward multi-payer transactions', () => {
      const txns = [
        txn([['a', 3337], ['b', 1663]], [['a', 1667], ['b', 1667], ['c', 1666]]),
        txn([['c', 999]], [['a', 333], ['b', 333], ['c', 333]]),
        txn([['b', 7]], [['a', 3], ['b', 2], ['c', 2]]),
      ];
      const expected = dropZeros(netOf(txns));
      expect(dropZeros(netOfTransfers(rawDebts(txns)))).toEqual(expected);
      expect(dropZeros(netOfTransfers(simplify(netOf(txns))))).toEqual(expected);
    });

    it('allocates a share across payers without losing or inventing paise', () => {
      // Every paise of c's share must be owed to someone.
      const r = rawDebts([txn([['a', 600], ['b', 400]], [['c', 1000]])]);
      expect(r.reduce((s, x) => s + x.amount, 0)).toBe(1000);
      expect(r.every(x => x.from === 'c')).toBe(true);
    });

    it('never has a payer owe themselves for the part they fronted', () => {
      const r = rawDebts([txn([['a', 1000]], [['a', 1000]])]);
      expect(r).toEqual([]);
    });

    it('holds for randomised multi-payer groups', () => {
      // Deterministic PRNG so a failure is reproducible.
      let seed = 12345;
      const rnd = (n: number) => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed % n;
      };
      const people = ['a', 'b', 'c', 'd'];

      for (let iter = 0; iter < 200; iter++) {
        const txns = [];
        for (let k = 0; k < 1 + rnd(3); k++) {
          const total = 1 + rnd(100000);
          // Random payer split of `total`, then a random share split of `total`.
          const split = (n: number) => {
            const parts: number[] = [];
            let left = total;
            for (let i = 0; i < n - 1; i++) { const v = rnd(left + 1); parts.push(v); left -= v; }
            parts.push(left);
            return parts;
          };
          const payAmts = split(1 + rnd(3));
          const shareAmts = split(1 + rnd(4));
          txns.push(txn(
            payAmts.map((amt, i) => [people[i], amt] as [string, number]).filter(([, v]) => v > 0),
            shareAmts.map((amt, i) => [people[i], amt] as [string, number]).filter(([, v]) => v > 0),
          ));
        }
        expect(dropZeros(netOfTransfers(rawDebts(txns)))).toEqual(dropZeros(netOf(txns)));
      }
    });
  });
});
