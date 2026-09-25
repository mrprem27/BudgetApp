import { scopesFor, type Db, type RevokedWhy } from './utils/access';

/**
 * `POST /sync/pull` (SPEC-SERVER.md §3.3).
 *
 * For every scope the user can read: the rows written since the phone's cursor,
 * in `seq` order, tombstones included. A scope the phone has never seen starts at
 * 0 — joining a group needs no special path, its whole history just arrives. Groups
 * the user can no longer read are listed as `revoked`, so the phone archives them
 * instead of silently syncing nothing forever.
 *
 * Two rules keep a cursor honest:
 *   * ONE PAGE IS ONE SNAPSHOT. Every read for a page runs in a single D1 batch,
 *     which is one transaction — children always match their parents.
 *   * A PAGE NEVER SPLITS A SEQ. One write stamps several rows with the same seq
 *     (a group and its owner's membership; a transaction and its activity row).
 *     Cutting inside one would put the rest behind the cursor for good, so the cut
 *     always lands on a seq boundary.
 */

export const PULL_PAGE_ROWS = 500;

const USER_TABLES = [
  'profiles', 'friends', 'group_preferences', 'categories', 'assets', 'savings_goals', 'savings_transactions',
  'money_profiles', 'user_preferences', 'imported_transactions', 'approvals', 'trust_settings', 'activity_log',
] as const;
const GROUP_TABLES = ['groups', 'group_members', 'budgets', 'transactions', 'disputes', 'activity_log'] as const;

type Row = Record<string, unknown> & { seq: number };

export type PulledScope = {
  id: string;
  kind: 'user' | 'group';
  /** The cursor to send next time. */
  cursor: number;
  /** True when the phone's cursor was ahead of the server (e.g. a wiped dev database): rebuild this scope. */
  reset: boolean;
  more: boolean;
  /** The scope's latest seq. `cursor / head` is how far through it the phone is — the percentage a restore shows. */
  head: number;
  rows: Record<string, Row[]>;
};

export type PullResult = {
  scopes: PulledScope[];
  revoked: string[];
  /** Why each revoked group went: its owner deleted it, an admin removed me, or I left. */
  revokedWhy: Record<string, RevokedWhy>;
  lastMutationId: number;
  rejections: Array<{ mutationId: number; code: string; message: string; current: unknown }>;
  /**
   * Groups this user has been invited to and not answered. An invitation grants
   * no read access (`scopesFor`), so without this the invitee could never learn
   * of it. Answering is a `group_members` mutation on their own row.
   */
  invites: Array<{ groupId: string; groupName: string; memberId: string; invitedBy: string | null; invitedAt: number }>;
};

/** The SELECT for one table's page. Joins add the facts a person row would carry. */
function selectFor(table: string): string {
  // The owner as a PERSON — the phone's `created_by` names a person, not an account.
  if (table === 'groups') {
    return `SELECT t.*, p.id AS owner_person_id FROM groups t LEFT JOIN people p ON p.user_id = t.owner_id
             WHERE t.scope_id = ? AND t.seq > ? ORDER BY t.seq LIMIT ?`;
  }
  // Who did it, as a person — the phone's audit_log names people.
  if (table === 'activity_log') {
    return `SELECT t.*, p.id AS actor_person_id FROM activity_log t LEFT JOIN people p ON p.user_id = t.actor_id
             WHERE t.scope_id = ? AND t.seq > ? ORDER BY t.seq LIMIT ?`;
  }
  if (table === 'group_members' || table === 'friends') {
    // `merged_into`: a placeholder now known to be an account (S21) — each phone
    // folds its copy of them into the account's person.
    return `SELECT t.*, p.user_id AS person_user_id, p.merged_into AS person_merged_into
              FROM ${table} t JOIN people p ON p.id = t.person_id
             WHERE t.scope_id = ? AND t.seq > ? ORDER BY t.seq LIMIT ?`;
  }
  // Only about entries I can read. An invitee is asked about an entry the moment
  // it names them, but can't see it until they accept; the question arrives with
  // the group (accepting re-sequences it — `members.ts`), never before it.
  if (table === 'approvals') {
    return `SELECT * FROM approvals t WHERE t.scope_id = ? AND t.seq > ?
               AND EXISTS (SELECT 1 FROM transactions x
                             JOIN group_members m ON m.group_id = x.group_id AND m.status = 'active' AND m.deleted_at IS NULL
                             JOIN people p ON p.id = m.person_id AND p.user_id = t.user_id
                            WHERE x.id = t.transaction_id)
             ORDER BY t.seq LIMIT ?`;
  }
  return `SELECT * FROM ${table} WHERE scope_id = ? AND seq > ? ORDER BY seq LIMIT ?`;
}

