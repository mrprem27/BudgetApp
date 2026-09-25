import type * as SQLite from 'expo-sqlite';
import {
  assetToServer, budgetToServer, categoryToServer, friendToPerson, goalToServer, groupPreferenceToServer, groupToServer,
  importToServer, isMe, meToProfile, memberToPerson, memberToServer, moneyProfileToServer, MONEY_KEYS, personToFriend, profileToMe,
  savingsTxnToServer, serverToApproval, serverToAudit, serverToBudget, serverToCategory, serverToDispute, serverToGroup,
  serverToMember, serverToMoneySettings, serverToTxn, simpleToLocal, trustToServer, txnToServer,
  type MapContext, type Outgoing, type Row,
} from '../../lib/sync/rowMap';
import { selfPersonId, syncIds } from '../../lib/sync/ids';
import { isQueued, MONEY_PROFILE_ID, queueAnswer, setServerVersion, type QueueRow, type Sent } from './syncQueue';

/**
 * The sync engine's SQL (SPEC-SERVER.md §3.4): reading queued rows into
 * server mutations, and applying pulled server rows to the phone.
 *
 * Two rules, and both are about not losing a change:
 *
 *   * THE PULL NEVER ECHOES. Nothing here queues anything — it writes what the
 *     server already holds (`syncQueueCoverage.test.ts` exempts this file whole).
 *   * A PENDING LOCAL CHANGE WINS. A row still waiting to go up is not overwritten
 *     by a pulled copy of itself: the local change is newer, and the server will
 *     answer it — by accepting it, or with a rejection the engine then applies.
 */

// ---------------------------------------------------------------------------
// Device-local sync state (settings keys; never backed up, never synced)
// ---------------------------------------------------------------------------

const K = {
  deviceId: 'sync2.device_id',
  nextMutation: 'sync2.next_mutation_id',
  rejectionsAfter: 'sync2.rejections_after',
  cursor: (scope: string) => `sync2.cursor.${scope}`,
  linked: 'sync2.linked_user',
  lastSynced: 'sync2.last_synced_at',
  invites: 'sync2.invites',
  rejections: 'sync2.rejections',
};

async function getSetting(db: SQLite.SQLiteDatabase, key: string): Promise<string | null> {
  return (await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]))?.value ?? null;
}
async function setSetting(db: SQLite.SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
}

/** A stable id for this install. Minted once. A restore mints a new one, with a fresh counter. */
export async function deviceId(db: SQLite.SQLiteDatabase, mint: () => string): Promise<string> {
  const existing = await getSetting(db, K.deviceId);
  if (existing) return existing;
  const id = mint();
  await setSetting(db, K.deviceId, id);
  return id;
}

/** Reserve `n` mutation ids, strictly increasing across every push this device ever makes. */
export async function reserveMutationIds(db: SQLite.SQLiteDatabase, n: number): Promise<number> {
  const next = Number(await getSetting(db, K.nextMutation) ?? '1') || 1;
  await setSetting(db, K.nextMutation, String(next + n));
  return next;
}

export async function cursors(db: SQLite.SQLiteDatabase): Promise<Record<string, number>> {
  const rows = await db.getAllAsync<{ key: string; value: string }>("SELECT key, value FROM settings WHERE key LIKE 'sync2.cursor.%'");
  return Object.fromEntries(rows.map(r => [r.key.slice('sync2.cursor.'.length), Number(r.value) || 0]));
}
export async function rejectionsAfter(db: SQLite.SQLiteDatabase): Promise<number> {
  return Number(await getSetting(db, K.rejectionsAfter) ?? '0') || 0;
}
export async function setRejectionsAfter(db: SQLite.SQLiteDatabase, n: number): Promise<void> {
  await setSetting(db, K.rejectionsAfter, String(n));
}

/** Which account this phone's ledger is joined to. Null until a first sign-in completes (§4). */
export async function linkedUser(db: SQLite.SQLiteDatabase): Promise<string | null> {
  return getSetting(db, K.linked);
}
export async function setLinkedUser(db: SQLite.SQLiteDatabase, userId: string | null): Promise<void> {
  if (userId === null) await db.runAsync("DELETE FROM settings WHERE key = ? OR key LIKE 'sync2.cursor.%'", [K.linked]);
  else await setSetting(db, K.linked, userId);
}

