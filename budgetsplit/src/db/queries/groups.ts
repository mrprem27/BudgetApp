import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { logAudit } from './audit';
import { markRosterDirty } from './syncDoc';
import { memberActive, MEMBER_ACTIVE } from './memberSql';

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
  is_shared: number;
  is_archived: number;
  is_personal: number;
  simplify_debt: number;
  default_split: SplitMode;
  created_at: number;
  /** Immutable creator. Always an admin; can never be removed or demoted. */
  created_by: string | null;
};

import type { SplitMode, GroupRole } from '../../constants/enums';
import {
  canChangeRole, canDeleteGroup, canEditGroup, PermissionError, type GroupContext,
} from '../../lib/permissions';
export type { SplitMode } from '../../constants/enums';

export async function getAllGroups(db: SQLite.SQLiteDatabase): Promise<BudgetGroup[]> {
  return db.getAllAsync<BudgetGroup>(
    'SELECT * FROM budget_group WHERE is_archived = 0 ORDER BY created_at ASC',
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
  return db.getFirstAsync<BudgetGroup>(
    'SELECT * FROM budget_group WHERE is_personal = 1 ORDER BY created_at ASC LIMIT 1',
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
        'INSERT OR IGNORE INTO group_member (group_id, person_id, joined_at, role) VALUES (?, ?, ?, ?)',
        [id, pid, now, pid === creator ? 'admin' : 'member'],
      );
    }
    // Categories are a single global catalog now (seeded once in openDB) — groups
    // no longer seed their own copies.
  });

  return { id, name, icon, color, carry_over: 0, is_shared: 0, is_archived: 0, is_personal: 0, simplify_debt: 1, default_split: defaultSplit, created_at: now, created_by: creator };
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
  await logAudit(db, {
    entityType: 'group', entityId: groupId, groupId, action: 'updated',
    summary: on ? 'Turned on simplified settling' : 'Turned off simplified settling',
  });
  // This decides what the SETTLE-UP INSTRUCTIONS look like — "pay Rohan ₹2,000"
  // versus two smaller direct payments — so leaving it on one device means the
  // group is told two different things about the same ledger.
  await markRosterDirty(db, groupId);
}

/**
 * Rename / recolour a group, and optionally change its default split.
 *
 * `actorId` is required and checked. There was no capability for this and no
 * check anywhere, so any member could rename a shared group for everybody and
 * change the mode every future expense in it defaults to — and both now travel on
 * the roster, so one member's change reaches every phone.
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
    await logAudit(db, {
      entityType: 'group', entityId: groupId, groupId,
      action: 'updated', summary: `Updated group · ${name}`,
    });
  });  // Name, icon and colour are what the other phones display.
  await markRosterDirty(db, groupId);
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
 * Hard-delete a group and everything tied to it (transactions, splits, line
 * items, members, budgets, its audit history). Never deletes the Personal group.
 * Irreversible — the caller must confirm first, and must unlink the returned
 * attachment files.
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
   * undo. `archiveVanishedGroup` refuses to do that to me when somebody ELSE
   * deletes a group, and there is no principled reason to be harsher to the
   * person pressing the button. They are the only one who can do it by accident.
   *
   * And the group came BACK. Nothing told the server, so `sync_group` was still
   * live and the local `sync.cursor` row had just been deleted — which means the
   * next pull started from zero, fetched the `__roster__` entry first, and
   * `adoptGroup` recreated the whole group from it. Empty, because every entry
   * was gone locally, and unadministrable, because adoption did not carry a
   * creator. So the delete produced a husk instead of nothing.
   *
   * The server is told first, by the caller (`deleteSyncGroup`), because the owner
   * check lives there and a local delete the server refused would leave the two
   * permanently disagreeing about whether the group exists.
   */
  await db.withTransactionAsync(async () => {
    const now = Date.now();
    // `deleted_at` means "this group ended, and I know it" — set both when I
    // delete it and when `reconcileVanished` learns somebody else did.
    // `is_archived` keeps it out of the active list. `unarchiveGroup` refuses a
    // group carrying `deleted_at`, so this cannot be walked back into a group
    // that no longer exists for anyone else.
    await db.runAsync(
      'UPDATE budget_group SET deleted_at = ?, is_archived = 1, updated_at = ? WHERE id = ?',
      [now, now, groupId],
    );
    /*
     * The delivery queue and both pull cursors.
     *
     * Nothing is left to deliver and there is nowhere to deliver it, so a queued
     * row would retry against a group the server has tombstoned on every sync
     * forever. The `#disputes` cursor goes with the entry cursor —
     * `archiveVanishedGroup` already deletes both, and this path used to forget
     * the second one.
     */
    await db.runAsync('DELETE FROM sync_outbox WHERE group_id=?', [groupId]);
    await db.runAsync('DELETE FROM settings WHERE key=? OR key=?', [
      `sync.cursor.${groupId}`, `sync.cursor.${groupId}#disputes`,
    ]);
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
 * ORDER MATTERS, and this is the only place it is written down:
 *
 * 1. Mark my membership as ended, and mark the roster dirty.
 * 2. Publish the roster — the CALLER does this, before step 3.
 * 3. Tell the server I have left.
 *
 * Backwards, and nobody ever learns. The moment `removed_at` is set the server
 * refuses every write from me, so a roster published after leaving is rejected and
 * the others keep me as a member forever, with my entries still resolving and my
 * share still counting in their splits.
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
    await logAudit(db, {
      entityType: 'group', entityId: groupId, groupId,
      action: 'updated', summary: `Left group · ${g.name}`,
    });
  });
  // Published by the caller before it tells the server. Deliberately NOT cleared
  // here — the outbox and cursors are dropped by the caller after the roster has
  // gone, because dropping them now would leave nothing able to publish it.
  await markRosterDirty(db, groupId);
  return { ok: true };
}

