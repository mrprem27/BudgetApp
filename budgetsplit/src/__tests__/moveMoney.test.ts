import { insertAsset, getAssetById, moveMoney, AssetError } from '../db/queries/assets';
import { getMoneyProfile, setMoneyProfile } from '../db/queries/moneyProfile';
import { getCashPosition } from '../db/queries/savings';
import { getTransactionsInRange } from '../db/queries/transactions';
import { createTestDb, addPerson, addGroup, addMember, asDb } from './helpers/testDb';

/**
 * One way to move money — from bank, cash, wallet or any asset, to any other.
 *
 * Every case must leave net worth exactly where it was, and the two that stay inside
 * "cash" (asset → asset, bucket → bucket) must leave total cash alone too.
 */
const OPENING = 1_000_000; // ₹10,000 in the bank

async function setup() {
  const db = createTestDb();
  const me = addPerson(db, 'Me', true);
  const personal = addGroup(db, 'Personal', true);
  addMember(db, personal, me);
  await setMoneyProfile(asDb(db), { openingBank: OPENING });
  return { db };
}

async function state(db: ReturnType<typeof createTestDb>) {
  const [cash, profile] = await Promise.all([getCashPosition(asDb(db)), getMoneyProfile(asDb(db))]);
  return { cash: cash.available, bank: cash.byBucket?.bank ?? 0, cashBucket: cash.byBucket?.cash ?? 0, worth: cash.available + profile.investments };
}

const bank = { kind: 'bucket', bucket: 'bank' } as const;
const cashB = { kind: 'bucket', bucket: 'cash' } as const;
const asset = (id: string) => ({ kind: 'asset', id }) as const;

