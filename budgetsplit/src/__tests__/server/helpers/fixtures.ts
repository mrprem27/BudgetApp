import type { TestD1 } from './d1';

/**
 * Minimal valid rows for the server schema, so a test states only what it is about.
 * Every helper writes through the real constraints — a fixture that bypassed them
 * would let a test pass against a row the server could never hold.
 */

const NOW = 1_700_000_000_000;
let n = 0;
export const uid = (prefix: string) => `${prefix}-${++n}`;

/** The columns every synced table carries (SPEC-SERVER §2.3). */
export function syncCols(scopeId: string, by: string, seq = 1) {
  return {
    scope_id: scopeId, version: 1, seq,
    created_at: NOW, updated_at: NOW, created_by: by, updated_by: by, deleted_at: null,
  };
}

export async function insert(db: TestD1, table: string, row: Record<string, unknown>) {
  const cols = Object.keys(row);
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
  return db.prepare(sql).bind(...cols.map(c => row[c])).run();
}

/** A user with their scope and their person — what signing up creates. */
export async function makeUser(db: TestD1, id = uid('user')) {
  await insert(db, 'users', { id, email: `${id}@example.in`, created_at: NOW });
  await insert(db, 'sync_scopes', { id, kind: 'user', created_at: NOW });
  const personId = `p-${id}`;
  await insert(db, 'people', { id: personId, user_id: id, created_by: id, created_at: NOW });
  return { userId: id, personId };
}

export async function makeGroup(
  db: TestD1,
  ownerId: string,
  over: Record<string, unknown> = {},
) {
  const id = (over.id as string) ?? uid('group');
  await insert(db, 'sync_scopes', { id, kind: 'group', created_at: NOW });
  await insert(db, 'groups', {
    id, ...syncCols(id, ownerId), kind: 'shared', name: 'Flat', icon: 'home', color: '#20C4B8',
    owner_id: ownerId, ...over,
  });
  return id;
}

export async function addMember(
  db: TestD1,
  groupId: string,
  personId: string,
  by: string,
  over: Record<string, unknown> = {},
) {
  const id = uid('member');
  await insert(db, 'group_members', {
    id, ...syncCols(groupId, by), group_id: groupId, person_id: personId,
    display_name: 'Aarav', avatar_color: '#8B7CF8', role: 'member', status: 'active', joined_at: NOW,
    ...over,
  });
  return id;
}

/** A transaction row alone — its payers/splits are added by the caller, as the Worker's batch does. */
export async function makeTransaction(
  db: TestD1,
  groupId: string,
  authorPersonId: string,
  by: string,
  over: Record<string, unknown> = {},
) {
  const id = (over.id as string) ?? uid('txn');
  await insert(db, 'transactions', {
    id, ...syncCols(groupId, by), group_id: groupId, kind: 'expense', amount: 30000,
    date: NOW, category: 'Food', author_id: authorPersonId, ...over,
  });
  return id;
}