/**
 * Stop syncing a group this device is done with — after the roster carrying the
 * departure has been published.
 */
export async function stopSyncingGroup(
  db: SQLite.SQLiteDatabase,
  groupId: string,
): Promise<void> {
  await db.runAsync('DELETE FROM sync_outbox WHERE group_id = ?', [groupId]);
  await db.runAsync('DELETE FROM settings WHERE key = ? OR key = ? OR key = ?', [
    `sync.cursor.${groupId}`,
    `sync.cursor.${groupId}#disputes`,
    `sync.roster.dirty.${groupId}`,
  ]);
}

/** Soft-delete (archive). Personal group can never be archived. */
export async function archiveGroupSafe(db: SQLite.SQLiteDatabase, groupId: string): Promise<boolean> {
  const g = await db.getFirstAsync<BudgetGroup>('SELECT * FROM budget_group WHERE id=?', [groupId]);
  if (!g || g.is_personal === 1) return false;
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE budget_group SET is_archived=1 WHERE id=?', [groupId]);
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
): Promise<Array<{ person_id: string; role: GroupRole; is_creator: boolean }>> {
  const rows = await db.getAllAsync<{ person_id: string; role: GroupRole; created_by: string | null }>(
    `SELECT gm.person_id, gm.role, bg.created_by
       FROM group_member gm JOIN budget_group bg ON bg.id = gm.group_id
      WHERE gm.group_id = ? AND ${memberActive('gm')}`,
    [groupId],
  );
  return rows
    .map(r => ({ person_id: r.person_id, role: r.role, is_creator: r.created_by === r.person_id }))
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
  // Roles travel on the roster. Without this, promoting somebody was a fact about
  // one phone: they stayed a plain member everywhere else, and the shield toggle
  // that appeared to grant it granted nothing.
  await markRosterDirty(db, groupId);
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
): Promise<Array<{ id: string; name: string }>> {
  return db.getAllAsync<{ id: string; name: string }>(
    `SELECT g.id, g.name FROM budget_group g
       JOIN group_member a ON a.group_id = g.id AND a.person_id = ? AND ${memberActive('a')}
       JOIN group_member b ON b.group_id = g.id AND b.person_id = ? AND ${memberActive('b')}
      WHERE g.is_personal = 0 AND g.is_archived = 0
      ORDER BY g.created_at ASC`,
    [meId, personId],
  );
}
