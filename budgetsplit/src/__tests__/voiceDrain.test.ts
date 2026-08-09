/**
 * The drain, tested for real: a fake filesystem in front of the actual SQLite schema.
 *
 * This is the only code in the voice path that writes money, and it was the only part with
 * no coverage — `voiceInbox` is pure and easy, `voiceDrain` does the IO. The rules worth
 * proving are the ones that are invisible when they break:
 *
 *  - a capture file is deleted **only after** its row commits, so a failed write is a delay
 *    and never a silent loss (Siri already told the user it was saved);
 *  - one bad capture never strands the ones behind it;
 *  - the same capture can never be filed twice.
 *
 * `expo-file-system` has no jest mapping, so it is replaced by the in-memory fake in
 * `__mocks__/expoFileSystem.ts`. That lives in its own module rather than an inline factory
 * because a `jest.mock` factory may not reference anything outside its own scope.
 */

jest.mock('expo-file-system', () => require('./__mocks__/expoFileSystem'));

import { drainVoiceInbox, pendingCaptureCount } from '../lib/voiceDrain';
import { createTestDb, addPerson, addGroup, addMember, addCategory, type TestDb } from './helpers/testDb';
import { setFlag } from '../lib/featureFlags';
import { state as fsState, __reset as fsReset } from './__mocks__/expoFileSystem';

/** Wed 12 Aug 2026, 15:30 — a fixed instant so dates assert against known values. */
const SPOKE_AT = new Date(2026, 7, 12, 15, 30).getTime();

/** Put a capture in the inbox. The filename IS the capture time. */
function capture(phrase: string, atMs = SPOKE_AT) {
  fsState.entries.push({ name: `${atMs}.txt`, content: phrase });
  return `${atMs}.txt`;
}

function seed(): { db: TestDb; meId: string; personalId: string } {
  const db = createTestDb();
  const meId = addPerson(db, 'Prem', true);
  const personalId = addGroup(db, 'Personal', true);
  addMember(db, personalId, meId);
  for (const c of ['Groceries', 'Food', 'Transport', 'Other']) addCategory(db, c);
  return { db, meId, personalId };
}

const txnRows = (db: TestDb) =>
  db.raw.prepare('SELECT * FROM txn ORDER BY created_at, date').all() as any[];
const pendingRows = (db: TestDb) =>
  db.raw.prepare('SELECT * FROM pending_txn ORDER BY created_at, date').all() as any[];

beforeEach(async () => {
  fsReset();
  // Flags default to on; tests that need them off set them explicitly.
  await setFlag('voiceEntry', true);
  await setFlag('smartCategory', true);
});

describe('drainVoiceInbox — posting to the ledger', () => {
  it('turns a confident personal phrase into a real transaction', async () => {
    const { db, meId, personalId } = seed();
    capture('four fifty groceries');

    const out = await drainVoiceInbox(db as never);

    expect(out).toEqual({ saved: 1, queued: 0, deferred: 0 });
    const rows = txnRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].group_id).toBe(personalId);
    expect(rows[0].kind).toBe('expense');
    expect(rows[0].category).toBe('Groceries');
    expect(rows[0].source).toBe('voice');
    // Money stays integer paise.
    const paid = db.raw.prepare('SELECT amount FROM txn_payment WHERE txn_id = ?').get(rows[0].id) as any;
    expect(paid.amount).toBe(45000);
    expect(Number.isInteger(paid.amount)).toBe(true);
    const share = db.raw.prepare('SELECT person_id, amount FROM txn_share WHERE txn_id = ?').get(rows[0].id) as any;
    expect(share.person_id).toBe(meId);
    expect(share.amount).toBe(45000);
  });

  it('keeps a record of what was actually heard', async () => {
    const { db } = seed();
    capture('450 zomato biryani');
    await drainVoiceInbox(db as never);
    // The descriptive words become the title, which is stored in the note column.
    expect(txnRows(db)[0].note).toContain('zomato biryani');
  });

  it('files an unrecognised description under Other rather than refusing it', async () => {
    const { db } = seed();
    capture('450 blorptastic nonsense');
    const out = await drainVoiceInbox(db as never);
    expect(out.saved).toBe(1);
    expect(txnRows(db)[0].category).toBe('Other');
  });

  it('dates the spend from when it was SPOKEN, not when it was drained', async () => {
    const { db } = seed();
    // Said at 23:30 on the 11th; "yesterday" must mean the 10th, not the 11th.
    capture('450 groceries yesterday', new Date(2026, 7, 11, 23, 30).getTime());
    await drainVoiceInbox(db as never);
    expect(new Date(txnRows(db)[0].date).getDate()).toBe(10);
  });

  it('accepts the yyyyMMddHHmmss filename the shortcut actually writes', async () => {
    const { db } = seed();
    // Shortcuts cannot emit an epoch, so this is the real-world filename shape.
    fsState.entries.push({ name: '20260811233000.txt', content: '450 groceries yesterday' });

    const out = await drainVoiceInbox(db as never);

    expect(out.saved).toBe(1);
    // Spoken 23:30 on the 11th, so "yesterday" is the 10th.
    expect(new Date(txnRows(db)[0].date).getDate()).toBe(10);
  });

  it('clears the inbox once everything has committed', async () => {
    const { db } = seed();
    capture('four fifty groceries');
    await drainVoiceInbox(db as never);
    expect(fsState.entries).toHaveLength(0);
    expect(pendingCaptureCount()).toBe(0);
  });
});