/** When a sync last finished cleanly — "Up to date · 2 min ago". Null before the first. */
export async function lastSyncedAt(db: SQLite.SQLiteDatabase): Promise<number | null> {
  const v = await getSetting(db, K.lastSynced);
  return v ? Number(v) || null : null;
}
export async function setLastSyncedAt(db: SQLite.SQLiteDatabase, at: number): Promise<void> {
  await setSetting(db, K.lastSynced, String(at));
}

/** A group someone added me to, which I haven't answered (S18–S20). Replaced by every pull. */
export type PendingInvite = { groupId: string; groupName: string; memberId: string; invitedBy: string | null; invitedAt: number };

export async function pendingInvites(db: SQLite.SQLiteDatabase): Promise<PendingInvite[]> {
  try { return JSON.parse(await getSetting(db, K.invites) ?? '[]') as PendingInvite[]; } catch { return []; }
}
export async function setInvites(db: SQLite.SQLiteDatabase, invites: PendingInvite[]): Promise<void> {
  // One already answered stays hidden until the server has it, or it would reappear.
  const answered = new Set((await db.getAllAsync<{ local_id: string }>(
    "SELECT local_id FROM sync_queue WHERE local_table = 'group_invite'",
  )).map(r => r.local_id));
  await setSetting(db, K.invites, JSON.stringify(invites.filter(i => !answered.has(i.memberId))));
}

/**
 * Accept or decline an invitation. Queued like any change — the answer is mine
 * and survives being offline — and the group arrives with the next pull.
 */
export async function answerInvite(db: SQLite.SQLiteDatabase, invite: PendingInvite, accept: boolean): Promise<void> {
  const personId = invite.memberId.slice(invite.groupId.length + 1);
  await db.withTransactionAsync(async () => {
    await queueAnswer(db, 'group_invite', invite.memberId, {
      group_id: invite.groupId, person_id: personId, status: accept ? 'active' : 'left',
    });
    await setSetting(db, K.invites, JSON.stringify((await pendingInvites(db)).filter(i => i.memberId !== invite.memberId)));
  });
}

export type RecordedRejection = {
  mutationId: number; code: string; message: string; entity: string; entityId: string; at: number;
  /**
   * A money conflict on a transaction (S17): this phone's version, as it was
   * sent, and the server's, which has already replaced it here. Kept so "Keep
   * yours or theirs?" can offer both — never merged (principle 5).
   */
  yours?: Row;
  theirs?: Row;
  /** Answered: kept one side, or dismissed a refusal. The record stays, for History's sake. */
  resolved?: boolean;
};

/** The last few refusals, for the surfaces that explain them (S17). */
export async function recordedRejections(db: SQLite.SQLiteDatabase): Promise<RecordedRejection[]> {
  try { return JSON.parse(await getSetting(db, K.rejections) ?? '[]') as RecordedRejection[]; } catch { return []; }
}
async function recordRejection(db: SQLite.SQLiteDatabase, r: RecordedRejection): Promise<void> {
  const list = [r, ...await recordedRejections(db)].slice(0, 50);
  await setSetting(db, K.rejections, JSON.stringify(list));
}

/** Mark one refusal or conflict answered. */
export async function resolveRejection(db: SQLite.SQLiteDatabase, mutationId: number): Promise<void> {
  const list = (await recordedRejections(db)).map(r => (r.mutationId === mutationId ? { ...r, resolved: true } : r));
  await setSetting(db, K.rejections, JSON.stringify(list));
}

// ---------------------------------------------------------------------------
// Queue row → server mutations
// ---------------------------------------------------------------------------

export type Outbound = Outgoing & { op: 'upsert' | 'delete' };
/** What one queue row becomes. `null` = not sendable yet (stays queued); `[]` = nothing to send (drop it). */
export type Built = Outbound[] | null;

const up = (o: Outgoing): Outbound => ({ ...o, op: 'upsert' });
const del = (entity: string, entityId: string): Outbound => ({ entity, entityId, data: {}, op: 'delete' });
const snap = (row: QueueRow): Row => (row.snapshot ? JSON.parse(row.snapshot) as Row : {});

