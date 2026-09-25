jest.mock('expo-file-system', () => require('./__mocks__/expoFileSystem'));

import { syncOnce } from '../lib/sync/engine';
import { uploadToAccount, mergeIntoAccount, canMerge, replaceWithAccount, FirstSignInError } from '../lib/sync/firstSignIn';
import { linkedUser, lastSyncedAt } from '../db/queries/syncApply';
import { queueCount } from '../db/queries/syncQueue';
import { insertPerson, setPersonContact } from '../db/queries/persons';
import { insertGroup, getPersonalGroup } from '../db/queries/groups';
import { insertTxn } from '../db/queries/transactions';
import { setCategoryBudgets } from '../db/queries/categoryBudgets';
import { USER, ACCOUNT, transport, server, freshPhone, usedPhone, type Db } from './helpers/syncWorld';
import type { TestD1 } from './server/helpers/d1';

/**
 * Merge (`DQ-94`, task `M1`): the phone keeps its own data AND gets the
 * account's, on the real Worker push/pull (in-process D1), on the free-plan
 * query budget — the same conditions the device actually runs under.
 */

const FREE_PLAN_BUDGET = 50 - 4; // routes.ts: D1_QUERY_BUDGET(50) − QUERIES_BEFORE_PUSH(4)

/** An account with its own Personal-group expense, a friend and a budget line. */
async function accountWithData(d1: TestD1) {
  const a = await usedPhone('other-phone-me');
  const personal = await getPersonalGroup(a);
  if (personal) {
    await setCategoryBudgets(a, personal.id, [{ category: 'Food', cadence: 'monthly', amount: 500000 }], { actorId: 'other-phone-me' });
  }
  const priya = await insertPerson(a, 'Priya', '#3ECF8E');
  await setPersonContact(a, priya.id, { email: 'priya@example.com' });
  await uploadToAccount(a, ACCOUNT);
  await syncOnce(a, transport(d1), USER);
  expect(await queueCount(a)).toBe(0);
  return a;
}

async function counts(db: Db) {
  const q = (sql: string) => db.getFirstAsync<{ n: number }>(sql).then(r => r!.n);
  return {
    people: await q('SELECT COUNT(*) AS n FROM person'),
    groups: await q('SELECT COUNT(*) AS n FROM budget_group'),
    personalGroups: await q('SELECT COUNT(*) AS n FROM budget_group WHERE is_personal = 1'),
    txns: await q("SELECT COUNT(*) AS n FROM txn WHERE is_deleted = 0 AND author_person_id IS NULL"),
    budgets: await q('SELECT COUNT(*) AS n FROM category_budget'),
  };
}

describe('canMerge', () => {
  it('true when unjoined, false when joined to a DIFFERENT account', async () => {
    const db = await freshPhone();
    expect(await canMerge(db)).toBe(true);
    await uploadToAccount(db, { userId: 'someone-else' });
    expect(await canMerge(db)).toBe(false);
  });
});