describe('drainVoiceInbox — what waits in Review instead', () => {
  it('queues a phrase with no amount', async () => {
    const { db } = seed();
    capture('groceries');
    const out = await drainVoiceInbox(db as never);
    expect(out).toEqual({ saved: 0, queued: 1, deferred: 0 });
    expect(txnRows(db)).toHaveLength(0);
    expect(pendingRows(db)[0].source).toBe('voice');
    expect(pendingRows(db)[0].raw).toMatch(/no amount/i);
  });

  it('queues a phrase that sounds shared, even with a perfect amount', async () => {
    const { db } = seed();
    capture('twelve hundred dinner split with Rohan');
    const out = await drainVoiceInbox(db as never);
    expect(out.queued).toBe(1);
    expect(txnRows(db)).toHaveLength(0);
    expect(pendingRows(db)[0].amount).toBe(120000);
    expect(pendingRows(db)[0].raw).toMatch(/split/i);
  });

  it('queues a phrase naming a real group, with no keyword at all', async () => {
    const { db, meId } = seed();
    const goa = addGroup(db, 'Goa trip');
    addMember(db, goa, meId);
    capture('two thousand Goa trip');

    const out = await drainVoiceInbox(db as never);

    // Would otherwise have posted silently to Personal.
    expect(out.saved).toBe(0);
    expect(out.queued).toBe(1);
    expect(pendingRows(db)[0].raw).toMatch(/group/i);
  });

  it('still posts that same phrase when no such group exists', async () => {
    const { db } = seed();
    capture('two thousand Goa trip');
    const out = await drainVoiceInbox(db as never);
    expect(out.saved).toBe(1);
  });
});

describe('drainVoiceInbox — a failed write must never lose a capture', () => {
  /** A db whose txn INSERT fails, standing in for a full disk. */
  function withFailingTxnInsert(db: TestDb): TestDb {
    return {
      ...db,
      async runAsync(sql: string, params?: unknown[]) {
        if (/INSERT INTO txn\b/i.test(sql)) throw new Error('SQLITE_FULL: database or disk is full');
        return db.runAsync(sql, params);
      },
    };
  }

  it('leaves the file in place when the row could not be written', async () => {
    const { db } = seed();
    capture('four fifty groceries');

    const out = await drainVoiceInbox(withFailingTxnInsert(db) as never);

    expect(out.saved).toBe(0);
    expect(out.deferred).toBe(1);
    expect(txnRows(db)).toHaveLength(0);
    // The whole point: the capture survives to be retried.
    expect(fsState.entries).toHaveLength(1);
  });

  it('files it on the next drain, once there is room again', async () => {
    const { db } = seed();
    capture('four fifty groceries');

    await drainVoiceInbox(withFailingTxnInsert(db) as never);
    const second = await drainVoiceInbox(db as never);

    expect(second.saved).toBe(1);
    expect(txnRows(db)).toHaveLength(1);
    expect(fsState.entries).toHaveLength(0);
  });

  it('stops at the first failure rather than skipping past it', async () => {
    const { db } = seed();
    capture('100 groceries', SPOKE_AT);
    capture('200 groceries', SPOKE_AT + 1000);
    capture('300 groceries', SPOKE_AT + 2000);

    const out = await drainVoiceInbox(withFailingTxnInsert(db) as never);

    // Nothing posted, nothing deleted, and the order is preserved for the retry — a later
    // capture must not jump ahead of an earlier one that failed.
    expect(out.saved).toBe(0);
    expect(out.deferred).toBe(3);
    expect(fsState.entries).toHaveLength(3);
  });

  it('never files the same capture twice when the file cannot be deleted', async () => {
    const { db } = seed();
    const name = capture('four fifty groceries');
    fsState.undeletable.add(name);

    await drainVoiceInbox(db as never);
    // Delete failed, so it was blanked instead — an empty capture is skipped next time.
    expect(fsState.entries[0].content).toBe('');

    const second = await drainVoiceInbox(db as never);
    expect(second.saved).toBe(0);
    expect(txnRows(db)).toHaveLength(1);   // still exactly one
  });

  it('gives up on a capture it can neither delete nor blank, rather than looping forever', async () => {
    const { db } = seed();
    const name = capture('four fifty groceries');
    fsState.undeletable.add(name);
    fsState.unwritable.add(name);

    const out = await drainVoiceInbox(db as never);

    expect(out.saved).toBe(1);
    expect(out.deferred).toBe(0);
  });
});

