import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { logAudit } from './audit';
import { queueUpsert, queueUpsertWhere } from './syncQueue';
import { INVITED_ON_ADD, memberActive, MEMBER_ACTIVE } from './memberSql';

export type BudgetGroup = {
  id: string;
  name: string;
  icon: string;
  color: string;
  /**
   * `limit_daily` / `limit_monthly` / `limit_yearly` are deliberately absent.
   *
   * The columns still exist on `budget_group` (dropping one in SQLite needs a
   * table rebuild, which is not worth a migration for three unused fields), but
   * nothing has ever written them — see the REMOVED note in `lib/budget.ts`, which
   * explains they were a second, contradictory answer to "does unused budget roll
   * over?" alongside category budgets. Carrying them on the type advertised a
   * group-level budget the app does not have.
   */
  carry_over: number;
  /**
   * ⚠️ **Dead. Never read it — use `member_count`.**
   *
   * Hard-coded 0 on create, hard-coded 1 on adoption, never UPDATEd by anything.
   * So it is 1 only on groups you received and 0 forever on groups you shared
   * yourself. The column stays because dropping one in SQLite needs a table
   * rebuild, which is not worth a migration for a field nothing should read.
   */
  is_shared: number;
  /**
   * Active members, counted at read time. Present on `getAllGroups` only.
   * `> 1` is what "shared" actually means — see `MEMBER_COUNT`.
   */
  member_count?: number;
  is_archived: number;
  is_personal: number;
  simplify_debt: number;
  default_split: SplitMode;
  created_at: number;
  /** Immutable creator. Always an admin; can never be removed or demoted. */
  created_by: string | null;
  /** Set when this group ended for everyone. See `deleteGroup`. */
  deleted_at: number | null;
  /**
   * The friend this group IS, when it was created implicitly for splitting with
   * one person. Null for every ordinary group.
   *
   * **Presentational only.** The Groups tab and the destination picker hide these
   * because the person's own screen already shows everything about them — but no
   * balance, settle or sync query may filter on it. A pair group is a shared group
   * in every respect that touches money.
   */
  pair_person_id: string | null;
};

import type { SplitMode, GroupRole } from '../../constants/enums';
import {
  canChangeRole, canDeleteGroup, canEditGroup, PermissionError, type GroupContext,
} from '../../lib/permissions';
export type { SplitMode } from '../../constants/enums';

/**
 * How many people are in a group, counted rather than stored.
 *
 * `budget_group.is_shared` was meant to answer this and never could: it is
 * hard-coded 0 on create, hard-coded 1 on adoption, and nothing anywhere ever
 * UPDATEs it. So it read 1 only on groups you RECEIVED, and stayed 0 forever on
 * every group you shared yourself — the picker's "Shared" label was wrong for
 * exactly the groups you would most expect it on (`OV-34`/`SYNC-F23`).
 *
 * A count cannot drift, because it is the thing itself. `memberActive` because a
 * departed member is soft-deleted and must not keep a group looking shared.
 */
const MEMBER_COUNT = `(
  SELECT COUNT(*) FROM group_member m
   WHERE m.group_id = budget_group.id AND ${memberActive('m')}
)`;

export async function getAllGroups(db: SQLite.SQLiteDatabase): Promise<BudgetGroup[]> {
  return db.getAllAsync<BudgetGroup>(
    `SELECT *, ${MEMBER_COUNT} AS member_count
       FROM budget_group WHERE is_archived = 0 ORDER BY created_at ASC`,
  );
}

/**
 * Groups ordered for a "where does this go?" picker: Personal pinned first, then
 * whichever group you used most recently, then creation order as a tiebreak.
 *
 * `getAllGroups` is `created_at ASC`, which is why the Add screen's group pills
 * were ordered by age — while both `FEATURES_AND_FLOWS.md` §7.1 and §22 described
 * them as "frequent-group pills". Nothing computed that. This is the query that
 * makes the docs true; it mirrors `getCategoriesByFrequency`.
 *
 * Personal stays pinned rather than competing on recency: it's the safe default
 * destination, and a picker whose first row moves around is harder to aim at than
 * one that saves a scroll.
 */