export async function buildOutbound(db: SQLite.SQLiteDatabase, row: QueueRow, ctx: MapContext): Promise<Built> {
  const one = (sql: string, params: SQLite.SQLiteBindValue[] = [row.local_id]) => db.getFirstAsync<Row>(sql, params);
  switch (row.local_table) {
    case 'asset': {
      if (row.op === 'delete') return [del('assets', row.local_id)];
      const r = await one('SELECT * FROM asset WHERE id = ?');
      return r ? [up(assetToServer(r))] : [];
    }
    case 'savings_goal': {
      if (row.op === 'delete') return [del('savings_goals', row.local_id)];
      const r = await one('SELECT * FROM savings_goal WHERE id = ?');
      return r ? [up(goalToServer(r))] : [];
    }
    case 'savings_txn': {
      if (row.op === 'delete') return [del('savings_transactions', row.local_id)];
      const r = await one('SELECT * FROM savings_txn WHERE id = ?');
      return r ? [up(savingsTxnToServer(r))] : [];
    }
    case 'pending_txn': {
      if (row.op === 'delete') return [del('imported_transactions', row.local_id)];
      const r = await one('SELECT * FROM pending_txn WHERE id = ?');
      return r ? [up(importToServer(r))] : [];
    }
    case 'person': {
      if (row.op === 'delete') return [del('friends', syncIds.friend(ctx.userId, row.local_id))];
      const p = await one('SELECT * FROM person WHERE id = ?');
      if (!p) return [];
      if (isMe(String(p.id), ctx)) return [up(meToProfile(p, ctx))];
      return [up(personToFriend(p, ctx)), up(trustToServer(String(p.id), null, String(p.trust_state ?? 'review'), ctx))];
    }
    case 'person_group_trust': {
      const [personId, groupId] = row.local_id.split('|');
      if (row.op === 'delete') return [del('trust_settings', syncIds.trust(ctx.userId, personId, groupId))];
      const t = await one('SELECT * FROM person_group_trust WHERE person_id = ? AND group_id = ?', [personId, groupId]);
      return t ? [up(trustToServer(personId, groupId, String(t.trust_state), ctx))] : [];
    }
    case 'budget_group': {
      const g = await one('SELECT * FROM budget_group WHERE id = ?');
      if (!g) return [];
      const pref = up(groupPreferenceToServer(g, ctx));
      if (g.deleted_at != null) return [del('groups', String(g.id)), pref];
      return [up(groupToServer(g)), pref];
    }
    case 'group_member': {
      const [groupId, personId] = row.local_id.split('|');
      const [m, p, g] = await Promise.all([
        one('SELECT * FROM group_member WHERE group_id = ? AND person_id = ?', [groupId, personId]),
        one('SELECT * FROM person WHERE id = ?', [personId]),
        one('SELECT is_personal FROM budget_group WHERE id = ?', [groupId]),
      ]);
      // A personal group has only its owner, whom the server made with the group.
      if (!m || !p || !g || g.is_personal === 1) return [];
      const out = memberToServer(m, p, ctx);
      // An account is invited by account: the server answers for who they are.
      if (p.remote_uid && !isMe(personId, ctx)) {
        const accountPerson = selfPersonId(String(p.remote_uid));
        return [up({
          ...out,
          entityId: syncIds.member(groupId, accountPerson),
          data: { ...out.data, person_id: accountPerson, user_id: p.remote_uid },
        })];
      }
      return [up(out)];
    }
    case 'group_invite':
      // My answer — the snapshot is the whole mutation.
      return [up({ entity: 'group_members', entityId: row.local_id, data: snap(row) })];
    case 'person_merge':
      // The placeholder's old id is the whole question; the server finds the rest.
      return [up({ entity: 'person_merges', entityId: row.local_id, data: snap(row) })];
    case 'txn_approval':
      // Likewise: my answer to their entry, in my own scope on the server.
      return [up({ entity: 'approvals', entityId: syncIds.approval(row.local_id, ctx.userId), data: snap(row) })];
    case 'txn': {
      const t = await one('SELECT * FROM txn WHERE id = ?');
      if (!t || t.author_person_id != null) return [];   // not mine to send
      if (t.is_deleted === 1) return [del('transactions', String(t.id))];
      const [payments, shares, items, skips] = await Promise.all([
        db.getAllAsync<Row>('SELECT * FROM txn_payment WHERE txn_id = ?', [row.local_id]),
        db.getAllAsync<Row>('SELECT * FROM txn_share WHERE txn_id = ?', [row.local_id]),
        db.getAllAsync<Row>('SELECT * FROM line_item WHERE txn_id = ?', [row.local_id]),
        db.getAllAsync<{ occurrence_date: number }>('SELECT occurrence_date FROM recur_skip WHERE series_id = ? ORDER BY occurrence_date', [row.local_id]),
      ]);
      return [up(txnToServer({ txn: t, payments, shares, items, skips: skips.map(s => s.occurrence_date) }, ctx))];
    }
    case 'category': {
      if (row.op === 'delete') {
        const s = snap(row);
        return [del('categories', syncIds.category(ctx.userId, String(s.kind), String(s.name)))];
      }
      const c = await one('SELECT * FROM category WHERE id = ?');
      return c ? [up(categoryToServer(c, ctx))] : [];
    }
    case 'category_budget': {
      if (row.op === 'delete') {
        const s = snap(row);
        return [del('budgets', syncIds.budget(String(s.group_id), String(s.category), (s.person_id ?? null) as string | null))];
      }
      const b = await one('SELECT * FROM category_budget WHERE id = ?');
      return b ? [up(budgetToServer(b))] : [];
    }
    case 'settings': {
      const rows = await db.getAllAsync<{ key: string; value: string }>("SELECT key, value FROM settings WHERE key LIKE 'money.%'");
      const out = moneyProfileToServer(Object.fromEntries(rows.map(r => [r.key, r.value])), ctx);
      return out ? [up(out)] : [];
    }
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Pulled rows → the phone
// ---------------------------------------------------------------------------

type PulledScope = { id: string; kind: 'user' | 'group'; rows: Record<string, Row[]> };

/** INSERT a row, or UPDATE only the given columns — never touching phone-only columns. */
async function upsert(db: SQLite.SQLiteDatabase, table: string, key: string[], row: Row): Promise<void> {
  const cols = Object.keys(row).filter(c => row[c] !== undefined);
  const updates = cols.filter(c => !key.includes(c));
  await db.runAsync(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
     ON CONFLICT(${key.join(', ')}) DO ${updates.length ? `UPDATE SET ${updates.map(c => `${c} = excluded.${c}`).join(', ')}` : 'NOTHING'}`,
    cols.map(c => row[c]) as SQLite.SQLiteBindValue[],
  );
}

/** The pulled row's server version, remembered as the base for the next money write. */
/**
 * Record the server's version of a row — only once its content is APPLIED here.
 * A row skipped because this phone still has a change waiting must keep its old
 * version, so that change goes up against the version it was made on and a newer
 * edit from someone else is refused as a conflict, never silently overwritten.
 */
async function version(db: SQLite.SQLiteDatabase, entity: string, r: Row): Promise<void> {
  if (typeof r.version === 'number') await setServerVersion(db, entity, String(r.id), r.version);
}

/** Apply one scope's page, in ONE local transaction, and move its cursor with it. */
export async function applyScope(db: SQLite.SQLiteDatabase, scope: PulledScope & { cursor: number }, ctx: MapContext): Promise<void> {
  await db.withTransactionAsync(async () => {
    await applyRows(db, scope, ctx);
    await setSetting(db, K.cursor(scope.id), String(scope.cursor));
  });
}

/** Apply server-shaped rows with no cursor move. Runs inside the caller's transaction. */
export async function applyRows(db: SQLite.SQLiteDatabase, scope: PulledScope, ctx: MapContext): Promise<void> {
  const rows = (t: string) => scope.rows[t] ?? [];

  // --- me, and the people I have saved ---------------------------------------
  for (const p of rows('profiles')) {
    await version(db, 'profiles', p);
    const me = profileToMe(p, ctx);
    if (await isQueued(db, 'person', String(me.id))) continue;
    // A colour the profile never set leaves the phone's own alone.
    await upsert(db, 'person', ['id'], { ...me, avatar_color: me.avatar_color ?? undefined });
  }
  // A placeholder the server has folded into an account (S21). `adoptPulledAccounts`
  // already folded this phone's copy before this ran; its old rows — an ended
  // membership, a retired friend — would only bring a person back that is gone.
  const merged = (r: Row) => r.person_merged_into != null;
  for (const f of rows('friends')) {
    await version(db, 'friends', f);
    if (merged(f)) continue;
    const person = friendToPerson(f, ctx);
    if (await isQueued(db, 'person', String(person.id))) continue;
    if (f.deleted_at != null) {
      // A friend I removed. The person row stays if any ledger still names them.
      await db.runAsync(
        `DELETE FROM person WHERE id = ? AND is_me = 0
           AND NOT EXISTS (SELECT 1 FROM group_member WHERE person_id = ?)
           AND NOT EXISTS (SELECT 1 FROM txn_payment WHERE person_id = ?)
           AND NOT EXISTS (SELECT 1 FROM txn_share WHERE person_id = ?)`,
        [person.id, person.id, person.id, person.id] as SQLite.SQLiteBindValue[],
      );
      continue;
    }
    await upsert(db, 'person', ['id'], person);
  }
  for (const t of rows('trust_settings')) {
    await version(db, 'trust_settings', t);
    const personId = String(t.person_id);
    if (t.group_id == null) {
      if (await isQueued(db, 'person', personId)) continue;
      await db.runAsync('UPDATE person SET trust_state = ?, trust_state_at = ? WHERE id = ?',
        [String(t.level), (t.updated_at ?? null) as number | null, personId]);
    } else {
      const groupId = String(t.group_id);
      if (await isQueued(db, 'person_group_trust', `${personId}|${groupId}`)) continue;
      if (t.deleted_at != null) {
        await db.runAsync('DELETE FROM person_group_trust WHERE person_id = ? AND group_id = ?', [personId, groupId]);
      } else {
        await upsert(db, 'person_group_trust', ['person_id', 'group_id'],
          { person_id: personId, group_id: groupId, trust_state: t.level, updated_at: t.updated_at });
      }
    }
  }

  // --- groups, members, my view of each group ----------------------------------
  const members = rows('group_members');
  for (const m of members) {
    await version(db, 'group_members', m);
    if (merged(m)) continue;
    // Someone I only know through this group: the group's name for them, but only
    // if I have no row for them already — my own naming of a friend wins.
    const p = memberToPerson(m, ctx);
    await db.runAsync(
      'INSERT OR IGNORE INTO person (id, name, avatar_color, is_me, remote_uid) VALUES (?, ?, ?, ?, ?)',
      [p.id, p.name, p.avatar_color, p.is_me, p.remote_uid] as SQLite.SQLiteBindValue[],
    );
  }
  for (const g of rows('groups')) {
    await version(db, 'groups', g);
    if (await isQueued(db, 'budget_group', String(g.id))) continue;
    const archived = (await db.getFirstAsync<{ is_archived: number }>('SELECT is_archived FROM budget_group WHERE id = ?', [String(g.id)]))?.is_archived ?? 0;
    const local = serverToGroup(g, members.filter(m => m.group_id === g.id), archived, ctx);
    await upsert(db, 'budget_group', ['id'], { ...local, is_archived: g.deleted_at != null ? 1 : local.is_archived });
  }
  for (const m of members) {
    if (merged(m)) continue;
    const local = serverToMember(m);
    if (await isQueued(db, 'group_member', `${local.group_id}|${local.person_id}`)) continue;
    await upsert(db, 'group_member', ['group_id', 'person_id'], local);
  }
  for (const p of rows('group_preferences')) {
    await version(db, 'group_preferences', p);
    if (await isQueued(db, 'budget_group', String(p.group_id))) continue;
    await db.runAsync('UPDATE budget_group SET is_archived = ? WHERE id = ?', [Number(p.is_archived ?? 0), String(p.group_id)]);
  }

  // --- categories and budgets: matched on their natural key --------------------
  for (const c of rows('categories')) {
    await version(db, 'categories', c);
    const mapped = serverToCategory(c);
    const name = String(c.name); const kind = String(c.kind);
    const local = await db.getFirstAsync<{ id: string }>('SELECT id FROM category WHERE name = ? AND kind = ?', [name, kind]);
    if (local && await isQueued(db, 'category', local.id)) continue;
    await db.runAsync('DELETE FROM category WHERE name = ? AND kind = ?', [name, kind]);
    if ('tombstone' in mapped) {
      await db.runAsync('INSERT OR IGNORE INTO category_tombstone (name, kind, created_at) VALUES (?, ?, ?)',
        [name, kind, Number(mapped.tombstone.created_at)]);
    } else {
      await db.runAsync('DELETE FROM category_tombstone WHERE name = ? AND kind = ?', [name, kind]);
      await upsert(db, 'category', ['id'], mapped.category);
    }
  }
  for (const b of rows('budgets')) {
    const personId = (b.person_id ?? null) as string | null;
    const matches = await db.getAllAsync<{ id: string }>(
      personId === null
        ? 'SELECT id FROM category_budget WHERE group_id = ? AND category = ? AND person_id IS NULL'
        : 'SELECT id FROM category_budget WHERE group_id = ? AND category = ? AND person_id = ?',
      personId === null ? [String(b.group_id), String(b.category)] : [String(b.group_id), String(b.category), personId],
    );
    let pending = false;
    for (const m of matches) if (await isQueued(db, 'category_budget', m.id)) pending = true;
    if (pending) continue;
    await version(db, 'budgets', b);
    for (const m of matches) await db.runAsync('DELETE FROM category_budget WHERE id = ?', [m.id]);
    if (b.deleted_at == null) await upsert(db, 'category_budget', ['id'], serverToBudget(b));
  }

  // --- personal money -------------------------------------------------------------
  const simple: Array<[string, 'asset' | 'savings_goal' | 'savings_txn' | 'pending_txn']> = [
    ['assets', 'asset'], ['savings_goals', 'savings_goal'], ['savings_transactions', 'savings_txn'], ['imported_transactions', 'pending_txn'],
  ];
  for (const [entity, table] of simple) {
    for (const r of rows(entity)) {
      if (await isQueued(db, table, String(r.id))) continue;
      await version(db, entity, r);
      if (r.deleted_at != null) {
        await db.runAsync(`DELETE FROM ${table} WHERE id = ?`, [String(r.id)]);
        continue;
      }
      await upsert(db, table, ['id'], simpleToLocal(table, r));
    }
  }
  for (const p of rows('money_profiles')) {
    if (await isQueued(db, 'settings', MONEY_PROFILE_ID)) continue;
    await version(db, 'money_profiles', p);
    const money = serverToMoneySettings(p);
    for (const key of Object.keys(MONEY_KEYS)) {
      if (key in money) await setSetting(db, key, money[key]);
      // A timestamp the server does not hold is one this phone must not keep.
      else await db.runAsync('DELETE FROM settings WHERE key = ?', [key]);
    }
  }

  // --- transactions -----------------------------------------------------------------
  for (const t of rows('transactions')) {
    if (await isQueued(db, 'txn', String(t.id))) continue;
    await version(db, 'transactions', t);
    const b = serverToTxn(t, ctx);
    await upsert(db, 'txn', ['id'], b.txn);
    await db.runAsync('DELETE FROM txn_payment WHERE txn_id = ?', [String(t.id)]);
    await db.runAsync('DELETE FROM txn_share WHERE txn_id = ?', [String(t.id)]);
    await db.runAsync('DELETE FROM line_item WHERE txn_id = ?', [String(t.id)]);
    await db.runAsync('DELETE FROM recur_skip WHERE series_id = ?', [String(t.id)]);
    for (const p of b.payments) await upsert(db, 'txn_payment', ['txn_id', 'person_id'], p);
    for (const s of b.shares) await upsert(db, 'txn_share', ['txn_id', 'person_id'], s);
    for (const i of b.items) await upsert(db, 'line_item', ['id'], i);
    for (const d of b.skips) {
      await db.runAsync('INSERT OR IGNORE INTO recur_skip (series_id, occurrence_date, created_at) VALUES (?, ?, ?)',
        [String(t.id), d, Number(t.updated_at ?? Date.now())]);
    }
  }

  // --- written by the server: decisions, objections, the feed ----------------------
  for (const a of rows('approvals')) {
    await version(db, 'approvals', a);
    const txnId = String(a.transaction_id);
    // An answer I haven't sent yet wins, as any pending change does.
    if (await isQueued(db, 'txn_approval', txnId)) continue;
    // Withdrawn: the entry no longer names me (or is gone). Nothing is left to
    // decide, and a leftover 'pending' would hide the entry from my figures forever.
    if (a.deleted_at != null) {
      await db.runAsync('DELETE FROM txn_approval WHERE txn_id = ?', [txnId]);
      continue;
    }
    const mapped = serverToApproval(a);
    await upsert(db, 'txn_approval', ['txn_id'], mapped);
    /*
     * An entry I accepted counts until I agree it's gone (`DQ-31`). Its author's
     * delete arrives with the group, before this; my answer to it arrives here —
     * so this is where it comes back. Either I haven't answered (a pending
     * delete) or I refused the retraction. The only ways I remove someone else's
     * entry leave a different state (a rejection) or no approval at all.
     */
    if (mapped.state === 'approved') {
      await db.runAsync('UPDATE txn SET is_deleted = 0 WHERE id = ? AND is_deleted = 1', [txnId]);
    }
  }
  for (const d of rows('disputes')) {
    await upsert(db, 'txn_dispute', ['txn_id', 'by_uid'], serverToDispute(d));
  }
  for (const a of rows('activity_log')) {
    await upsert(db, 'audit_log', ['id'], serverToAudit(a, scope.kind, ctx));
  }
}

/** A group that ended for me, the first time this phone learns of it — for the one message that says so. */
export type Vanished = { groupId: string; name: string; state: 'deleted' | 'removed' };

/**
 * A group I can no longer read: archive it and forget its cursor. Nothing I spent
 * is deleted. A group its owner deleted is marked so, which is what stops it being
 * unarchived into a group that no longer exists for anyone.
 *
 * The server lists it on every pull; only the first does anything. The cursor is
 * the marker — it goes here — so a group I later unarchive to look back at isn't
 * archived again, and the message isn't repeated. Returns the group when this
 * pull is the one that ended it for me, and I didn't end it myself.
 */
export async function applyRevoked(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  why: 'deleted' | 'removed' | 'left' = 'removed',
): Promise<Vanished | null> {
  if (!(await getSetting(db, K.cursor(groupId)))) return null;
  const g = await db.getFirstAsync<{ name: string }>('SELECT name FROM budget_group WHERE id = ?', [groupId]);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE budget_group SET is_archived = 1, deleted_at = CASE WHEN ? THEN COALESCE(deleted_at, ?) ELSE deleted_at END
        WHERE id = ?`, [why === 'deleted' ? 1 : 0, Date.now(), groupId]);
    await db.runAsync('DELETE FROM settings WHERE key = ?', [K.cursor(groupId)]);
  });
  return g && why !== 'left' ? { groupId, name: g.name, state: why } : null;
}

