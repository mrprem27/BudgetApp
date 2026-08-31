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
  /**
   * The rule this entry is an occurrence of, and which due date it fills.
   *
   * Both optional so an entry from an older build still opens — absent means "a
   * plain entry", which is what every entry was before this existed.
   *
   * They are on the wire for two reasons, and both are about not charging
   * somebody twice. The receiver needs `parentRecurId` to know this is a month of
   * a rule it already accepted, rather than a fresh expense to be approved all
   * over again — approving a rule is meant to be the last time you are asked. And
   * `getClaimedOccurrences` dedupes on `(parent_recur_id, recur_override_date)`,
   * which only works if an arriving occurrence carries them; without that it
   * landed as an unrelated expense claiming nothing, and every device generated
   * its own copy of the same rent.
   *
   * The id is the AUTHOR'S local rule id, like every other id here. It resolves
   * because both devices adopt the same id for the rule (see the roster).
   */
  parentRecurId?: string | null;
  recurOverrideDate?: number | null;
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
  parent_recur_id: string | null;
  recur_override_date: number | null;
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
            recur_freq, recur_interval, recur_end, parent_recur_id, recur_override_date,
            sync_version, is_deleted
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
      parentRecurId: t.parent_recur_id,
      recurOverrideDate: t.recur_override_date,
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
    // `?? null` rather than passed through: an entry sealed by an older build has
    // neither key, and `undefined` would reach the INSERT as a bind error.
    parentRecurId: doc.parentRecurId ?? null,
    recurOverrideDate: doc.recurOverrideDate ?? null,
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

// --- A group that stopped existing on the server ---------------------------

/**
 * The owner deleted this group, or I am no longer in it.
 *
 * **Archived, never deleted.** The entries stay exactly where they are, and that
 * is not caution for its own sake: my share of every one of them has already
 * counted as my spending, in months that are already closed. Deleting them
 * because somebody else pressed a button would silently rewrite my own budget
 * history for a decision that was not mine — and there is no undo for that.
 *
 * So what actually happens is narrow: it leaves the active group list, it stops
 * syncing, and the queue and cursor go so nothing keeps trying. What the user
 * spent is untouched.
 *
 * Returns whether anything changed, so a sync that finds nothing new does not
 * announce it.
 */
export async function archiveVanishedGroup(
  db: SQLite.SQLiteDatabase,
  groupId: string,
): Promise<boolean> {
  const row = await db.getFirstAsync<{ is_archived: number }>(
    'SELECT is_archived FROM budget_group WHERE id = ?', [groupId],
  );
  // Not a group this device has, or already dealt with. Either way, nothing to say.
  if (!row || row.is_archived === 1) return false;

  await db.runAsync('UPDATE budget_group SET is_archived = 1 WHERE id = ?', [groupId]);
  // Nothing left to deliver, and nowhere to deliver it. Left behind, these are the
  // same dangling rows a restore and a group delete both used to leave.
  await db.runAsync('DELETE FROM sync_outbox WHERE group_id = ?', [groupId]);
  await db.runAsync('DELETE FROM settings WHERE key = ? OR key = ?', [
    cursorKey(groupId), cursorKey(`${groupId}#disputes`),
  ]);
  return true;
}

// --- The roster: how a group arrives on a phone that has never seen it -------

/**
 * Reserved entry id carrying a group's identity and its members.
 *
 * Sent as an ordinary sealed entry, which is the whole trick: it inherits the
 * versioning, the compare-and-set, the AAD binding and the encryption for free,
 * and **the server needs no change and learns no names**. It already stores
 * opaque blobs per `(group_id, entry_id)`; this is one more of them.
 *
 * Double-underscored because `entry_id` is otherwise a uuid — nothing the app
 * generates can collide with it.
 */
export const ROSTER_ENTRY_ID = '__roster__';

export type RosterMember = {
  /** The publisher's local person id. What entries name when there is no account. */
  pid: string;
  /** Their account id, when they have one. Global, so it matches across devices. */
  uid: string | null;
  name: string;
  color: string;
};

export type RosterDoc = {
  name: string;
  icon: string;
  color: string;
  members: RosterMember[];
};

/**
 * The group as its publisher sees it.
 *
 * Names travel because the alternative is a group full of "Unknown" — the entries
 * reference people by id, and an id is not something anyone can recognise. They
 * are sealed with the group key like everything else, so this adds nothing the
 * server can read.
 */
export async function readRosterDoc(
  db: SQLite.SQLiteDatabase,
  groupId: string,
): Promise<RosterDoc | null> {
  const g = await db.getFirstAsync<{ name: string; icon: string; color: string }>(
    'SELECT name, icon, color FROM budget_group WHERE id = ?', [groupId],
  );
  if (!g) return null;

  const members = await db.getAllAsync<RosterMember>(
    `SELECT p.id AS pid, p.remote_uid AS uid, p.name AS name, p.avatar_color AS color
       FROM group_member m JOIN person p ON p.id = m.person_id
      WHERE m.group_id = ?`,
    [groupId],
  );
  return { name: g.name, icon: g.icon, color: g.color, members };
}

/** Someone on the roster who looks like someone this device already has. */
export type NameCollision = {
  /** The row just created from the roster. */
  incomingId: string;
  /** The person already here with the same name. */
  existingId: string;
  name: string;
};