describe('moveMoney', () => {
  it('bucket → asset: cash down, asset up, net worth flat', async () => {
    const { db } = await setup();
    const gold = await insertAsset(asDb(db), { name: 'Gold' });
    const before = await state(db);
    await moveMoney(asDb(db), bank, asset(gold.id), 250000);
    const after = await state(db);
    expect(after.cash).toBe(before.cash - 250000);
    expect((await getAssetById(asDb(db), gold.id))!.balance).toBe(250000);
    expect(after.worth).toBe(before.worth);
  });

  it('asset → bucket: asset down, that bucket up, net worth flat', async () => {
    const { db } = await setup();
    const fd = await insertAsset(asDb(db), { name: 'FD', balance: 500000 });
    const before = await state(db);
    await moveMoney(asDb(db), asset(fd.id), cashB, 200000);
    const after = await state(db);
    expect((await getAssetById(asDb(db), fd.id))!.balance).toBe(300000);
    expect(after.cashBucket).toBe(before.cashBucket + 200000);
    expect(after.worth).toBe(before.worth);
  });

  it('asset → asset: A down, B up, cash and net worth untouched, a row on each asset', async () => {
    const { db } = await setup();
    const a = await insertAsset(asDb(db), { name: 'Old FD', balance: 500000 });
    const b = await insertAsset(asDb(db), { name: 'New fund', balance: 100000 });
    const before = await state(db);

    const ids = await moveMoney(asDb(db), asset(a.id), asset(b.id), 300000);

    const after = await state(db);
    expect(ids).toHaveLength(2);
    expect((await getAssetById(asDb(db), a.id))!.balance).toBe(200000);
    expect((await getAssetById(asDb(db), b.id))!.balance).toBe(400000);
    expect(after.cash).toBe(before.cash);
    expect(after.bank).toBe(before.bank);
    expect(after.worth).toBe(before.worth);

    const rows = db.raw.prepare('SELECT asset_id, note FROM txn WHERE kind = ? ORDER BY asset_id').all('settlement') as { asset_id: string; note: string }[];
    expect(rows.find(r => r.asset_id === a.id)?.note).toBe('Moved to New fund');
    expect(rows.find(r => r.asset_id === b.id)?.note).toBe('Moved from Old FD');
  });

  it('bucket → bucket: the buckets move, total cash and net worth do not', async () => {
    const { db } = await setup();
    const before = await state(db);
    await moveMoney(asDb(db), bank, cashB, 300000);
    const after = await state(db);
    expect(after.bank).toBe(before.bank - 300000);
    expect(after.cashBucket).toBe(before.cashBucket + 300000);
    expect(after.cash).toBe(before.cash);
    expect(after.worth).toBe(before.worth);
  });

  /*
   * "Paid from not set" as a place (`U-99`): the line is the movement on entries with no Paid
   * from, so a row with none moves the line and its pair moves the place. Any part of it, either way.
   */
  describe('not set ↔ a place', () => {
    const unset = { kind: 'unset' } as const;
    const lines = async (db: ReturnType<typeof createTestDb>) => {
      const c = await getCashPosition(asDb(db));
      return { notSet: c.unattributed ?? 0, bank: c.byBucket?.bank ?? 0, cashBucket: c.byBucket?.cash ?? 0, total: c.available };
    };
    /** An entry of mine with no Paid from: income raises the line, an expense lowers it. */
    const entry = (db: ReturnType<typeof createTestDb>, kind: 'income' | 'expense', paise: number) => {
      const me = (db.raw.prepare('SELECT id FROM person WHERE is_me = 1').get() as { id: string }).id;
      const g = (db.raw.prepare('SELECT id FROM budget_group WHERE is_personal = 1').get() as { id: string }).id;
      const id = `e-${kind}-${paise}`;
      db.raw.prepare("INSERT INTO txn (id, group_id, kind, entry_mode, date, category, pay_method, is_deleted, created_at, updated_at) VALUES (?, ?, ?, 'quick', ?, 'Other', NULL, 0, ?, ?)").run(id, g, kind, Date.now() - 1000, Date.now(), Date.now());
      db.raw.prepare('INSERT INTO txn_payment (txn_id, person_id, amount) VALUES (?, ?, ?)').run(id, me, paise);
      if (kind === 'expense') db.raw.prepare('INSERT INTO txn_share (txn_id, person_id, amount) VALUES (?, ?, ?)').run(id, me, paise);
    };

    it('part of it moves to cash; the rest stays, and total cash does not change', async () => {
      const { db } = await setup();
      entry(db, 'income', 500000);
      const before = await lines(db);
      expect(before.notSet).toBe(500000);
      await moveMoney(asDb(db), unset, cashB, 200000);
      const after = await lines(db);
      expect(after.notSet).toBe(300000);
      expect(after.cashBucket).toBe(before.cashBucket + 200000);
      expect(after.total).toBe(before.total);
    });

    it('spending with no source is covered from a place, and the line comes back to zero', async () => {
      const { db } = await setup();
      entry(db, 'expense', 400000);
      const before = await lines(db);
      expect(before.notSet).toBe(-400000);
      await moveMoney(asDb(db), bank, unset, 400000);
      const after = await lines(db);
      expect(after.notSet).toBe(0);
      expect(after.bank).toBe(before.bank - 400000);
      expect(after.total).toBe(before.total);
    });

    it('not to or from an asset, and not to itself; a refusal writes nothing', async () => {
      const { db } = await setup();
      const gold = await insertAsset(asDb(db), { name: 'Gold', balance: 1000 });
      await expect(moveMoney(asDb(db), unset, asset(gold.id), 100)).rejects.toMatchObject({ reason: 'unset-asset' });
      await expect(moveMoney(asDb(db), asset(gold.id), unset, 100)).rejects.toMatchObject({ reason: 'unset-asset' });
      await expect(moveMoney(asDb(db), unset, unset, 100)).rejects.toMatchObject({ reason: 'same-place' });
      expect((db.raw.prepare("SELECT COUNT(*) AS n FROM txn WHERE kind = 'settlement'").get() as { n: number }).n).toBe(0);
    });
  });

  it('refuses the same place, a non-positive amount, and overdrawing an asset', async () => {
    const { db } = await setup();
    const a = await insertAsset(asDb(db), { name: 'A', balance: 1000 });
    await expect(moveMoney(asDb(db), bank, bank, 100)).rejects.toMatchObject({ reason: 'same-place' });
    await expect(moveMoney(asDb(db), asset(a.id), asset(a.id), 100)).rejects.toMatchObject({ reason: 'same-place' });
    await expect(moveMoney(asDb(db), bank, cashB, 0)).rejects.toMatchObject({ reason: 'bad-amount' });
    await expect(moveMoney(asDb(db), asset(a.id), cashB, 1001)).rejects.toBeInstanceOf(AssetError);
  });

  it('a refused move writes nothing — no rows, no balance change', async () => {
    const { db } = await setup();
    const a = await insertAsset(asDb(db), { name: 'A', balance: 1000 });
    const b = await insertAsset(asDb(db), { name: 'B', balance: 0 });
    await expect(moveMoney(asDb(db), asset(a.id), asset(b.id), 5000)).rejects.toMatchObject({ reason: 'insufficient' });
    expect((await getAssetById(asDb(db), a.id))!.balance).toBe(1000);
    expect((await getAssetById(asDb(db), b.id))!.balance).toBe(0);
    const n = db.raw.prepare("SELECT COUNT(*) AS n FROM txn WHERE kind = 'settlement'").get() as { n: number };
    expect(n.n).toBe(0);
  });

  it('is not spending: the moved amount never shows in expense analysis', async () => {
    const { db } = await setup();
    const gold = await insertAsset(asDb(db), { name: 'Gold' });
    await moveMoney(asDb(db), bank, asset(gold.id), 250000);
    const rows = await getTransactionsInRange(asDb(db), 0, Date.now() + 86_400_000);
    expect(rows.filter(r => r.kind === 'expense')).toHaveLength(0);
  });
});