export async function getGroupsByRecentUse(db: SQLite.SQLiteDatabase): Promise<BudgetGroup[]> {
  return db.getAllAsync<BudgetGroup>(
    `SELECT g.* FROM budget_group g
     LEFT JOIN (
       SELECT group_id, MAX(date) AS last_used
         FROM txn
        WHERE is_deleted = 0 AND recur_freq IS NULL
        GROUP BY group_id
     ) t ON t.group_id = g.id
     WHERE g.is_archived = 0
     ORDER BY g.is_personal DESC, COALESCE(t.last_used, 0) DESC, g.created_at ASC`,
  );
}

export async function getGroupById(db: SQLite.SQLiteDatabase, id: string): Promise<BudgetGroup | null> {
  return db.getFirstAsync<BudgetGroup>('SELECT * FROM budget_group WHERE id = ?', [id]);
}

/**
 * The Personal group. Its budget lines are **My Budget** (`isGlobalBudgetGroup` in
 * `lib/budget`), so this is the one place that answers "which group is Personal?".
 *
 * No `?? groups[0]` fallback, deliberately: substituting the oldest group promotes
 * a *shared* group's budget into the global cap, and at one call site labelled that
 * group's transactions "Personal". Absence means a corrupt DB — `null` is the
 * honest answer.
 */
export async function getPersonalGroup(db: SQLite.SQLiteDatabase): Promise<BudgetGroup | null> {
  return (await getPersonalGroups(db))[0] ?? null;
}

/**
 * Every `is_personal` row, oldest first — normally exactly one. The only
 * legitimate reason there's more than one is mid-merge (`mergeLedger.ts`
 * `foldPersonalGroup`), which needs to name BOTH the phone's and the account's
 * before it folds them into one; that is a different question from "which
 * group is Personal", so it gets its own function rather than a second
 * `is_personal = 1` lookup outside this file.
 */
export async function getPersonalGroups(db: SQLite.SQLiteDatabase): Promise<BudgetGroup[]> {
  return db.getAllAsync<BudgetGroup>(
    'SELECT * FROM budget_group WHERE is_personal = 1 ORDER BY created_at ASC',
  );
}

/** Same answer from a list already in hand. Same rule, same no-fallback. */
export function personalGroupOf(groups: BudgetGroup[]): BudgetGroup | null {
  return groups.find(g => g.is_personal === 1) ?? null;
}

/**
 * Every group whose lines are a **group** budget — all but Personal. Cross-group
 * budget rollups map over this, never `getAllGroups`: the Personal group's lines
 * are the global cap, which already covers spend inside each of these groups.
 */
export function sharedGroupsOf(groups: BudgetGroup[]): BudgetGroup[] {
  return groups.filter(g => g.is_personal !== 1);
}

/**
 * The groups a LIST should show: everything except the implicit two-person groups
 * created for splitting with one friend.
 *
 * **Presentational, and nothing more.** A pair group is a shared group in every
 * respect that touches money — it is in `getAllGroups`, in every balance, in
 * every sync path — and it is hidden here only because the person's own screen
 * already shows all of it: the net, the per-group breakdown and every shared
 * transaction. Showing it twice would make the Groups tab a list of contacts.
 *
 * Deliberately a helper over an in-hand list rather than a clause in
 * `getAllGroups`. In the query it would have silently removed those groups from
 * balances, budgets and settle-up, which is the one thing this must never do:
 * money would go into a group that no figure counted.
 */
export function listableGroups(groups: BudgetGroup[]): BudgetGroup[] {
  return groups.filter(g => g.pair_person_id == null);
}

/** What a breakdown needs to name and colour one slice of spend. */
export type GroupRef = { name: string; color: string; isPersonal: boolean };

/**
 * Group id → its name and colour, for any surface that breaks a figure down by
 * group. The only thing that existed before was a name-only map built inline on
 * category detail, which is why that breakdown had no colours.
 */
export function groupRefs(groups: BudgetGroup[]): Record<string, GroupRef> {
  return Object.fromEntries(
    groups.map(g => [g.id, { name: g.name, color: g.color, isPersonal: g.is_personal === 1 }]),
  );
}

