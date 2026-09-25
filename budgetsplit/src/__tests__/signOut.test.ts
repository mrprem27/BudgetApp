jest.mock('expo-file-system', () => require('./__mocks__/expoFileSystem'));

import { syncOnce } from '../lib/sync/engine';
import { uploadToAccount, replaceWithAccount } from '../lib/sync/firstSignIn';
import { planSignOut, wipeForSignOut } from '../lib/sync/signOut';
import { linkedUser } from '../db/queries/syncApply';
import { queueCount } from '../db/queries/syncQueue';
import { insertAsset } from '../db/queries/assets';
import { insertGoal, fundGoal, getGoals } from '../db/queries/savings';
import { getSafeToSpend } from '../db/queries/spendPower';
import { USER, NOW, ACCOUNT, transport, server, usedPhone, tables, type Db } from './helpers/syncWorld';

/**
 * Sign-out (task S14b, `DQ-97`): upload first, then empty the phone. Against the
 * real Worker push/pull on an in-process D1.
 */

/** A phone joined to the account, with everything uploaded. */
async function syncedPhone() {
  const d1 = await server();
  const db = await usedPhone();
  await uploadToAccount(db, ACCOUNT);
  await insertAsset(db, { name: 'Gold', kind: 'gold', balance: 500000 });
  const goal = await insertGoal(db, { name: 'Trip', target: 5000000, priority: 'want' });
  await fundGoal(db, goal.id, 100000, 'manual', undefined, 'bank');
  await syncOnce(db, transport(d1), USER);
  expect(await queueCount(db)).toBe(0);
  return { d1, db };
}

const count = (db: Db, sql: string) => (db.raw.prepare(sql).get() as { n: number }).n;

describe('what signing out may do', () => {
  it('a phone never linked to this account keeps everything', async () => {
    const db = await usedPhone();
    expect(await planSignOut(db, transport(await server()), USER)).toEqual({ kind: 'keep' });
  });

  it('a linked phone with everything uploaded may be emptied', async () => {
    const { d1, db } = await syncedPhone();
    expect(await planSignOut(db, transport(d1), USER)).toEqual({ kind: 'wipe' });
  });

  it('syncs first: a change made just now is uploaded, not counted as waiting', async () => {
    const { d1, db } = await syncedPhone();
    await insertAsset(db, { name: 'Silver', kind: 'gold', balance: 1000 });
    expect(await planSignOut(db, transport(d1), USER)).toEqual({ kind: 'wipe' });
    expect(await d1.prepare("SELECT COUNT(*) AS n FROM assets WHERE name = 'Silver'").first('n')).toBe(1);
  });

  it('offline: a change that could not upload is counted, and nothing is touched', async () => {
    const { d1, db } = await syncedPhone();
    await insertAsset(db, { name: 'Silver', kind: 'gold', balance: 1000 });
    const before = await tables(db);
    expect(await planSignOut(db, transport(d1, { failPush: true }), USER)).toEqual({ kind: 'unsent', count: 1 });
    expect(await tables(db)).toEqual(before);
  });
});

describe('emptying the phone', () => {
  it('leaves a fresh install, and signing in again brings every figure back', async () => {
    const { d1, db } = await syncedPhone();
    const cash = await getSafeToSpend(db, NOW);
    const goals = (await getGoals(db)).map(g => [g.name, g.saved]);

    await wipeForSignOut(db);
    expect(count(db, 'SELECT COUNT(*) AS n FROM txn')).toBe(0);
    expect(count(db, 'SELECT COUNT(*) AS n FROM asset')).toBe(0);
    expect(count(db, 'SELECT COUNT(*) AS n FROM savings_goal')).toBe(0);
    expect(count(db, "SELECT COUNT(*) AS n FROM settings WHERE key LIKE 'sync2.%' OR key LIKE 'money.%'")).toBe(0);
    expect(count(db, 'SELECT COUNT(*) AS n FROM sync_queue')).toBe(0);
    expect(count(db, 'SELECT COUNT(*) AS n FROM person WHERE is_me = 1')).toBe(1);
    expect(count(db, 'SELECT COUNT(*) AS n FROM person')).toBe(1);
    expect(count(db, 'SELECT COUNT(*) AS n FROM budget_group WHERE is_personal = 1')).toBe(1);
    expect(count(db, 'SELECT COUNT(*) AS n FROM category')).toBeGreaterThan(10);   // the catalog, reseeded
    expect(await linkedUser(db)).toBeNull();

    await replaceWithAccount(db, transport(d1), ACCOUNT);
    expect(await getSafeToSpend(db, NOW)).toEqual(cash);
    expect((await getGoals(db)).map(g => [g.name, g.saved])).toEqual(goals);
  });

  it('"Sign out anyway" writes the export while the phone still holds its data', async () => {
    const { db } = await syncedPhone();
    const exported: string[] = [];
    await wipeForSignOut(db, {
      writeExport: async json => {
        expect(count(db, 'SELECT COUNT(*) AS n FROM asset')).toBe(1);
        exported.push(json);
      },
    });
    expect(JSON.parse(exported[0]).tables.asset).toHaveLength(1);
    expect(count(db, 'SELECT COUNT(*) AS n FROM asset')).toBe(0);
  });

  it('never wipes when the export cannot be written', async () => {
    const { db } = await syncedPhone();
    const before = await tables(db);
    await expect(wipeForSignOut(db, { writeExport: async () => { throw new Error('disk full'); } })).rejects.toThrow('disk full');
    expect(await tables(db)).toEqual(before);
    expect(await linkedUser(db)).toBe(USER);
  });

  it('a failure midway leaves the phone as it was, still linked', async () => {
    const { db } = await syncedPhone();
    const before = await tables(db);
    // The fresh install's "me" is the last write inside the transaction.
    db.raw.exec("CREATE TRIGGER no_me BEFORE INSERT ON person BEGIN SELECT RAISE(ABORT, 'boom'); END");
    await expect(wipeForSignOut(db)).rejects.toThrow('boom');
    db.raw.exec('DROP TRIGGER no_me');
    expect(await tables(db)).toEqual(before);
    expect(await linkedUser(db)).toBe(USER);
  });
});