/** Children of the transactions a page could contain, read in the same snapshot. */
const CHILDREN = {
  payers: 'SELECT transaction_id, person_id, amount FROM transaction_payers',
  splits: 'SELECT transaction_id, person_id, amount FROM transaction_splits',
  items: 'SELECT * FROM transaction_items',
  tags: 'SELECT transaction_id, tag, position FROM transaction_tags',
  recurrence: 'SELECT * FROM recurring_rules',
  skips: 'SELECT rule_id AS transaction_id, occurrence_date FROM recurring_skips',
} as const;
const CHILD_KEYS = Object.keys(CHILDREN) as Array<keyof typeof CHILDREN>;
const childKey = (k: keyof typeof CHILDREN) => (k === 'skips' ? 'rule_id' : 'transaction_id');

type Children = Map<keyof typeof CHILDREN, Array<Record<string, unknown>>>;

/** A transaction as the phone receives it: the row, with its payers, splits, items, tags, recurrence and skips. */
function asBundle(t: Record<string, unknown>, children: Children): Record<string, unknown> {
  const mine = (k: keyof typeof CHILDREN) => (children.get(k) ?? []).filter(c => c.transaction_id === t.id);
  const strip = (list: Array<Record<string, unknown>>) => list.map(({ transaction_id: _, ...rest }) => rest);
  const recurrence = mine('recurrence')[0];
  return {
    ...t,
    payers: strip(mine('payers')),
    splits: strip(mine('splits')),
    items: strip(mine('items')),
    tags: mine('tags').sort((a, b) => (a.position as number) - (b.position as number)).map(x => x.tag as string),
    recurrence: recurrence ? strip([recurrence])[0] : null,
    skips: mine('skips').map(x => x.occurrence_date as number),
  };
}

/**
 * One transaction's full bundle, exactly as a pull delivers it. A conflict hands
 * this back as the server's copy: the bare row would replace the phone's
 * transaction with one that has no payers — the money gone from that phone.
 */
export async function transactionBundle(db: Db, row: Record<string, unknown>): Promise<Record<string, unknown>> {
  const keys = CHILD_KEYS;
  const results = await db.batch(keys.map(k => db.prepare(`${CHILDREN[k]} WHERE ${childKey(k)} = ?`).bind(row.id)));
  return asBundle(row, new Map(keys.map((k, i) => [k, results[i].results as Array<Record<string, unknown>>])));
}

/**
 * One scope's next page. A page never splits a seq, so when one seq holds more
 * rows than a page (a single write that re-stamps many rows — accepting an
 * invite, a merge) the page grows until that seq fits, or the phone would be
 * handed the same empty page forever.
 */
async function pullScope(
  db: Db, scopeId: string, kind: 'user' | 'group', cursor: number, limit: number,
): Promise<PulledScope> {
  for (let size = limit; ; size *= 4) {
    const page = await readPage(db, scopeId, kind, cursor, size);
    if (page.cursor > cursor || !page.more) return page;
  }
}

async function readPage(
  db: Db, scopeId: string, kind: 'user' | 'group', cursor: number, limit: number,
): Promise<PulledScope> {
  const tables = kind === 'user' ? USER_TABLES : GROUP_TABLES;
  const txnPage = 'SELECT id FROM transactions WHERE scope_id = ? AND seq > ? ORDER BY seq LIMIT ?';
  const reads = [
    db.prepare('SELECT seq FROM sync_scopes WHERE id = ?').bind(scopeId),
    ...tables.map(t => db.prepare(selectFor(t)).bind(scopeId, cursor, limit + 1)),
    ...(kind === 'group'
      ? CHILD_KEYS.map(k =>
        db.prepare(`${CHILDREN[k]} WHERE ${childKey(k)} IN (${txnPage})`).bind(scopeId, cursor, limit + 1))
      : []),
  ];
  const results = await db.batch(reads);
  const serverSeq = ((results[0].results as Array<{ seq: number }>)[0]?.seq) ?? 0;

  // The phone is ahead of the server: the server was reset. Start this scope over.
  if (cursor > serverSeq) return { ...(await pullScope(db, scopeId, kind, 0, limit)), reset: true };

  const byTable = new Map<string, Row[]>();
  tables.forEach((t, i) => byTable.set(t, results[i + 1].results as Row[]));

  // How far every table is known to be complete. Each was read up to limit+1 rows;
  // one that filled that may hold more rows at its last seen seq, so it is only
  // complete strictly below it. (Every write stamps one seq, so progress is certain.)
  let complete = serverSeq;
  for (const t of tables) {
    const r = byTable.get(t) ?? [];
    if (r.length > limit) complete = Math.min(complete, r[limit].seq - 1);
  }
  // Then cap the page at `limit` rows — cutting only on a seq boundary.
  const merged = [...byTable.values()].flat().filter(r => r.seq <= complete).sort((a, b) => a.seq - b.seq);
  const cut = merged.length > limit ? merged[limit - 1].seq : complete;
  const more = cut < serverSeq;

  const rows: Record<string, Row[]> = {};
  for (const t of tables) {
    const kept = (byTable.get(t) ?? []).filter(r => r.seq <= cut);
    if (kept.length) rows[t] = kept;
  }

  if (kind === 'group' && rows.transactions) {
    const keys = CHILD_KEYS;
    const children = new Map(keys.map((k, i) => [k, results[1 + tables.length + i].results as Array<Record<string, unknown>>]));
    rows.transactions = rows.transactions.map(t => asBundle(t, children) as Row);
  }

  return { id: scopeId, kind, cursor: cut, reset: false, more, head: serverSeq, rows };
}

