import type * as SQLite from 'expo-sqlite';
import type { PeerEnvelope } from './peerIngest';

/**
 * The document that travels — one shared entry, as bytes on the wire.
 *
 * Defined once and used in both directions: `readEntryDoc` builds it for the
 * push, `toPeerEnvelope` reads it on the pull. Two hand-written shapes that must
 * agree is how a field gets added to one side and silently dropped by the other,
 * and this one carries money.
 *
 * It is sealed before it leaves (`lib/groupCrypto.ts`), so nothing here is ever
 * visible to the server.
 */

/**
 * Who a payment or share belongs to, said in two ways at once.
 *
 * **This is the seam, and it is the hard part of syncing a ledger.** Person ids
 * are minted per device — my "Aarav" and your "Aarav" are different uuids — so a
 * bare local id means nothing to the receiver.
 *
 * `uid` is the account id, which IS global, and it resolves for anyone who has
 * signed in. `pid` is the author's local id, which resolves only once the
 * receiver has adopted the group's roster. Both travel because neither covers
 * everyone on its own: a group can contain a flatmate who has no account and
 * never will, and dropping them would silently reassign their share.
 *
 * An entry naming someone the receiver cannot resolve is REFUSED, not guessed at.
 * A share parked on the wrong person is a wrong number in someone's ledger that
 * nothing else will ever correct.
 */
export type PersonRef = {
  /** The person's server account id, when they have one. */
  uid: string | null;
  /** The author's local person id. Meaningful after roster adoption. */
  pid: string;
};

export type EntryDoc = {
  kind: 'expense' | 'settlement';
  date: number;
  category: string;
  note: string | null;
  payMethod: string | null;
  recurFreq: string | null;
  recurInterval: number | null;
  recurEnd: number | null;
  author: PersonRef;
  payments: Array<{ person: PersonRef; amount: number }>;
  shares: Array<{ person: PersonRef; amount: number }>;
};

type TxnRow = {
  id: string;
  group_id: string;
  kind: string;
  date: number;
  category: string;
  note: string | null;
  pay_method: string | null;
  recur_freq: string | null;
  recur_interval: number | null;
  recur_end: number | null;
  sync_version: number;
  is_deleted: number;
};

export type EntryForPush = {
  groupId: string;
  /** What the push will claim. Always one past what the server accepted. */
  version: number;
  isDeleted: boolean;
  doc: EntryDoc;
};

/**
 * Read one entry into the document that goes on the wire.
 *
 * Returns null when the entry is gone entirely — a queued row whose txn was
 * deleted outright, which a restore used to leave behind. The drain drops those
 * rather than failing the whole batch.
 */
export async function readEntryDoc(
  db: SQLite.SQLiteDatabase,
  entryId: string,
): Promise<EntryForPush | null> {
  const t = await db.getFirstAsync<TxnRow>(
    `SELECT id, group_id, kind, date, category, note, pay_method,
            recur_freq, recur_interval, recur_end, sync_version, is_deleted
       FROM txn WHERE id = ?`,
    [entryId],
  );
  if (!t) return null;
  // Income never syncs: it is always personal, always ungrouped, and carries no
  // shares. It should never reach the outbox, and if it does it stops here.
  if (t.kind !== 'expense' && t.kind !== 'settlement') return null;

  const [payments, shares, author] = await Promise.all([
    refRows(db, 'txn_payment', entryId),
    refRows(db, 'txn_share', entryId),
    authorRef(db, entryId),
  ]);

  return {
    groupId: t.group_id,
    version: t.sync_version + 1,
    isDeleted: t.is_deleted === 1,
    doc: {
      kind: t.kind,
      date: t.date,
      category: t.category,
      note: t.note,
      payMethod: t.pay_method,
      recurFreq: t.recur_freq,
      recurInterval: t.recur_interval,
      recurEnd: t.recur_end,
      author,
      payments,
      shares,
    },
  };
}

