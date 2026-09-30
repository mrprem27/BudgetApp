import { getMoneyProfile, setMoneyProfile } from '../db/queries/moneyProfile';
import { openingTotal } from '../lib/cash';
import { applyLaunchInvariants } from '../db/schema';
import { createTestDb, asDb, type TestDb } from './helpers/testDb';

// `setMoneyProfile` touches only three db methods, so a KV fake exercises the real logic
// without expo-sqlite. What is being pinned is which *timestamp* a write is allowed to move.

function fakeDb(seed: Record<string, string> = {}, assetsTotal = 0) {
  const store = { ...seed };
  const db = {
    store,
    getAllAsync: async (_sql: string, keys: string[]) =>
      keys.filter(k => k in store).map(k => ({ key: k, value: store[k] })),
    // `getMoneyProfile` derives `investments` from the asset register now
    // (`getAssetsTotal`), so the stub has to answer that one aggregate too.
    getFirstAsync: async (_sql: string) => ({ total: assetsTotal }),
    runAsync: async (_sql: string, [key, value]: [string, string]) => { store[key] = value; },
    withTransactionAsync: async (fn: () => Promise<void>) => { await fn(); },
  };
  return db as typeof db & Parameters<typeof setMoneyProfile>[0];
}

describe('money profile timestamps', () => {
  it('does not move the card baseline when an unrelated figure changes', async () => {
    // The bug: one shared stamp served both "how stale are these figures" and "from when do
    // we count card spend". Opening the Plan editor to update another figure re-based the card
    // window, so every card transaction since fell below it and `creditUsed` collapsed back
    // to the stored figure — net worth jumping overnight with nothing to explain it.
    //
    // The unrelated edit used to be `investments`; that is derived from the asset
    // register now and is no longer writable here, so `openingBank` plays the part.
    // The property under test is unchanged: only a write that INCLUDES creditUsed
    // may move the baseline.
    const db = fakeDb();
    await setMoneyProfile(db, { creditUsed: 20_000, openingBank: 100 });
    const first = await getMoneyProfile(db);
    expect(first.cardBaselineAt).not.toBeNull();

    // Simulate time passing, then an unrelated edit.
    db.store['money.updated_at'] = String(Number(db.store['money.updated_at']) - 60_000);
    db.store['money.card_baseline_at'] = String(Number(db.store['money.card_baseline_at']) - 60_000);
    const before = await getMoneyProfile(db);

    await setMoneyProfile(db, { openingBank: 500 });
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

/**
 * `U-68`: the openings, card limit and due day moved from `money.*` keys onto the default
 * accounts. The property that makes it safe is the one the bucket split had: the totals every
 * consumer reads (Safe to Spend, the raid, afford, the health score) do not move.
 */
describe('openings move onto accounts', () => {
  const launch = (db: TestDb) => applyLaunchInvariants(async sql => { db.raw.exec(sql); });
  const key = (db: TestDb, k: string, v: string) => db.raw.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(k, v);
  const account = (db: TestDb, id: string) =>
    db.raw.prepare('SELECT opening_balance, credit_limit, due_day FROM account WHERE id = ?').get(id);

  it('reads a pre-bucket profile as bank, with the total unchanged', async () => {
    // Exactly what a device written before buckets holds: one key. Bank, not cash-in-hand:
    // the old editor labelled that field "bank + wallet".
    const db = createTestDb();
    await launch(db);
    key(db, 'money.opening_cash', '5000000');
    await launch(db);
    const p = await getMoneyProfile(asDb(db));
    expect([p.openingBank, p.openingCash]).toEqual([5000000, 0]);
    expect(openingTotal(p)).toBe(5000000);
  });

  it('moves each bucket, the card limit and due day to its account, once', async () => {
    const db = createTestDb();
    await launch(db);
    key(db, 'money.opening_bank', '100000');
    key(db, 'money.opening_cash', '200000');
    key(db, 'money.opening_wallet', '300000');
    key(db, 'money.credit_limit', '5000000');
    key(db, 'money.card_due_day', '20');
    await launch(db);
    await launch(db);   // a second launch must not add them again

    const p = await getMoneyProfile(asDb(db));
    expect([p.openingBank, p.openingCash, p.openingWallet, p.creditLimit, p.cardDueDay])
      .toEqual([100000, 200000, 300000, 5000000, 20]);
    expect(account(db, 'default:card')).toEqual({ opening_balance: 0, credit_limit: 5000000, due_day: 20 });
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM settings WHERE key LIKE 'money.opening%'").get()).toEqual({ n: 0 });
    // Queued, so a signed-in phone sends them.
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM sync_queue WHERE local_table = 'account'").get()).toEqual({ n: 4 });
  });

  it('writes a total so it reads back as written, beside a second bank', async () => {
    const db = createTestDb();
    await launch(db);
    db.raw.prepare(
      "INSERT INTO account (id, name, kind, opening_balance, created_at, updated_at) VALUES ('hdfc', 'HDFC', 'bank', 40000, 1, 1)",
    ).run();
    await setMoneyProfile(asDb(db), { openingBank: 100000 });
    expect((await getMoneyProfile(asDb(db))).openingBank).toBe(100000);
    expect(account(db, 'default:bank')).toMatchObject({ opening_balance: 60000 });
  });
});
