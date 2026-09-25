jest.mock('expo-file-system', () => require('./__mocks__/expoFileSystem'));

import { syncOnce } from '../lib/sync/engine';
import { selfPersonId } from '../lib/sync/ids';
import {
  decideFirstSignIn, uploadToAccount, replaceWithAccount, FirstSignInError,
} from '../lib/sync/firstSignIn';
import { linkedUser } from '../db/queries/syncApply';
import { queueCount } from '../db/queries/syncQueue';
import { insertAsset, getAssets } from '../db/queries/assets';
import { insertGoal, fundGoal, getGoals } from '../db/queries/savings';
import { getSafeToSpend } from '../db/queries/spendPower';
import { USER, NOW, ACCOUNT, transport, server, freshPhone, usedPhone, tables } from './helpers/syncWorld';
import type { TestD1 } from './server/helpers/d1';

/**
 * The first sign-in (task S14), end to end: real app queries on a real local
 * database, and a transport wired to the REAL Worker push/pull on an in-process D1.
 */

const ME = selfPersonId(USER);

/** An account that already holds a ledger, uploaded from another phone. */
async function accountWithData(d1: TestD1) {
  const a = await usedPhone('other-phone-me');
  await uploadToAccount(a, ACCOUNT);
  await insertAsset(a, { name: 'Gold', kind: 'gold', balance: 500000 });
  const goal = await insertGoal(a, { name: 'Trip', target: 5000000, priority: 'want' });
  await fundGoal(a, goal.id, 100000, 'manual', undefined, 'bank');
  await syncOnce(a, transport(d1), USER);
  expect(await queueCount(a)).toBe(0);
  return a;
}

describe('which case a first sign-in is', () => {
  it('a fresh phone and an empty account: upload (nothing to lose either side)', async () => {
    expect(await decideFirstSignIn(await freshPhone(), transport(await server()), USER)).toBe('upload');
  });

  it('a used phone and an empty account: upload', async () => {
    expect(await decideFirstSignIn(await usedPhone(), transport(await server()), USER)).toBe('upload');
  });

  it('a fresh phone and an account with data: restore', async () => {
    const d1 = await server();
    await accountWithData(d1);
    expect(await decideFirstSignIn(await freshPhone(), transport(d1), USER)).toBe('restore');
  });

  it('both hold data: ask', async () => {
    const d1 = await server();
    await accountWithData(d1);
    expect(await decideFirstSignIn(await usedPhone(), transport(d1), USER)).toBe('ask');
  });

  it('a phone joined to ANOTHER account is never uploaded into this one', async () => {
    const d1 = await server();
    const db = await usedPhone();
    db.raw.prepare("INSERT INTO settings (key, value) VALUES ('sync2.linked_user', 'someone-else')").run();
    expect(await decideFirstSignIn(db, transport(d1), USER)).toBe('ask');
  });

  it('already joined to this account: nothing to decide', async () => {
    const db = await usedPhone();
    await uploadToAccount(db, ACCOUNT);
    expect(await decideFirstSignIn(db, transport(await server()), USER)).toBe('linked');
  });

  it('deciding changes nothing on the phone', async () => {
    const d1 = await server();
    await accountWithData(d1);
    const db = await usedPhone();
    const before = await tables(db);
    await decideFirstSignIn(db, transport(d1), USER);
    expect(await tables(db)).toEqual(before);
  });
});

describe('upload', () => {
  it('sends rows that were never queued, and a second phone gets every figure back', async () => {
    const d1 = await server();
    const a = await usedPhone();
    await insertAsset(a, { name: 'FD', kind: 'deposit', balance: 2000000 });
    const before = await getSafeToSpend(a, NOW);
    await uploadToAccount(a, ACCOUNT);
    expect(await linkedUser(a)).toBe(USER);
    await syncOnce(a, transport(d1), USER);
    expect(await queueCount(a)).toBe(0);
    expect(await d1.prepare('SELECT COUNT(*) AS n FROM transactions').first('n')).toBe(1);
    expect(await d1.prepare('SELECT COUNT(*) AS n FROM sync_rejections').first('n')).toBe(0);

    const b = await freshPhone('b-me');
    await replaceWithAccount(b, transport(d1), ACCOUNT);
    expect(await getSafeToSpend(b, NOW)).toEqual(before);
    expect((await getAssets(b)).map(x => [x.name, x.balance])).toEqual([['FD', 2000000]]);
  });

  it('remaps "me" and queues in one step: a failure leaves neither', async () => {
    const db = await usedPhone();
    db.raw.prepare("INSERT INTO person (id, name, avatar_color, is_me) VALUES (?, 'Ghost', '#000', 0)").run(ME);
    await expect(uploadToAccount(db, ACCOUNT)).rejects.toBeInstanceOf(FirstSignInError);
    expect(await linkedUser(db)).toBeNull();
    expect(await queueCount(db)).toBe(0);
  });
});