export async function getArchivedGroups(db: SQLite.SQLiteDatabase): Promise<BudgetGroup[]> {
  return db.getAllAsync<BudgetGroup>(
    'SELECT * FROM budget_group WHERE is_archived = 1 ORDER BY created_at ASC',
  );
}

/**
 * Bring an archived group back into the active list.
 *
 * Refuses a group carrying `deleted_at`. The two flags mean different things and
 * only one of them is reversible: `is_archived` is *out of my list, still mine,
 * can come back*, while `deleted_at` is *this group ended, and I know it* — set
 * when I delete it for everyone, and when `reconcileVanished` learns somebody
 * else did. Restoring the second would put back a group that exists for nobody,
 * still queueing entries at a server that has tombstoned it.
 */
export async function unarchiveGroup(db: SQLite.SQLiteDatabase, groupId: string): Promise<boolean> {
  const existing = await db.getFirstAsync<{ deleted_at: number | null }>(
    'SELECT deleted_at FROM budget_group WHERE id = ?', [groupId],
  );
  if (!existing || existing.deleted_at != null) return false;

  await db.withTransactionAsync(async () => {
    const g = await db.getFirstAsync<BudgetGroup>('SELECT * FROM budget_group WHERE id=?', [groupId]);
    await db.runAsync('UPDATE budget_group SET is_archived=0 WHERE id=?', [groupId]);
    await queueUpsert(db, 'budget_group', groupId);
    await logAudit(db, {
      entityType: 'group', entityId: groupId, groupId,
      action: 'updated', summary: `Restored group · ${g?.name ?? ''}`,
    });
  });
  return true;
}