describe('drainVoiceInbox — junk and edge cases', () => {
  it('processes captures oldest-first', async () => {
    const { db } = seed();
    capture('300 transport', SPOKE_AT + 2000);
    capture('100 groceries', SPOKE_AT);
    capture('200 food', SPOKE_AT + 1000);

    await drainVoiceInbox(db as never);

    const amounts = db.raw.prepare(
      'SELECT p.amount FROM txn t JOIN txn_payment p ON p.txn_id = t.id ORDER BY t.date',
    ).all() as any[];
    expect(amounts.map(a => a.amount)).toEqual([10000, 20000, 30000]);
  });

  it('discards an empty capture instead of retrying it forever', async () => {
    const { db } = seed();
    capture('   ');
    const out = await drainVoiceInbox(db as never);
    expect(out).toEqual({ saved: 0, queued: 0, deferred: 0 });
    expect(fsState.entries).toHaveLength(0);
  });

  it('discards an unreadable capture rather than blocking every later one', async () => {
    const { db } = seed();
    const bad = capture('unreadable', SPOKE_AT);
    fsState.unreadable.add(bad);
    capture('450 groceries', SPOKE_AT + 1000);

    const out = await drainVoiceInbox(db as never);

    expect(out.saved).toBe(1);
    expect(fsState.entries).toHaveLength(0);
  });

  it('does nothing when the inbox folder does not exist', async () => {
    const { db } = seed();
    fsState.dirExists = false;
    await expect(drainVoiceInbox(db as never)).resolves.toEqual({ saved: 0, queued: 0, deferred: 0 });
  });

  it('does nothing before onboarding has created a person and a group', async () => {
    const db = createTestDb();
    for (const c of ['Groceries', 'Other']) addCategory(db, c);
    capture('four fifty groceries');

    const out = await drainVoiceInbox(db as never);

    // Nothing to attribute the spend to — so leave the capture alone rather than invent one.
    expect(out).toEqual({ saved: 0, queued: 0, deferred: 0 });
    expect(fsState.entries).toHaveLength(1);
  });
});

describe('drainVoiceInbox — the flags are respected, not just displayed', () => {
  it('does not act at all when voice entry is switched off', async () => {
    const { db } = seed();
    await setFlag('voiceEntry', false);
    capture('four fifty groceries');

    const out = await drainVoiceInbox(db as never);

    expect(out).toEqual({ saved: 0, queued: 0, deferred: 0 });
    expect(txnRows(db)).toHaveLength(0);
    // Nothing lost: switch it back on and the capture is still there.
    expect(fsState.entries).toHaveLength(1);
  });

  it('stops guessing a category when smart category is switched off', async () => {
    const { db } = seed();
    await setFlag('smartCategory', false);
    capture('450 groceries');

    await drainVoiceInbox(db as never);

    // "Don't guess a category from what I write" applies to dictating too.
    expect(txnRows(db)[0].category).toBe('Other');
  });
});
