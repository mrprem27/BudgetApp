import { getMoneyProfile, setMoneyProfile } from '../db/queries/moneyProfile';

// `setMoneyProfile` touches only three db methods, so a KV fake exercises the real logic
// without expo-sqlite. What is being pinned is which *timestamp* a write is allowed to move.

function fakeDb(seed: Record<string, string> = {}) {
  const store = { ...seed };
  const db = {
    store,
    getAllAsync: async (_sql: string, keys: string[]) =>
      keys.filter(k => k in store).map(k => ({ key: k, value: store[k] })),
    runAsync: async (_sql: string, [key, value]: [string, string]) => { store[key] = value; },
    withTransactionAsync: async (fn: () => Promise<void>) => { await fn(); },
  };
  return db as typeof db & Parameters<typeof setMoneyProfile>[0];
}

describe('money profile timestamps', () => {
  it('does not move the card baseline when only investments change', async () => {
    // The bug: one shared stamp served both "how stale are these figures" and "from when do
    // we count card spend". Opening the Plan editor to update investments re-based the card
    // window, so every card transaction since fell below it and `creditUsed` collapsed back
    // to the stored figure — net worth jumping overnight with nothing to explain it.
    const db = fakeDb();
    await setMoneyProfile(db, { creditUsed: 20_000, investments: 100 });
    const first = await getMoneyProfile(db);
    expect(first.cardBaselineAt).not.toBeNull();

    // Simulate time passing, then an unrelated edit.
    db.store['money.updated_at'] = String(Number(db.store['money.updated_at']) - 60_000);
    db.store['money.card_baseline_at'] = String(Number(db.store['money.card_baseline_at']) - 60_000);
    const before = await getMoneyProfile(db);

    await setMoneyProfile(db, { investments: 500 });
    const after = await getMoneyProfile(db);

    expect(after.cardBaselineAt).toBe(before.cardBaselineAt);   // the money-critical one
    expect(after.updatedAt!).toBeGreaterThan(before.updatedAt!); // the display one still moves
  });

  it('moves the card baseline when the card balance is restated', async () => {
    const db = fakeDb();
    await setMoneyProfile(db, { creditUsed: 20_000 });
    db.store['money.card_baseline_at'] = String(Number(db.store['money.card_baseline_at']) - 60_000);
    const before = await getMoneyProfile(db);

    await setMoneyProfile(db, { creditUsed: 35_000 });
    const after = await getMoneyProfile(db);

    expect(after.cardBaselineAt!).toBeGreaterThan(before.cardBaselineAt!);
  });

  it('reads a pre-split profile without a migration', async () => {
    // Older installs only have `money.updated_at`, where it meant both things. Falling back
    // to it reproduces the old behaviour exactly, so nothing has to be rewritten on upgrade.
    const db = fakeDb({ 'money.updated_at': '1234', 'money.credit_used': '900' });
    const p = await getMoneyProfile(db);
    expect(p.cardBaselineAt).toBe(1234);
    expect(p.updatedAt).toBe(1234);
    expect(p.creditUsed).toBe(900);
  });

  it('writes nothing at all for an empty patch', async () => {
    const db = fakeDb();
    await setMoneyProfile(db, {});
    expect(Object.keys(db.store)).toHaveLength(0);
  });
});