export async function insertGroup(
  db: SQLite.SQLiteDatabase,
  name: string,
  icon: string,
  color: string,
  memberIds: string[],
  defaultSplit: SplitMode = 'equal',
  /**
   * Who is creating this. Recorded immutably: they can never be removed or demoted.
   *
   * Optional, and **defaulted to the `is_me` person when omitted** — that default
   * is the entire point. As a plain optional it was a footgun that every caller
   * stepped on: `created_by` came out NULL, every member got `'member'`, and the
   * group had **no admin at all**. Nobody could then edit its budget or manage
   * members, permanently, with the write path correctly refusing and no UI able to
   * repair it. `is_me` is the same answer the creator backfill gives existing
   * groups, and it is true by construction: with no sync, you created every group
   * on this device.
   */
  creatorId?: string,
): Promise<BudgetGroup> {
  const id = uuid();
  const now = Date.now();
  const creator = creatorId
    ?? (await db.getFirstAsync<{ id: string }>('SELECT id FROM person WHERE is_me = 1 LIMIT 1'))?.id
    ?? null;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO budget_group (id, name, icon, color, carry_over, is_shared, is_archived, default_split, created_at, created_by)
       VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?, ?)`,
      [id, name, icon, color, defaultSplit, now, creator],
    );
    // The creator is always a member of their own group, even if the caller forgot
    // to include them — a group whose creator is not in it has no un-removable
    // admin, which is exactly the state `canRemoveMember` exists to prevent.
    const ids = creator && !memberIds.includes(creator) ? [creator, ...memberIds] : memberIds;
    for (const pid of ids) {
      await db.runAsync(
        `INSERT OR IGNORE INTO group_member (group_id, person_id, joined_at, role, invited)
         VALUES (?, ?, ?, ?, (${INVITED_ON_ADD}))`,
        [id, pid, now, pid === creator ? 'admin' : 'member', pid],
      );
      await queueUpsert(db, 'group_member', `${id}|${pid}`);
    }
    await queueUpsert(db, 'budget_group', id);
    // Categories are a single global catalog now (seeded once in openDB) — groups
    // no longer seed their own copies.
  });

  /*
   * Read back, not hand-assembled.
   *
   * This used to return a literal whose `is_personal` and `simplify_debt` were
   * copies of column DEFAULTS the INSERT above never names. That is a value that
   * is true until somebody changes a default, and then quietly is not — and it
   * meant adding a column obliged every caller of this function to be re-checked.
   */
  const created = await db.getFirstAsync<BudgetGroup>(
    'SELECT * FROM budget_group WHERE id = ?', [id],
  );
  if (!created) throw new Error('Group was not created');
  return created;
}

export async function setSimplifyDebt(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  on: boolean,
  actorId: string,
): Promise<void> {
  // Same capability as any other group setting, and for the same reason: this one
  // decides what everybody is told to pay.
  if (!canEditGroup(await getGroupContext(db, groupId, actorId))) {
    throw new PermissionError('change how this group settles up');
  }
  await db.runAsync('UPDATE budget_group SET simplify_debt=? WHERE id=?', [on ? 1 : 0, groupId]);
  await queueUpsert(db, 'budget_group', groupId);
  await logAudit(db, {
    entityType: 'group', entityId: groupId, groupId, action: 'updated',
    summary: on ? 'Turned on simplified settling' : 'Turned off simplified settling',
  });
}

/**
 * Rename / recolour a group, and optionally change its default split.
 *
 * `actorId` is required and checked. There was no capability for this and no
 * check anywhere, so any member could rename a shared group for everybody and
 * change the mode every future expense in it defaults to — and both travel to the
 * server, so one member's change reaches every phone.
 */
export async function updateGroup(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  name: string,
  icon: string,
  color: string,
  defaultSplit: SplitMode | undefined,
  actorId: string,
): Promise<void> {
  if (!canEditGroup(await getGroupContext(db, groupId, actorId))) {
    throw new PermissionError('edit this group');
  }
  await db.withTransactionAsync(async () => {
    if (defaultSplit) {
      await db.runAsync(
        'UPDATE budget_group SET name=?, icon=?, color=?, default_split=? WHERE id=?',
        [name, icon, color, defaultSplit, groupId],
      );
    } else {
      await db.runAsync(
        'UPDATE budget_group SET name=?, icon=?, color=? WHERE id=?',
        [name, icon, color, groupId],
      );
    }
    await queueUpsert(db, 'budget_group', groupId);
    await logAudit(db, {
      entityType: 'group', entityId: groupId, groupId,
      action: 'updated', summary: `Updated group · ${name}`,
    });
  });
}

export type DeleteGroupResult = {
  ok: boolean;
  /**
   * Receipt files belonging to the deleted transactions. The caller must unlink
   * these (`deleteAttachment`) — this layer deliberately doesn't touch the file
   * system, so `db/queries` stays free of native modules and testable.
   */
  orphanedAttachments: string[];
};

/**
 * Delete a group: a tombstone, not a wipe (see below). Its entries stay, and the
 * deletion is queued so every member's phone learns it. Never deletes the
 * Personal group. Irreversible — the caller must confirm first.
 */
export async function deleteGroup(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  /** Who is deleting. Creator-only — this destroys every member's history. */
  actorId: string,
): Promise<DeleteGroupResult> {
  const g = await db.getFirstAsync<BudgetGroup>('SELECT * FROM budget_group WHERE id=?', [groupId]);
  if (!g || g.is_personal === 1) return { ok: false, orphanedAttachments: [] };
  if (!canDeleteGroup(await getGroupContext(db, groupId, actorId))) {
    throw new PermissionError('delete this group');
  }

  /*
   * ## It is a tombstone, not a wipe
   *
   * This used to hard-delete every txn, share, payment and line item in the
   * group. Two things were wrong with that, and the second is worse than the
   * first.
   *
   * It destroyed the deleter's OWN history. My share of each of those bills has
   * already counted as my spending, in months that are already closed, so
   * deleting them silently rewrote figures I had made decisions on — with no
   * undo. The pull refuses to do that to me when somebody ELSE
   * deletes a group, and there is no principled reason to be harsher to the
   * person pressing the button. They are the only one who can do it by accident.
   *
   * And under v1 the group came BACK: nothing told the server, so the next pull
   * recreated it from its roster — an empty, unadministrable husk. Now the
   * tombstone is queued like any change, the server checks the owner again, and
   * if it refuses, the pull puts its copy back and says why (S17).
   */
  await db.withTransactionAsync(async () => {
    const now = Date.now();
    // `deleted_at` means "this group ended, and I know it" — set both when I
    // delete it and when the pull learns somebody else did (`applyRevoked`).
    // `is_archived` keeps it out of the active list. `unarchiveGroup` refuses a
    // group carrying `deleted_at`, so this cannot be walked back into a group
    // that no longer exists for anyone else.
    await db.runAsync(
      'UPDATE budget_group SET deleted_at = ?, is_archived = 1, updated_at = ? WHERE id = ?',
      [now, now, groupId],
    );
    await queueUpsert(db, 'budget_group', groupId);
    // Drafts aimed at this group lose their target below; they are the user's too.
    await queueUpsertWhere(db, 'pending_txn', 'SELECT id FROM pending_txn WHERE dest_group_id = ?', [groupId]);
    // Unreviewed imports that were drafted into this group. Left pointing at a
    // dead group they became permanently un-committable and sat in Review forever.
    // Reset rather than delete — the row is a real imported transaction the user
    // has not classified yet, and only its *destination* died with the group. The
    // split draft and counterparty go too: both name members that no longer exist,
    // so keeping them would only re-break the commit.
    await db.runAsync(
      `UPDATE pending_txn SET dest_group_id = NULL, split_draft = NULL, counterparty_id = NULL
       WHERE dest_group_id = ?`,
      [groupId],
    );
    await logAudit(db, {
      entityType: 'group', entityId: groupId, groupId: null,
      action: 'deleted', summary: `Deleted group · ${g.name}`,
    });
  });

  // Nothing is orphaned any more: the entries stay, so their receipts are still
  // referenced. Kept in the return shape because the caller's contract is about
  // files it must unlink, and "none" is the honest answer rather than a changed
  // signature at every call site.
  return { ok: true, orphanedAttachments: [] };
}

/**
 * The two-person group for splitting with one friend, made on first use.
 *
 * ## Why this exists
 *
 * Only shared groups sync — enforced inside `queueEntry`'s own SQL — so "I bought
 * lunch, Aarav owes me half" had nowhere to live that could travel. It went into
 * the Personal group and stopped there, which made the single most ordinary thing
 * anyone does with a splitting app the one thing sync could not carry.
 *
 * ## Why a group rather than a new kind of thing
 *
 * `txn.group_id` is NOT NULL, `getFriendBalances` joins `group_member` twice,
 * `computeTransferScopes` iterates groups and `simplify()` runs over a group's
 * net. A friend-scoped sync primitive would therefore be a SECOND money model
 * that has to agree with the first forever — and a figure that moves while the
 * others do not is the failure AGENTS §13 calls worse than all of them moving.
 *
 * As an ordinary shared group this inherits membership, compare-and-set, the
 * cursor, disputes, trust and approval, and adds no new sync machinery at all. It also survives the thing that always happens next: the first
 * weekend away turns "me and Aarav" into "me, Aarav and Priya", which is
 * `addMemberToGroup` rather than a data migration under a live balance.
 *
 * ## Lazily, on the first expense
 *
 * Never on adding a friend. A group per contact you have never split with is
 * clutter, and clutter is what makes a list stop being trusted.
 *
 * Name, icon and colour are seeded from the person and then FROZEN. If the user
 * edits the name it must stay edited, so this never re-derives them.
 */
export async function getOrCreatePairGroup(
  db: SQLite.SQLiteDatabase,
  meId: string,
  personId: string,
): Promise<BudgetGroup> {
  const existing = await db.getFirstAsync<BudgetGroup>(
    'SELECT * FROM budget_group WHERE pair_person_id = ?', [personId],
  );
  // A pair group that was archived comes back rather than being duplicated —
  // adding an expense with somebody is exactly the moment to un-hide it.
  if (existing) {
    if (existing.is_archived === 1 && existing.deleted_at == null) {
      await db.runAsync('UPDATE budget_group SET is_archived = 0 WHERE id = ?', [existing.id]);
      await queueUpsert(db, 'budget_group', existing.id);
      return { ...existing, is_archived: 0 };
    }
    return existing;
  }

  const person = await db.getFirstAsync<{ name: string; avatar_color: string }>(
    'SELECT name, avatar_color FROM person WHERE id = ?', [personId],
  );
  if (!person) throw new Error('No such person');

  /*
   * Through `insertGroup`, never a hand-rolled INSERT.
   *
   * That function carries the creator/admin defaulting whose absence produced
   * groups with no admin at all — nobody able to edit the budget or manage
   * members, permanently, with no UI able to repair it. Its own doc calls a plain
   * optional here "a footgun every caller stepped on".
   */
  const group = await insertGroup(db, person.name, 'users', person.avatar_color, [personId], 'equal', meId);
  await db.runAsync('UPDATE budget_group SET pair_person_id = ? WHERE id = ?', [personId, group.id]);
  await queueUpsert(db, 'budget_group', group.id);
  return { ...group, pair_person_id: personId };
}

export type LeaveGroupResult =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'personal' | 'creator' | 'not-a-member' };

/**
 * Leave a group somebody else runs.
 *
 * There was no way to do this at all. `leaveSyncGroup` existed in `serverApi` with
 * zero callers, `members.tsx` suppressed the remove action for yourself, and the
 * only exit was a local delete — which resurrected the group on the next pull.
 * Somebody could share a group with you and you could not get out of it.
 *
 * **The creator cannot leave.** `canRemoveMember` already refuses them for
 * everybody, and a group with no un-removable admin is precisely the state that
 * rule exists to prevent. Their exit is Delete. (Handing ownership to somebody
 * else would be the other answer, and it is not built.)
 *
 * The departure is queued like any change: my membership row goes up ended, the
 * server marks me `left`, and my next pull lists the group as revoked. Every
 * other phone learns it from their own pull.
 *
 * Nothing of mine is deleted. Same rule as everywhere else here: my share of every
 * one of those bills has already counted as my spending, in months that are
 * closed. The group leaves my active list; the history stays exactly where it is.
 */
export async function leaveGroup(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  meId: string,
): Promise<LeaveGroupResult> {
  const g = await db.getFirstAsync<BudgetGroup>('SELECT * FROM budget_group WHERE id=?', [groupId]);
  if (!g) return { ok: false, reason: 'not-found' };
  if (g.is_personal === 1) return { ok: false, reason: 'personal' };
  if (g.created_by === meId) return { ok: false, reason: 'creator' };

  const mine = await db.getFirstAsync<{ n: number }>(
    `SELECT 1 AS n FROM group_member WHERE group_id = ? AND person_id = ? AND ${MEMBER_ACTIVE}`,
    [groupId, meId],
  );
  if (!mine) return { ok: false, reason: 'not-a-member' };

  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE group_member SET deleted_at = ?, updated_at = ? WHERE group_id = ? AND person_id = ?',
      [now, now, groupId, meId],
    );
    await db.runAsync(
      'UPDATE budget_group SET is_archived = 1, updated_at = ? WHERE id = ?', [now, groupId],
    );
    await queueUpsert(db, 'group_member', `${groupId}|${meId}`);
    await queueUpsert(db, 'budget_group', groupId);
    await logAudit(db, {
      entityType: 'group', entityId: groupId, groupId,
      action: 'updated', summary: `Left group · ${g.name}`,
    });
  });
  return { ok: true };
}

/** Soft-delete (archive). Personal group can never be archived. */
export async function archiveGroupSafe(db: SQLite.SQLiteDatabase, groupId: string): Promise<boolean> {
  const g = await db.getFirstAsync<BudgetGroup>('SELECT * FROM budget_group WHERE id=?', [groupId]);
  if (!g || g.is_personal === 1) return false;
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE budget_group SET is_archived=1 WHERE id=?', [groupId]);
    await queueUpsert(db, 'budget_group', groupId);
    await logAudit(db, {
      entityType: 'group', entityId: groupId, groupId,
      action: 'archived', summary: `Archived group · ${g.name}`,
    });
  });
  return true;
}



// --- Roles & membership ---------------------------------------------------

/**
 * Everything `lib/permissions` needs to decide, read in one round trip.
 *
 * Screens call this and hide what the actor cannot do; the write paths below call
 * it again and refuse. The second check is the real one — a hidden button is a
 * courtesy, not a control.
 */
export async function getGroupContext(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  actorId: string,
): Promise<GroupContext> {
  const [g, m] = await Promise.all([
    db.getFirstAsync<{ created_by: string | null }>(
      'SELECT created_by FROM budget_group WHERE id = ?', [groupId]),
    // Somebody who has LEFT has no role here. Without this they would keep every
    // permission they had — including, for an admin, removing the people still in
    // a group they are no longer part of.
    db.getFirstAsync<{ role: GroupRole }>(
      `SELECT role FROM group_member WHERE group_id = ? AND person_id = ? AND ${MEMBER_ACTIVE}`,
      [groupId, actorId]),
  ]);
  return { createdBy: g?.created_by ?? null, actorId, actorRole: m?.role ?? null };
}

/** Members with their roles, creator first — the order the members list renders in. */
export async function getGroupMembersWithRoles(
  db: SQLite.SQLiteDatabase,
  groupId: string,
): Promise<Array<{ person_id: string; role: GroupRole; is_creator: boolean; invited: boolean }>> {
  const rows = await db.getAllAsync<{ person_id: string; role: GroupRole; created_by: string | null; invited: number }>(
    `SELECT gm.person_id, gm.role, bg.created_by, gm.invited
       FROM group_member gm JOIN budget_group bg ON bg.id = gm.group_id
      WHERE gm.group_id = ? AND ${memberActive('gm')}`,
    [groupId],
  );
  return rows
    .map(r => ({ person_id: r.person_id, role: r.role, is_creator: r.created_by === r.person_id, invited: r.invited === 1 }))
    .sort((a, b) => Number(b.is_creator) - Number(a.is_creator));
}

export async function setMemberRole(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  actorId: string,
  targetPersonId: string,
  role: GroupRole,
): Promise<void> {
  const ctx = await getGroupContext(db, groupId, actorId);
  if (!canChangeRole(ctx, targetPersonId)) throw new PermissionError('change this member\'s role');
  await db.runAsync(
    'UPDATE group_member SET role = ? WHERE group_id = ? AND person_id = ?',
    [role, groupId, targetPersonId],
  );
  await queueUpsert(db, 'group_member', `${groupId}|${targetPersonId}`);
}


/** Groups this person was added to and hasn't accepted yet (S21) — what the person screen says instead of passing them off as in. */
export async function invitedGroupsOf(
  db: SQLite.SQLiteDatabase,
  personId: string,
): Promise<Array<{ id: string; name: string }>> {
  return db.getAllAsync<{ id: string; name: string }>(
    `SELECT g.id, g.name FROM budget_group g
       JOIN group_member m ON m.group_id = g.id AND m.person_id = ? AND ${memberActive('m')} AND m.invited = 1
      WHERE g.deleted_at IS NULL AND g.is_archived = 0
      ORDER BY g.created_at ASC`,
    [personId],
  );
}

/**
 * Groups the two of us are both in.
 *
 * Only shared ones: a personal group has one member by definition, so it can
 * never contain anyone else, and offering to set trust there would be offering a
 * control over an impossibility.
 */
export async function getSharedGroupsWith(
  db: SQLite.SQLiteDatabase,
  meId: string,
  personId: string,
): Promise<Array<{ id: string; name: string; is_archived: number }>> {
  /*
   * ARCHIVED groups are included, and that is the point.
   *
   * This list is what the person screen offers per-group trust overrides on, and
   * filtering archived groups out made an override set there permanently
   * unclearable: the row survived, the control to reach it did not, and if the
   * group was ever restored the forgotten answer silently governed their entries
   * again. AGENTS.md is explicit that an override "must stay clearable, or
   * 'trusted except here' is a one-way door" — and trust is the one setting where
   * stale-and-more-permissive is exactly the wrong failure.
   *
   * `deleted_at` groups are still excluded: those are over for everybody, so there
   * is nothing left for an override to govern.
   */
  return db.getAllAsync<{ id: string; name: string; is_archived: number }>(
    `SELECT g.id, g.name, g.is_archived FROM budget_group g
       JOIN group_member a ON a.group_id = g.id AND a.person_id = ? AND ${memberActive('a')}
       JOIN group_member b ON b.group_id = g.id AND b.person_id = ? AND ${memberActive('b')}
      WHERE g.is_personal = 0 AND g.deleted_at IS NULL
      ORDER BY g.is_archived ASC, g.created_at ASC`,
    [meId, personId],
  );
}
