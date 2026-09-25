jest.mock('expo-file-system', () => require('./__mocks__/expoFileSystem'));

import { describeHistory, changesBetween, conflictFields, refusalText, type HistoryVersion } from '../lib/txnHistory';
import { syncOnce } from '../lib/sync/engine';
import { uploadToAccount, replaceWithAccount } from '../lib/sync/firstSignIn';
import { selfPersonId } from '../lib/sync/ids';
import { insertTxn, updateTxn } from '../db/queries/transactions';
import { transactionHistory } from '../../../server/api/sync/history';
import { USER, ACCOUNT, transport, server, freshPhone } from './helpers/syncWorld';

/**
 * A transaction's History and the conflict card's comparison (task S17), as
 * words — and the server endpoint behind History, on real pushed data.
 */

const snap = (over: Record<string, unknown> = {}) => ({
  category: 'Food', date: Date.UTC(2026, 8, 2), note: null, tags: [],
  payers: [{ person_id: 'user:a', amount: 40000 }], splits: [{ person_id: 'user:a', amount: 40000 }], ...over,
});
const v = (version: number, snapshot: Record<string, unknown>, editedBy = 'a', editorName: string | null = 'Prem'): HistoryVersion =>
  ({ version, editedAt: version * 1000, editedBy, editorName, snapshot });

describe('History in words', () => {
  it('newest first; my own edits say "You", someone else\'s say their name', () => {
    const lines = describeHistory([
      v(1, snap()),
      v(2, snap({ payers: [{ person_id: 'user:a', amount: 45000 }], splits: [{ person_id: 'user:a', amount: 45000 }] }), 'b', 'Aarav'),
    ], 'a');
    expect(lines.map(l => l.text)).toEqual(['Aarav changed ₹400 → ₹450', 'You added it · ₹400']);
    expect(lines.map(l => l.action)).toEqual(['updated', 'created']);
  });

  it('names every kind of change, and says when nothing visible changed', () => {
    expect(changesBetween(snap(), snap({ category: 'Travel', note: 'cab', tags: ['work'] })))
      .toEqual(['Food → Travel', 'the note', 'the tags']);
    expect(changesBetween(snap(), snap({ splits: [{ person_id: 'user:b', amount: 40000 }] }))).toEqual(['the split']);
    // A paise-sized change is shown exactly, or it would read "₹400 → ₹400".
    expect(changesBetween(snap(), snap({ payers: [{ person_id: 'user:a', amount: 40010 }] }))[0]).toBe('₹400.00 → ₹400.10');
    expect(changesBetween(snap(), snap({ payers: [{ person_id: 'user:b', amount: 40000 }] }))).toEqual(['who paid']);
    expect(describeHistory([v(1, snap()), v(2, snap())], 'a')[0].text).toBe('You saved it again');
  });

  it('a deletion reads as one', () => {
    expect(describeHistory([v(1, snap()), v(2, snap({ deleted_at: 5 }))], 'a')[0]).toMatchObject({ action: 'deleted', text: 'You deleted it' });
  });

  it('an account with no name is "Someone", never blank', () => {
    expect(describeHistory([v(1, snap(), 'b', null)], 'a')[0].text).toBe('Someone added it · ₹400');
  });
});

it('the conflict card compares the same fields every time, and marks only what differs', () => {
  const rows = conflictFields(snap({ payers: [{ person_id: 'user:a', amount: 50000 }] }), snap());
  expect(rows.map(r => r.field)).toEqual(['Amount', 'Category', 'Date', 'Note', 'Split']);
  // Exact, to the paisa: this is a money choice.
  expect(rows.filter(r => r.differs).map(r => [r.field, r.yours, r.theirs])).toEqual([['Amount', '₹500.00', '₹400.00']]);
});

it('a refusal says what happened, without the server\'s table prefix', () => {
  expect(refusalText('transactions: everyone named must be an active member of the group'))
    .toBe('This wasn’t saved: everyone named must be an active member of the group. It’s back to how it was.');
  expect(refusalText('')).toBe('This change wasn’t saved, and it’s back to how it was.');
});

describe('GET /transactions/:id/history', () => {
  it('returns every saved version to someone who can read it, and nothing to anyone else', async () => {
    const d1 = await server();
    const a = await freshPhone('a-me');
    await uploadToAccount(a, ACCOUNT);
    const personal = (a.raw.prepare('SELECT id FROM budget_group WHERE is_personal = 1').get() as { id: string }).id;
    const me = selfPersonId(USER);
    const id = await insertTxn(a, {
      groupId: personal, kind: 'expense', entryMode: 'quick', date: Date.UTC(2026, 8, 2), category: 'Food',
      payments: [{ personId: me, amount: 40000 }], shares: [{ personId: me, amount: 40000 }],
    });
    await syncOnce(a, transport(d1), USER);
    await updateTxn(a, {
      id, groupId: personal, kind: 'expense', date: Date.UTC(2026, 8, 2), category: 'Food',
      payments: [{ personId: me, amount: 45000 }], shares: [{ personId: me, amount: 45000 }],
    });
    await syncOnce(a, transport(d1), USER);

    const entries = await transactionHistory(d1, USER, id);
    expect(entries?.map(e => e.version)).toEqual([1, 2]);
    expect(describeHistory(entries!, USER).map(l => l.text)).toEqual(['You changed ₹400 → ₹450', 'You added it · ₹400']);

    await d1.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').bind('stranger', 's@x.in', 'S', 1).run();
    expect(await transactionHistory(d1, 'stranger', id)).toBeNull();
    expect(await transactionHistory(d1, USER, 'no-such-id')).toBeNull();

    // A second phone restoring the account can read it too.
    const b = await freshPhone('b-me');
    await replaceWithAccount(b, transport(d1), ACCOUNT);
    expect((await transactionHistory(d1, USER, id))?.length).toBe(2);
  });
});
