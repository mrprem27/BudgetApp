import fs from 'fs';
import path from 'path';

/**
 * Every writer of a synced table queues its change (SPEC-SERVER.md §3.4, S9–S11).
 *
 * A write that commits without a queue row is a change the server never hears of:
 * the next phone restores without it, and nothing anywhere says so. This scans
 * every function in `src/db/queries` that INSERTs, UPDATEs or DELETEs a table
 * whose rows travel, and fails unless the function queues the change — or is
 * listed below with the reason it must not.
 */

const QUERIES = path.join(__dirname, '../db/queries');
const SYNCED = [
  'person', 'person_group_trust', 'budget_group', 'group_member', 'txn', 'txn_payment', 'txn_share', 'line_item',
  'recur_skip', 'category', 'category_tombstone', 'category_budget', 'asset', 'savings_goal', 'savings_txn',
  'pending_txn', 'settings',
];
const WRITE = new RegExp(`(INSERT(?: OR \\w+)? INTO|UPDATE|DELETE FROM)\\s+(${SYNCED.join('|')})\\b`, 'g');
const QUEUES = /\b(queueUpsert|queueDelete|queueAnswer|queueUpsertWhere|queueEntry|queueSeries)\(/;

/** Writers that must NOT queue, and why. Every entry is a decision, not an omission. */
export const EXEMPT: Record<string, string> = {
  // Not user changes.
  'backup.ts::clearLedgerRows': 'empties the ledger for a restore or the sign-out wipe (DQ-97); what the phone holds next meets the account through the first sign-in (§4), never as a stream of deletes',
  'moneyProfile.ts::clearMoneyProfile': 'part of erasing all data on this phone, which never reaches the account',
  // Columns that never travel (see COLUMN_FATES).
  'persons.ts::setPersonImage': 'image_uri is a photo on this phone; photos never sync',
  'persons.ts::setRemoteUid': 'remote_uid comes FROM the server; the phone never sends it',
  'transactions.ts::reapDeletedAttachments': 'attachment_uri never syncs',
  'transactions.ts::clearAllAttachmentRefs': 'attachment_uri never syncs',
  'transactions.ts::setTxnAttachment': 'attachment_uri never syncs',
  // Accepting someone else's transfer writes where it landed onto MY copy of their
  // entry. Their entry is theirs to send; my side travels as `landed_pay_method` on
  // the answer `approveTxn` queues (`queueAnswer`, S21).
  'approval.ts::approveTxn': 'writes the landed pay method onto my copy of someone else\'s entry; it travels on the queued approval answer, never as an edit of theirs',
  // The pull applier writes what the server already holds.
  'syncApply.ts::*': 'the pull applier — it applies the server\'s state, so it must not echo it back',
  // The identity remap (S13) only re-points which LOCAL id means "me"; it changes
  // no money, no membership and no content. The server independently computes the
  // same new id from the account (selfPersonId), so there is nothing to tell it —
  // and sync only turns on after this runs, so every queued write already carries
  // the corrected id by the time anything is sent.
  // The same file joins a ledger to an account (S14): `linkLedger` queues the
  // whole ledger itself, and `seedAccountMe` writes the "me" the server already has.
  'identity.ts::*': 're-points local ids to match the account, or seeds the account\'s own "me"; changes no content the server needs telling about',
  // A friend taking their account's id (S20) re-points local references the same
  // way. `adoptAccountId` queues the person itself (delete old, upsert new); rows
  // already on the server that still name the placeholder are the server-side
  // placeholder merge, which is S21's acceptance, not something to re-push here.
  'personRemap.ts::remapAssignedTo': 're-points local ids when a friend takes their account\'s id; the person is queued by adoptAccountId, the server\'s copy is merged in S21',
};

type Writer = { name: string; tables: string[]; queues: boolean };

function writers(): Writer[] {
  const out: Writer[] = [];
  for (const file of fs.readdirSync(QUERIES).filter(f => f.endsWith('.ts'))) {
    const src = fs.readFileSync(path.join(QUERIES, file), 'utf8');
    for (const part of src.split(/\n(?=(?:export )?(?:async )?function \w+)/)) {
      const m = /^(?:export )?(?:async )?function (\w+)/.exec(part);
      if (!m) continue;
      const tables = [...new Set([...part.matchAll(WRITE)].map(w => w[2]))];
      if (tables.length) out.push({ name: `${file}::${m[1]}`, tables, queues: QUEUES.test(part) });
    }
  }
  return out;
}

const exempt = (name: string) => name in EXEMPT || `${name.split('::')[0]}::*` in EXEMPT;

describe('every writer of a synced table queues its change', () => {
  const all = writers();

  it('finds the writers at all', () => {
    expect(all.length).toBeGreaterThan(50);
  });

  it('leaves no writer unqueued and unexplained', () => {
    expect(all.filter(w => !w.queues && !exempt(w.name)).map(w => `${w.name} -> ${w.tables.join(',')}`)).toEqual([]);
  });

  it('keeps no stale exemption — every one names a writer that exists', () => {
    const names = new Set(all.map(w => w.name));
    const stale = Object.keys(EXEMPT).filter(k => !k.endsWith('::*') && !names.has(k));
    expect(stale).toEqual([]);
  });
});