export async function pull(
  db: Db,
  userId: string,
  deviceId: string,
  cursors: Record<string, number>,
  rejectionsAfter = 0,
  limit = PULL_PAGE_ROWS,
): Promise<PullResult> {
  const { readable, revoked, revokedWhy } = await scopesFor(db, userId);
  const scopes: PulledScope[] = [];
  for (const id of readable) {
    const raw = cursors[id];
    const cursor = Number.isInteger(raw) && raw > 0 ? raw : 0;
    scopes.push(await pullScope(db, id, id === userId ? 'user' : 'group', cursor, limit));
  }
  const device = await db.prepare('SELECT last_mutation_id FROM devices WHERE id = ? AND user_id = ?')
    .bind(deviceId, userId).first<number>('last_mutation_id');
  const rejections = await db.prepare(
    `SELECT mutation_id, code, message, current FROM sync_rejections
      WHERE device_id = ? AND mutation_id > ? ORDER BY mutation_id`,
  ).bind(deviceId, rejectionsAfter).all<{ mutation_id: number; code: string; message: string; current: string | null }>();
  const invites = await db.prepare(
    `SELECT m.group_id, g.name AS group_name, m.id AS member_id, u.name AS invited_by, m.updated_at
       FROM group_members m
       JOIN people p ON p.id = m.person_id
       JOIN groups g ON g.id = m.group_id
       LEFT JOIN users u ON u.id = m.invited_by
      WHERE p.user_id = ? AND m.status = 'invited' AND m.deleted_at IS NULL AND g.deleted_at IS NULL
      ORDER BY m.updated_at`,
  ).bind(userId).all<{ group_id: string; group_name: string; member_id: string; invited_by: string | null; updated_at: number }>();
  return {
    scopes,
    revoked,
    revokedWhy,
    invites: (invites.results ?? []).map(r => ({
      groupId: r.group_id, groupName: r.group_name, memberId: r.member_id, invitedBy: r.invited_by, invitedAt: r.updated_at,
    })),
    lastMutationId: device ?? 0,
    rejections: (rejections.results ?? []).map(r => ({
      mutationId: r.mutation_id, code: r.code, message: r.message,
      current: r.current === null ? null : JSON.parse(r.current),
    })),
  };
}

/** Validate a pull body. */
export function parsePull(body: unknown): { deviceId: string; cursors: Record<string, number>; rejectionsAfter: number } | string {
  if (!body || typeof body !== 'object') return 'Invalid JSON body';
  const b = body as Record<string, unknown>;
  if (typeof b.deviceId !== 'string' || !b.deviceId.trim()) return 'deviceId is required';
  const cursors: Record<string, number> = {};
  if (b.cursors !== undefined) {
    if (!b.cursors || typeof b.cursors !== 'object' || Array.isArray(b.cursors)) return 'cursors must be an object';
    for (const [k, v] of Object.entries(b.cursors as Record<string, unknown>)) {
      if (!Number.isInteger(v) || (v as number) < 0) return 'every cursor is a non-negative integer';
      cursors[k] = v as number;
    }
  }
  const after = b.rejectionsAfter ?? 0;
  if (!Number.isInteger(after) || (after as number) < 0) return 'rejectionsAfter is a non-negative integer';
  return { deviceId: b.deviceId.trim(), cursors, rejectionsAfter: after as number };
}