describe('restore', () => {
  it('a fresh phone becomes the account: one "me", one Personal group, every figure', async () => {
    const d1 = await server();
    const a = await accountWithData(d1);
    const b = await freshPhone('b-me');
    const progress: number[] = [];
    await replaceWithAccount(b, transport(d1), ACCOUNT, { onProgress: n => progress.push(n) });

    expect(b.raw.prepare('SELECT id FROM person WHERE is_me = 1').all()).toEqual([{ id: ME }]);
    expect(b.raw.prepare('SELECT COUNT(*) AS n FROM budget_group WHERE is_personal = 1').get()).toEqual({ n: 1 });
    expect(await getSafeToSpend(b, NOW)).toEqual(await getSafeToSpend(a, NOW));
    expect((await getGoals(b)).map(g => [g.name, g.saved])).toEqual((await getGoals(a)).map(g => [g.name, g.saved]));
    expect(await linkedUser(b)).toBe(USER);
    expect(await queueCount(b)).toBe(0);
    // A real percentage: it only ever moves forward, and ends at 100%.
    expect(progress.every((p, i) => p >= 0 && p <= 1 && (i === 0 || p >= progress[i - 1]))).toBe(true);
    expect(progress.at(-1)).toBe(1);
  });

  it('a failure midway puts the phone back exactly as it was, unlinked', async () => {
    const d1 = await server();
    await accountWithData(d1);
    const b = await freshPhone('b-me');
    const before = await tables(b);
    await expect(replaceWithAccount(b, transport(d1, { failPullAfter: 0 }), ACCOUNT)).rejects.toBeInstanceOf(FirstSignInError);
    expect(await tables(b)).toEqual(before);
    expect(await linkedUser(b)).toBeNull();
  });
});

describe('ask → "Use my account"', () => {
  it('writes the export file while the phone still holds its data, then replaces it', async () => {
    const d1 = await server();
    await accountWithData(d1);
    const db = await usedPhone('mine');
    const exported: string[] = [];
    await replaceWithAccount(db, transport(d1), ACCOUNT, {
      writeExport: async json => {
        // At the moment of export, the phone's own entry is still there.
        expect(db.raw.prepare('SELECT COUNT(*) AS n FROM txn').get()).toEqual({ n: 1 });
        exported.push(json);
      },
    });
    expect(exported).toHaveLength(1);
    expect(JSON.parse(exported[0]).tables.txn).toHaveLength(1);
    // Replaced: the account's ledger, not a blend.
    expect((await getAssets(db)).map(x => x.name)).toEqual(['Gold']);
    expect(db.raw.prepare('SELECT id FROM person WHERE is_me = 1').all()).toEqual([{ id: ME }]);
  });

  it('never touches the phone when the export cannot be written', async () => {
    const d1 = await server();
    await accountWithData(d1);
    const db = await usedPhone('mine');
    const before = await tables(db);
    await expect(replaceWithAccount(db, transport(d1), ACCOUNT, {
      writeExport: async () => { throw new Error('disk full'); },
    })).rejects.toThrow('disk full');
    expect(await tables(db)).toEqual(before);
  });

  it('a failure after the export puts the phone back exactly as it was', async () => {
    const d1 = await server();
    await accountWithData(d1);
    const db = await usedPhone('mine');
    const before = await tables(db);
    let exported = false;
    await expect(replaceWithAccount(db, transport(d1, { failPullAfter: 0 }), ACCOUNT, {
      writeExport: async () => { exported = true; },
    })).rejects.toBeInstanceOf(FirstSignInError);
    expect(exported).toBe(true);
    expect(await tables(db)).toEqual(before);
  });
});