/**
 * The server refused a mutation, or found it in conflict. The server's copy (when
 * there is one) replaces the phone's, the queue row goes, and the refusal is kept
 * so a surface can explain it (S17). Nothing is deleted on the phone's side: a
 * refused create simply stays local, and says so.
 */
export async function applyRejection(
  db: SQLite.SQLiteDatabase,
  r: { mutationId: number; code: string; message: string; current: unknown },
  found: { row: QueueRow; sent: Sent } | null,
  ctx: MapContext,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    // Superseded (the row changed again after it was sent): the newer change is
    // already queued and will be judged on its own — nothing to revert.
    let yours: Row | undefined;
    if (found) {
      // A transaction clashed on money: keep what this phone sent BEFORE the
      // server's copy replaces it, so the person can still choose it (S17).
      if (r.code === 'conflict' && found.sent.e === 'transactions' && r.current) {
        const built = await buildOutbound(db, found.row, ctx);
        yours = built?.find(o => o.entity === 'transactions' && o.entityId === found.sent.i)?.data;
      }
      await db.runAsync('DELETE FROM sync_queue WHERE queue_id = ?', [found.row.queue_id]);
      const current = r.current as Row | null;
      if (current) {
        const scope = String(current.scope_id ?? '');
        await applyRows(db, { id: scope, kind: scope === ctx.userId ? 'user' : 'group', rows: { [found.sent.e]: [current] } }, ctx);
      }
    }
    await recordRejection(db, {
      mutationId: r.mutationId, code: r.code, message: r.message,
      entity: found?.sent.e ?? '', entityId: found?.sent.i ?? '', at: Date.now(),
      ...(yours ? { yours, theirs: r.current as Row } : {}),
    });
  });
}