describe('merge', () => {
  it('keeps the phone\'s data, brings the account\'s, and both survive a fresh restore', async () => {
    const d1 = await server();
    await accountWithData(d1);

    const phone = await usedPhone();
    const aarav = await insertPerson(phone, 'Aarav', '#F0A500');
    // Same person as the account's Priya (same email) — must fold into one row.
    const phonePriya = await insertPerson(phone, 'Priya', '#3ECF8E');
    await setPersonContact(phone, phonePriya.id, { email: 'priya@example.com' });
    const personal = await getPersonalGroup(phone);
    await insertTxn(phone, {
      groupId: personal!.id, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
      payments: [{ personId: 'local-me', amount: 30000 }], shares: [{ personId: 'local-me', amount: 30000 }],
    });
    // A budget line that clashes with the account's (same group-after-fold, category, cadence).
    await setCategoryBudgets(phone, personal!.id, [{ category: 'Food', cadence: 'monthly', amount: 200000 }], { actorId: 'local-me' });
    const before = await counts(phone);
    expect(before.personalGroups).toBe(1);

    const net = transport(d1, { queryBudget: FREE_PLAN_BUDGET });
    const progress: number[] = [];
    await mergeIntoAccount(phone, net, ACCOUNT, { onProgress: n => progress.push(n) });
    await syncOnce(phone, net, USER); // the ordinary push, as `mergeNow` would run it

    const rejections = (await d1.prepare('SELECT mutation_id, code, message FROM sync_rejections').all()).results;
    expect(rejections).toEqual([]);
    expect(await queueCount(phone)).toBe(0);
    expect(await linkedUser(phone)).toBe(USER);
    expect(await lastSyncedAt(phone)).not.toBeNull();

    const after = await counts(phone);
    // Exactly one Personal group survives — the account's, folded into.
    expect(after.personalGroups).toBe(1);
    // The clashing budget line kept the account's amount, not the phone's.
    const foodBudget = await d1.prepare(
      "SELECT amount FROM budgets WHERE category = 'Food' AND cadence = 'monthly'",
    ).first<number>('amount');
    expect(foodBudget).toBe(500000);
    expect(after.budgets).toBe(before.budgets); // the phone's clashing line was dropped, not added

    // The phone's own two expenses (from usedPhone + the one just added) are still there,
    // and the account's one is now pulled in as mine too (its author is "me", post-merge) —
    // nothing phone-side was lost, and nothing account-side is missing.
    expect(after.txns).toBe(before.txns + 1);
    const serverTxnCount = await d1.prepare('SELECT COUNT(*) AS n FROM transactions').first<number>('n');
    expect(serverTxnCount).toBe(before.txns + 1); // the phone's 2 + the account's own 1

    // Same-email friend folds into the account's one row (no extra row for her);
    // the same-name friend (Aarav) is untouched and stays exactly one row too.
    expect(after.people).toBe(before.people);
    const priyaRows = await phone.getAllAsync("SELECT id FROM person WHERE name = 'Priya'");
    expect(priyaRows.length).toBe(1);
    const aaravRows = await phone.getAllAsync('SELECT id FROM person WHERE id = ?', [aarav.id]);
    expect(aaravRows.length).toBe(1);

    expect(progress.every((p, i) => p >= 0 && p <= 1 && (i === 0 || p >= progress[i - 1]))).toBe(true);
    expect(progress.at(-1)).toBe(1);

    // A fresh third phone restores everything: the phone's data union the account's.
    const third = await freshPhone('third-me');
    await replaceWithAccount(third, net, ACCOUNT);
    const thirdCounts = await counts(third);
    expect(thirdCounts.txns).toBe(serverTxnCount);
    expect(thirdCounts.personalGroups).toBe(1);
  });

  it('a transport failure mid-merge restores the snapshot and unlinks', async () => {
    const d1 = await server();
    await accountWithData(d1);
    const phone = await usedPhone();
    const before = await phone.getAllAsync('SELECT * FROM txn');

    await expect(mergeIntoAccount(phone, transport(d1, { failPullAfter: 0 }), ACCOUNT))
      .rejects.toBeInstanceOf(FirstSignInError);

    expect(await linkedUser(phone)).toBeNull();
    expect(await phone.getAllAsync('SELECT * FROM txn')).toEqual(before);
  });

  it('queues only what the account doesn\'t already have — not a full backfill', async () => {
    // Resending an already-known row is harmless (idempotent), so a missing
    // prune shows up as wasted requests, never as a rejection — this is the
    // test that actually catches it.
    const d1 = await server();
    await accountWithData(d1);
    const phone = await usedPhone();
    await insertTxn(phone, {
      groupId: (await getPersonalGroup(phone))!.id, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
      payments: [{ personId: 'local-me', amount: 10000 }], shares: [{ personId: 'local-me', amount: 10000 }],
    });

    await mergeIntoAccount(phone, transport(d1, { queryBudget: FREE_PLAN_BUDGET }), ACCOUNT);
    const queued = await queueCount(phone);
    // A full backfill of this ledger (categories + groups + members + txns…)
    // would be dozens of rows; only the phone's own two expenses are new.
    expect(queued).toBeLessThanOrEqual(5);
  });

  it('lists a possible duplicate rather than dropping it, and never flags two entries on the same side', async () => {
    const d1 = await server();
    await accountWithData(d1); // usedPhone() seeds ₹450 Food, ~"now" — the account's copy
    const phone = await usedPhone(); // the SAME shape, on the phone — a genuine possible duplicate
    // A second phone-side Food expense, same day, DIFFERENT amount — must never
    // be flagged against the first (same side), even though both are "Food".
    const personal = await getPersonalGroup(phone);
    await insertTxn(phone, {
      groupId: personal!.id, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
      payments: [{ personId: 'local-me', amount: 12000 }], shares: [{ personId: 'local-me', amount: 12000 }],
    });

    const { duplicates } = await mergeIntoAccount(phone, transport(d1, { queryBudget: FREE_PLAN_BUDGET }), ACCOUNT);

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]).toMatchObject({ category: 'Food', amount: 45000 });
    // The matched pair are two DIFFERENT rows — nothing matched itself, and no
    // phone-side row matched another phone-side row.
    expect(duplicates[0].mine).not.toBe(duplicates[0].theirs);
    const phoneOnlyRows = await phone.getAllAsync<{ id: string }>(
      "SELECT id FROM txn WHERE category = 'Food' AND is_deleted = 0",
    );
    // Nothing was removed — Merge only lists, never drops, a possible duplicate.
    expect(phoneOnlyRows.length).toBeGreaterThanOrEqual(3); // the pair + the ₹120 one, untouched
  });

  it('never matches two of the phone\'s OWN entries to each other, even at the same amount', async () => {
    const d1 = await server();
    await accountWithData(d1); // usedPhone()'s ₹450 Food — nobody on the phone should match THIS
    const phone = await freshPhone(); // no seeded expense of its own
    const personal = await getPersonalGroup(phone);
    // Two identical phone-side expenses — two real chais, not one entry twice.
    for (let i = 0; i < 2; i++) {
      await insertTxn(phone, {
        groupId: personal!.id, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Snacks',
        payments: [{ personId: 'local-me', amount: 4000 }], shares: [{ personId: 'local-me', amount: 4000 }],
      });
    }

    const { duplicates } = await mergeIntoAccount(phone, transport(d1, { queryBudget: FREE_PLAN_BUDGET }), ACCOUNT);
    expect(duplicates).toEqual([]); // the account has no "Snacks" entry at all — nothing to match, on either side
  });

  it('refuses when this phone is joined to a different account', async () => {
    const d1 = await server();
    const phone = await usedPhone();
    await uploadToAccount(phone, { userId: 'someone-else' });
    await expect(mergeIntoAccount(phone, transport(d1), ACCOUNT)).rejects.toBeInstanceOf(FirstSignInError);
  });
});