async function refRows(
  db: SQLite.SQLiteDatabase,
  table: 'txn_payment' | 'txn_share',
  entryId: string,
): Promise<Array<{ person: PersonRef; amount: number }>> {
  const rows = await db.getAllAsync<{ person_id: string; remote_uid: string | null; amount: number }>(
    `SELECT r.person_id, p.remote_uid, r.amount
       FROM ${table} r JOIN person p ON p.id = r.person_id
      WHERE r.txn_id = ?`,
    [entryId],
  );
  return rows.map(r => ({ person: { uid: r.remote_uid, pid: r.person_id }, amount: r.amount }));
}

/**
 * Who wrote it. `author_person_id` is NULL for everything this device wrote — the
 * column's default, and the reason it needed no data migration — so that case
 * resolves to me.
 */
async function authorRef(db: SQLite.SQLiteDatabase, entryId: string): Promise<PersonRef> {
  const row = await db.getFirstAsync<{ id: string; remote_uid: string | null }>(
    `SELECT p.id, p.remote_uid
       FROM txn t LEFT JOIN person p ON p.id = COALESCE(t.author_person_id, (SELECT id FROM person WHERE is_me = 1))
      WHERE t.id = ?`,
    [entryId],
  );
  return { uid: row?.remote_uid ?? null, pid: row?.id ?? '' };
}

/** Mark an entry as accepted by the server at this version. */
export async function markSynced(
  db: SQLite.SQLiteDatabase,
  entryId: string,
  version: number,
): Promise<void> {
  await db.runAsync('UPDATE txn SET sync_version = ? WHERE id = ?', [version, entryId]);
}

/**
 * The furthest point this device has pulled a group to.
 *
 * Per group, because groups are pulled independently and a single global cursor
 * would skip everything in group B that happened before the newest change in
 * group A.
 */
export async function pullCursor(db: SQLite.SQLiteDatabase, groupId: string): Promise<number> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?', [cursorKey(groupId)],
  );
  const n = Number(row?.value ?? '0');
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function setPullCursor(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  cursor: number,
): Promise<void> {
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [cursorKey(groupId), String(cursor)],
  );
}

/**
 * `sync.` prefixed, deliberately NOT `fix_`.
 *
 * The backup restore keeps `fix_*` keys out of a backup in both directions,
 * because a migration marker is this device's own state. A cursor is the same
 * kind of thing — but it must NOT be preserved across a restore the way a marker
 * is. A restored database has different entries in it, so an inherited cursor
 * would skip everything between the backup's date and now. Letting it be wiped
 * with the rest of `settings` is the correct behaviour, and this key gets no
 * special treatment for that reason.
 */
const cursorKey = (groupId: string): string => `sync.cursor.${groupId}`;

// --- Translating back, on the receiving device ------------------------------

/**
 * Turn a wire document into something `ingestPeerTxn` will accept.
 *
 * This is where `PersonRef` is resolved back to a local person id, and where an
 * entry naming somebody this device cannot identify is dropped. Refusing is the
 * only safe answer: a share attached to the wrong person is a wrong number in
 * someone's ledger, and nothing downstream will ever catch it.
 */
export function toPeerEnvelope(
  resolve: PersonResolver,
  groupId: string,
  entryId: string,
  version: number,
  isDeleted: boolean,
  doc: EntryDoc,
): PeerEnvelope | null {
  const payments = [];
  for (const p of doc.payments) {
    const id = resolve(p.person);
    if (!id) return null;
    payments.push({ personId: id, amount: p.amount });
  }
  const shares = [];
  for (const s of doc.shares) {
    const id = resolve(s.person);
    if (!id) return null;
    shares.push({ personId: id, amount: s.amount });
  }
  // The author must have an account: `ingestPeerTxn` matches them by
  // `remote_uid`, and an entry with no identifiable author cannot be trusted or
  // reviewed, only guessed at.
  if (!doc.author.uid) return null;

  return {
    authorUid: doc.author.uid,
    groupId,
    entryId,
    version,
    isDeleted,
    kind: doc.kind,
    date: doc.date,
    category: doc.category,
    note: doc.note,
    payMethod: doc.payMethod,
    recurFreq: doc.recurFreq,
    recurInterval: doc.recurInterval,
    recurEnd: doc.recurEnd,
    payments,
    shares,
  };
}

