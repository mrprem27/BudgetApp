import {
  insertAsset, getAssets, getAssetsTotal, getAssetById, transferToAsset, transferFromAsset,
  restateAssetBalance, archiveAsset, deleteAsset, updateAsset, setAssetOrder,
  defaultInvestmentAsset, AssetError,
} from '../db/queries/assets';
import { getMoneyProfile } from '../db/queries/moneyProfile';
import { getCashPosition } from '../db/queries/savings';
import { getTransactionsInRange } from '../db/queries/transactions';
import { PayMethod } from '../constants/enums';
import { createTestDb, addPerson, addGroup, addMember, asDb } from './helpers/testDb';

/**
 * The one rule: **a transfer moves money between two things you own, so net worth
 * does not change.** Cash down, asset up — or the reverse.
 *
 * Every way of getting this wrong is silent. Booking it as an expense
 * double-counts (the cash already moved, and the expense counts it again as
 * consumption); moving the cash without the asset drops net worth by the amount
 * invested; counting an asset in two places inflates it.
 */
const OPENING = 1_000_000;   // ₹10,000 in the bank

async function setup() {
  const db = createTestDb();
  const me = addPerson(db, 'Me', true);
  const personal = addGroup(db, 'Personal', true);
  addMember(db, personal, me);
  await db.runAsync("INSERT INTO settings (key, value) VALUES ('money.opening_bank', ?)", [String(OPENING)]);
  return { db, me };
}

/** Cash + assets. The figure that must not move across a transfer. */
async function netWorth(db: ReturnType<typeof createTestDb>) {
  const [cash, profile] = await Promise.all([getCashPosition(asDb(db)), getMoneyProfile(asDb(db))]);
  return cash.available + profile.investments;
}

describe('a transfer into an asset conserves net worth', () => {
  it('takes the cash out and puts the same into the asset', async () => {
    const { db } = await setup();
    const gold = await insertAsset(asDb(db), { name: 'Gold', kind: 'gold' });
    const before = await netWorth(db);

    await transferToAsset(asDb(db), gold.id, 250000);

    expect((await getCashPosition(asDb(db))).available).toBe(OPENING - 250000);
    expect((await getAssetById(asDb(db), gold.id))!.balance).toBe(250000);
    expect(await netWorth(db)).toBe(before);
  });

  it('leaves it out of the bucket it actually came from', async () => {
    const { db } = await setup();
    const gold = await insertAsset(asDb(db), { name: 'Gold' });
    await transferToAsset(asDb(db), gold.id, 250000, PayMethod.Bank);
    const pos = await getCashPosition(asDb(db));
    expect(pos.byBucket?.bank).toBe(OPENING - 250000);
    expect(pos.byBucket?.cash).toBe(0);
  });

  it('records a settlement, so no budget is eaten and no donut moves', async () => {
    // §12: settlements are excluded from every analysis surface. That is the whole
    // reason this is not an expense — an SIP must not consume a Food budget.
    const { db } = await setup();
    const gold = await insertAsset(asDb(db), { name: 'Gold' });
    const id = await transferToAsset(asDb(db), gold.id, 250000);

    const row = await db.getFirstAsync<{ kind: string; asset_id: string }>(
      'SELECT kind, asset_id FROM txn WHERE id = ?', [id],
    );
    expect(row?.kind).toBe('settlement');
    // Traceable back to the asset, which is what lets an asset with history refuse
    // deletion and what its own ledger reads.
    expect(row?.asset_id).toBe(gold.id);
  });

  it('writes both halves or neither', async () => {
    const { db } = await setup();
    const gold = await insertAsset(asDb(db), { name: 'Gold' });

    const real = db.runAsync.bind(db);
    jest.spyOn(db, 'runAsync').mockImplementation(async (sql: string, ...rest: unknown[]) => {
      if (/UPDATE asset SET balance/.test(sql)) throw new Error('killed mid-write');
      return real(sql, ...(rest as never[]));
    });
    await expect(transferToAsset(asDb(db), gold.id, 250000)).rejects.toThrow('killed mid-write');
    jest.restoreAllMocks();

    expect((await getAssetById(asDb(db), gold.id))!.balance).toBe(0);
    expect((await getCashPosition(asDb(db))).available).toBe(OPENING);
    expect(await getTransactionsInRange(asDb(db), null, 0, Date.now() + 1000)).toHaveLength(0);
  });
});

describe('a transfer out of an asset conserves net worth too', () => {
  it('puts the cash back and takes it off the asset', async () => {
    const { db } = await setup();
    const fd = await insertAsset(asDb(db), { name: 'Bank FD', kind: 'deposit', balance: 500000 });
    const before = await netWorth(db);

    await transferFromAsset(asDb(db), fd.id, 200000);

    expect((await getCashPosition(asDb(db))).available).toBe(OPENING + 200000);
    expect((await getAssetById(asDb(db), fd.id))!.balance).toBe(300000);
    expect(await netWorth(db)).toBe(before);
  });

  /**
   * Selling something you own is not earnings. Counting it as income would inflate
   * every income figure and every income-based ratio on the day you sold.
   */
  it('is not income', async () => {
    const { db } = await setup();
    const fd = await insertAsset(asDb(db), { name: 'Bank FD', balance: 500000 });
    const id = await transferFromAsset(asDb(db), fd.id, 200000);
    const row = await db.getFirstAsync<{ kind: string }>('SELECT kind FROM txn WHERE id = ?', [id]);
    expect(row?.kind).toBe('settlement');
    // The inbound shape: a share and no payment, which is what `settledIn` reads.
    expect(await db.getAllAsync('SELECT * FROM txn_payment WHERE txn_id = ?', [id])).toHaveLength(0);
    expect(await db.getAllAsync('SELECT * FROM txn_share WHERE txn_id = ?', [id])).toHaveLength(1);
  });

  it('refuses to overdraw rather than quietly writing a smaller number', async () => {
    const { db } = await setup();
    const fd = await insertAsset(asDb(db), { name: 'Bank FD', balance: 500000 });
    await expect(transferFromAsset(asDb(db), fd.id, 600000)).rejects.toThrow(AssetError);
    // Nothing moved on either side.
    expect((await getAssetById(asDb(db), fd.id))!.balance).toBe(500000);
    expect((await getCashPosition(asDb(db))).available).toBe(OPENING);
  });

  it('round-trips exactly: in, then out, leaves everything where it started', async () => {
    const { db } = await setup();
    const gold = await insertAsset(asDb(db), { name: 'Gold' });
    await transferToAsset(asDb(db), gold.id, 333333);
    await transferFromAsset(asDb(db), gold.id, 333333);
    expect((await getCashPosition(asDb(db))).available).toBe(OPENING);
    expect((await getAssetById(asDb(db), gold.id))!.balance).toBe(0);
  });
});