/**
 * Make a group real on this device, from a roster somebody else published.
 *
 * Without this the whole receiving half of sharing does nothing: `ingestPeerTxn`
 * looks the group up locally, does not find it, and refuses every entry as
 * `not-a-member` — silently, on every sync, forever.
 *
 * Three rules, in this order, for each person on the roster:
 *
 * 1. **Known account wins.** A local person carrying that `remote_uid` IS them;
 *    nothing is created. This is what makes "me" resolve to my own row rather
 *    than a copy of myself.
 * 2. **Adopt their id.** Otherwise a person row is created *using the publisher's
 *    pid as its primary key*, because that is the id their entries name. Minting
 *    a fresh uuid here would mean every entry referenced somebody who does not
 *    exist.
 * 3. **Never merge silently.** A new row whose name matches somebody already here
 *    is REPORTED, not merged. Guessing wrong splits a balance across two rows
 *    that never reconcile — the same defect as F5 — and guessing right is not
 *    worth the times it does not.
 *
 * Returns the collisions, for the caller to ask about.
 */
export async function adoptGroup(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  doc: RosterDoc,
): Promise<NameCollision[]> {
  const collisions: NameCollision[] = [];

  const existing = await db.getAllAsync<{ id: string; name: string; remote_uid: string | null; is_me: number }>(
    'SELECT id, name, remote_uid, is_me FROM person',
  );
  const byUid = new Map(existing.filter(p => p.remote_uid).map(p => [p.remote_uid!, p.id]));
  const haveId = new Set(existing.map(p => p.id));

  await db.withTransactionAsync(async () => {
    // The group itself, under the SHARED id — that is what adoption means, and it
    // is why no id mapping exists anywhere in the sync path.
    await db.runAsync(
      `INSERT OR IGNORE INTO budget_group
         (id, name, icon, color, carry_over, is_shared, is_archived, is_personal,
          simplify_debt, default_split, created_at)
       VALUES (?, ?, ?, ?, 0, 1, 0, 0, 1, 'equal', ?)`,
      [groupId, doc.name, doc.icon, doc.color, Date.now()],
    );

    for (const m of doc.members) {
      const mine = m.uid ? byUid.get(m.uid) : undefined;
      const localId = mine ?? m.pid;

      if (!mine && !haveId.has(m.pid)) {
        await db.runAsync(
          'INSERT INTO person (id, name, avatar_color, is_me, remote_uid) VALUES (?, ?, ?, 0, ?)',
          [m.pid, m.name, m.color, m.uid],
        );
        haveId.add(m.pid);
        // Same name, different row. Reported rather than resolved — see rule 3.
        const clash = existing.find(p => p.id !== m.pid && sameName(p.name, m.name));
        if (clash) collisions.push({ incomingId: m.pid, existingId: clash.id, name: m.name });
      }

      await db.runAsync(
        'INSERT OR IGNORE INTO group_member (group_id, person_id, joined_at, role) VALUES (?, ?, ?, ?)',
        [groupId, localId, Date.now(), 'member'],
      );
    }
  });

  return collisions;
}

/** Case- and space-insensitive: "priya " and "Priya" are the same suspicion. */
function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// --- Keeping the roster current --------------------------------------------

/**
 * The roster is a living document, not a one-shot.
 *
 * It used to be published once, when a group was shared. Everything after that —
 * adding a flatmate, renaming the group, someone changing their own name — never
 * reached the other phones. And a stale roster is not merely cosmetic: an entry
 * naming a member the other device has never heard of cannot be resolved, so it
 * is refused. Adding somebody to a shared group silently broke every entry that
 * mentioned them.
 *
 * `dirty` is the same idea as `sync_outbox`, one row wide: the write path marks
 * it, the drain publishes it and clears it. Kept in `settings` rather than a
 * table because it is one flag per group and outlives nothing.
 */
const ROSTER_DIRTY = (groupId: string): string => `sync.roster.dirty.${groupId}`;
const ROSTER_VERSION = (groupId: string): string => `sync.roster.version.${groupId}`;

/**
 * Mark a shared group's roster as needing republishing.
 *
 * Personal groups are excluded in the SQL, not at the call site, for the same
 * reason `queueEntry` is: a writer that has to remember cannot be relied upon to.
 */
export async function markRosterDirty(
  db: SQLite.SQLiteDatabase,
  groupId: string,
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO settings (key, value)
     SELECT ?, '1' WHERE EXISTS (SELECT 1 FROM budget_group WHERE id = ? AND is_personal = 0)`,
    [ROSTER_DIRTY(groupId), groupId],
  );
}

/** Groups whose roster has changed since it was last published. */
export async function dirtyRosters(db: SQLite.SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ key: string }>(
    "SELECT key FROM settings WHERE key LIKE 'sync.roster.dirty.%'",
  );
  return rows.map(r => r.key.slice('sync.roster.dirty.'.length));
}

export async function clearRosterDirty(db: SQLite.SQLiteDatabase, groupId: string): Promise<void> {
  await db.runAsync('DELETE FROM settings WHERE key = ?', [ROSTER_DIRTY(groupId)]);
}

/**
 * The next version to publish this roster at.
 *
 * A real stored counter, because the server compare-and-sets on it. The previous
 * code guessed by trying 1, 2, 3 and giving up — which silently stopped
 * republishing on the fourth change a group ever had.
 */
export async function nextRosterVersion(
  db: SQLite.SQLiteDatabase,
  groupId: string,
): Promise<number> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?', [ROSTER_VERSION(groupId)],
  );
  return (Number(row?.value ?? 0) || 0) + 1;
}

export async function setRosterVersion(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  version: number,
): Promise<void> {
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [ROSTER_VERSION(groupId), String(version)],
  );
}
