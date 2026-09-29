import type * as SQLite from 'expo-sqlite';
import { openTestDb, seedGroupAndMe } from './dbHarness';
import {
  insertTxnRows, softDeleteTxn, restoreTxn, reapDeletedAttachments, attachmentInUse, getActiveRecurringRules,
} from '../db/queries/transactions';
import { materializeDueOccurrences } from '../db/queries/recurring';
import { queueUpsert, setQueueListener } from '../db/queries/syncQueue';
import { loadCatchUp } from '../lib/homeData';
import { settings } from '../lib/settings';

// Regressions for docs/SPEC-BUGSCAN.md. Each was proven by reverting its fix.

const ME = 'me';
const DAY = 86_400_000;

async function seedRule(db: SQLite.SQLiteDatabase, extra: Record<string, unknown> = {}) {
  await insertTxnRows(db, {
    groupId: 'g', kind: 'expense', entryMode: 'quick', date: Date.now() - 70 * DAY, category: 'Rent',
    recurFreq: 'monthly', recurInterval: 1,
    payments: [{ personId: ME, amount: 100_000 }], shares: [{ personId: ME, amount: 100_000 }],
    ...extra,
  } as Parameters<typeof insertTxnRows>[1], 'rule', Date.now());
}

const liveOccurrences = async (db: SQLite.SQLiteDatabase) =>
  (await db.getAllAsync<{ id: string }>("SELECT id FROM txn WHERE parent_recur_id = 'rule' AND is_deleted = 0")).map(r => r.id);

describe('BS-2 · Undo of "delete rule + all logged"', () => {
  it('restores only what that delete removed, not an occurrence deleted earlier by hand', async () => {
    const db = await openTestDb();
    await seedGroupAndMe(db);
    await seedRule(db);
    await materializeDueOccurrences(db);
    const [first, ...rest] = await liveOccurrences(db);
    expect(rest.length).toBeGreaterThan(0);

    await softDeleteTxn(db, first);
    await new Promise(r => setTimeout(r, 5)); // a later stamp, as a real second tap has
    await softDeleteTxn(db, 'rule', true);
    expect(await liveOccurrences(db)).toEqual([]);

    await restoreTxn(db, 'rule', true);
    expect((await liveOccurrences(db)).sort()).toEqual(rest.sort());
  });
});

describe('BS-3 · shared receipt files', () => {
  it('the reaper does not hand back a file a live row still uses', async () => {
    const db = await openTestDb();
    await seedGroupAndMe(db);
    await seedRule(db, { attachmentUri: 'file://rent.jpg' });
    await materializeDueOccurrences(db);
    const [first] = await liveOccurrences(db);
    await softDeleteTxn(db, first);
    await db.runAsync('UPDATE txn SET updated_at = ? WHERE id = ?', [Date.now() - 60 * DAY, first]);

    expect(await reapDeletedAttachments(db, 30 * DAY)).toEqual([]);
    expect(await attachmentInUse(db, 'file://rent.jpg')).toBe(true);
  });

  it('still hands back a file nothing else points at', async () => {
    const db = await openTestDb();
    await seedGroupAndMe(db);
    await insertTxnRows(db, {
      groupId: 'g', kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food', attachmentUri: 'file://solo.jpg',
      payments: [{ personId: ME, amount: 500 }], shares: [{ personId: ME, amount: 500 }],
    } as Parameters<typeof insertTxnRows>[1], 't', Date.now());
    await softDeleteTxn(db, 't');
    await db.runAsync("UPDATE txn SET updated_at = ? WHERE id = 't'", [Date.now() - 60 * DAY]);
    expect(await reapDeletedAttachments(db, 30 * DAY)).toEqual(['file://solo.jpg']);
  });
});

describe('BS-4 · rules in a group that ended for me', () => {
  it.each([
    ['deleted', "UPDATE budget_group SET deleted_at = 1, is_archived = 1 WHERE id = 'g'"],
    ['left', "UPDATE group_member SET deleted_at = 1 WHERE group_id = 'g' AND person_id = 'me'"],
  ])('a %s group posts nothing and counts as no bill', async (_why, end) => {
    const db = await openTestDb();
    await seedGroupAndMe(db);
    await seedRule(db);
    await db.runAsync(end);
    expect(await materializeDueOccurrences(db)).toBe(0);
    expect(await getActiveRecurringRules(db)).toEqual([]);
  });

  it('a live group still posts', async () => {
    const db = await openTestDb();
    await seedGroupAndMe(db);
    await seedRule(db);
    expect(await materializeDueOccurrences(db)).toBeGreaterThan(0);
  });
});

describe('BS-5 · a queued change schedules its own sync', () => {
  afterEach(() => setQueueListener(null));
  it('tells the listener, whatever screen made the write', async () => {
    const db = await openTestDb();
    const heard = jest.fn();
    setQueueListener(heard);
    await queueUpsert(db, 'savings_goal', 'goal-1');
    expect(heard).toHaveBeenCalled();
  });
});

describe('U2 · Home catch-up counts only rules that posted', () => {
  it('ignores remind-only, ended and someone else\'s rules', async () => {
    const db = await openTestDb();
    await seedGroupAndMe(db);
    await seedRule(db);
    for (const [id, set] of [['remind', "recur_mode = 'remind'"], ['ended', "recur_state = 'ended'"], ['peer', "author_person_id = 'x'"]] as const) {
      await insertTxnRows(db, {
        groupId: 'g', kind: 'expense', entryMode: 'quick', date: Date.now() - 70 * DAY, category: 'Gym',
        recurFreq: 'monthly', recurInterval: 1,
        payments: [{ personId: ME, amount: 1 }], shares: [{ personId: ME, amount: 1 }],
      } as Parameters<typeof insertTxnRows>[1], id, Date.now());
      await db.runAsync(`UPDATE txn SET ${set} WHERE id = ?`, [id]);
    }
    await settings.setAppLastOpen(Date.now() - 40 * DAY);
    expect(await loadCatchUp(db)).toEqual({ days: 40, ruleCount: 1 });
    // Stamped: the next open, moments later, says nothing.
    expect(await loadCatchUp(db)).toBeNull();
  });
});