describe('investments is the asset total, and nothing else', () => {
  it('sums every live asset', async () => {
    const { db } = await setup();
    await insertAsset(asDb(db), { name: 'Gold', balance: 40000 });
    await insertAsset(asDb(db), { name: 'FD', balance: 15000 });
    expect(await getAssetsTotal(asDb(db))).toBe(55000);
    expect((await getMoneyProfile(asDb(db))).investments).toBe(55000);
  });

  it('stops counting an archived one — archiving is how you say you no longer own it', async () => {
    const { db } = await setup();
    const gold = await insertAsset(asDb(db), { name: 'Gold', balance: 40000 });
    await insertAsset(asDb(db), { name: 'FD', balance: 15000 });
    await archiveAsset(asDb(db), gold.id);
    expect(await getAssetsTotal(asDb(db))).toBe(15000);
    // ...and the transfers that built it are untouched history.
    expect(await getAssets(asDb(db))).toHaveLength(1);
  });

  it('is zero, not undefined, with no assets at all', async () => {
    const { db } = await setup();
    expect(await getAssetsTotal(asDb(db))).toBe(0);
    expect((await getMoneyProfile(asDb(db))).investments).toBe(0);
  });
});

describe('restating a balance is a market move, not a transfer', () => {
  it('changes net worth without moving any cash', async () => {
    const { db } = await setup();
    const gold = await insertAsset(asDb(db), { name: 'Gold', balance: 40000 });
    await restateAssetBalance(asDb(db), gold.id, 55000);

    expect((await getAssetById(asDb(db), gold.id))!.balance).toBe(55000);
    // No transaction: nothing moved between your pockets, so booking a settlement
    // would make cash move for a gain that never touched the bank.
    expect(await getTransactionsInRange(asDb(db), null, 0, Date.now() + 1000)).toHaveLength(0);
    expect((await getCashPosition(asDb(db))).available).toBe(OPENING);
  });

  it('refuses a negative worth', async () => {
    const { db } = await setup();
    const gold = await insertAsset(asDb(db), { name: 'Gold' });
    await expect(restateAssetBalance(asDb(db), gold.id, -1)).rejects.toThrow(AssetError);
  });
});

describe('managing the register', () => {
  it('refuses an unnamed asset', async () => {
    const { db } = await setup();
    await expect(insertAsset(asDb(db), { name: '   ' })).rejects.toThrow(AssetError);
    await expect(updateAsset(asDb(db), 'x', { name: '' })).rejects.toThrow(AssetError);
  });

  it('keeps an asset that has history, and lets a typo go', async () => {
    const { db } = await setup();
    const typo = await insertAsset(asDb(db), { name: 'Godl' });
    const real = await insertAsset(asDb(db), { name: 'Gold' });
    await transferToAsset(asDb(db), real.id, 10000);

    expect(await deleteAsset(asDb(db), typo.id)).toEqual({ ok: true });
    // The one with transfers against it must be archived, not destroyed — the
    // months those transfers happened in still have to add up.
    expect(await deleteAsset(asDb(db), real.id)).toEqual({ ok: false, reason: 'has-history' });
  });

  it('refuses a transfer against an asset that is gone', async () => {
    const { db } = await setup();
    await expect(transferToAsset(asDb(db), 'nope', 1000)).rejects.toThrow(AssetError);
  });

  it('refuses an amount that is not one', async () => {
    const { db } = await setup();
    const gold = await insertAsset(asDb(db), { name: 'Gold', balance: 5000 });
    for (const bad of [0, -100, NaN]) {
      await expect(transferToAsset(asDb(db), gold.id, bad)).rejects.toThrow(AssetError);
      await expect(transferFromAsset(asDb(db), gold.id, bad)).rejects.toThrow(AssetError);
    }
  });

  it('persists a drag-reorder', async () => {
    const { db } = await setup();
    const a = await insertAsset(asDb(db), { name: 'A' });
    const b = await insertAsset(asDb(db), { name: 'B' });
    const c = await insertAsset(asDb(db), { name: 'C' });
    await setAssetOrder(asDb(db), [c.id, a.id, b.id]);
    expect((await getAssets(asDb(db))).map(x => x.name)).toEqual(['C', 'A', 'B']);
  });

  it('gives the Savings tab an asset to move into without asking the user to pick one', async () => {
    const { db } = await setup();
    // Nothing exists yet — it must mint one rather than fail.
    const first = await defaultInvestmentAsset(asDb(db));
    expect(first.name).toBe('Investments');
    // ...and then keep returning the same one.
    expect((await defaultInvestmentAsset(asDb(db))).id).toBe(first.id);
    expect(await getAssets(asDb(db))).toHaveLength(1);
  });
});