/**
 * Two ways to name a person, tried in order of how much they can be trusted.
 *
 * `remote_uid` first: it is a server account id, global, and the same on every
 * device. The local id is the fallback for members with no account — a flatmate
 * who will never sign in but still owes for the gas — and it only resolves once
 * the roster has been adopted, which is why both travel.
 */
export type PersonResolver = (ref: PersonRef) => string | null;

export async function personResolver(db: SQLite.SQLiteDatabase): Promise<PersonResolver> {
  const rows = await db.getAllAsync<{ id: string; remote_uid: string | null }>(
    'SELECT id, remote_uid FROM person',
  );
  const byUid = new Map(rows.filter(r => r.remote_uid).map(r => [r.remote_uid as string, r.id]));
  const known = new Set(rows.map(r => r.id));
  return (ref: PersonRef) => {
    if (ref.uid && byUid.has(ref.uid)) return byUid.get(ref.uid)!;
    if (known.has(ref.pid)) return ref.pid;
    return null;
  };
}

// --- Disputes (F10) --------------------------------------------------------

export type PendingDispute = {
  txn_id: string;
  group_id: string;
  sync_version: number;
  dispute_state: string;
};

/**
 * Objections of mine that have not reached the author yet.
 *
 * Only for entries in a SHARED group that someone else wrote — objecting to my
 * own entry is meaningless, and a personal group has nobody to tell.
 */
export async function pendingDisputes(db: SQLite.SQLiteDatabase): Promise<PendingDispute[]> {
  return db.getAllAsync<PendingDispute>(
    `SELECT a.txn_id, t.group_id, t.sync_version, a.dispute_state
       FROM txn_approval a
       JOIN txn t ON t.id = a.txn_id
       JOIN budget_group g ON g.id = t.group_id AND g.is_personal = 0
      WHERE a.dispute_state IS NOT NULL AND t.author_person_id IS NOT NULL
      ORDER BY a.decided_at ASC`,
  );
}

/** Forget an objection — only once the server has taken it. */
export async function markDisputeSent(db: SQLite.SQLiteDatabase, txnId: string): Promise<void> {
  await db.runAsync('UPDATE txn_approval SET dispute_state = NULL WHERE txn_id = ?', [txnId]);
}

/**
 * Record what someone said about one of my entries.
 *
 * Matched on the entry id, so an objection about an entry this device does not
 * have is dropped rather than stored against nothing — that happens when someone
 * rejects an entry I have since deleted outright.
 */
export async function recordDispute(
  db: SQLite.SQLiteDatabase,
  txnId: string,
  byUid: string,
  version: number,
  createdAt: number,
  cleared: boolean,
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO txn_dispute (txn_id, by_uid, version, created_at, cleared)
     SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM txn WHERE id = ?)`,
    [txnId, byUid, version, createdAt, cleared ? 1 : 0, txnId],
  );
}

export type TxnDispute = {
  txn_id: string;
  by_uid: string;
  version: number;
  created_at: number;
  cleared: number;
  /** The local person's name, when this device knows who that account is. */
  name: string | null;
};

/**
 * Live objections against one entry.
 *
 * Withdrawn ones are excluded, and so are objections to a version older than the
 * entry's current one: editing in response to an objection should clear it from
 * the author's view, because the thing being objected to no longer exists.
 */
export async function disputesFor(
  db: SQLite.SQLiteDatabase,
  txnId: string,
): Promise<TxnDispute[]> {
  return db.getAllAsync<TxnDispute>(
    `SELECT d.*, p.name
       FROM txn_dispute d
       JOIN txn t ON t.id = d.txn_id
       LEFT JOIN person p ON p.remote_uid = d.by_uid
      WHERE d.txn_id = ? AND d.cleared = 0 AND d.version >= t.sync_version
      ORDER BY d.created_at ASC`,
    [txnId],
  );
}
