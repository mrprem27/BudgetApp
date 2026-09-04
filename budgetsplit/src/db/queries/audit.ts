import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';

import type { AuditAction, AuditEntityType } from '../../constants/enums';
export type { AuditAction, AuditEntityType } from '../../constants/enums';

export type AuditLog = {
  id: string;
  entity_type: AuditEntityType;
  entity_id: string;
  group_id: string | null;
  action: AuditAction;
  summary: string;
  amount: number | null;
  created_at: number;
  /** Who did it. See `AuditInput.actorPersonId`. */
  actor_person_id: string | null;
};

export type AuditInput = {
  entityType: AuditEntityType;
  entityId: string;
  groupId?: string | null;
  action: AuditAction;
  summary: string;
  amount?: number | null;
  /**
   * WHO did this, as a person id.
   *
   * The name used to exist only inside `summary` — "Aarav added ₹400 · Food" —
   * which made it unqueryable ("what has Aarav changed?" has no answer) and made
   * it drift: rename or merge that person and every past row still says the old
   * name, because the string was copied at write time.
   *
   * Null means me. That is the common case and the honest default: almost every
   * row in this table is my own action, and writing my id on all of them would be
   * noise. A non-null value is what makes a row worth asking about.
   */
  actorPersonId?: string | null;
};

/**
 * Record one mutation in the audit trail. Call inside the same
 * `withTransactionAsync` block as the mutation it describes so the log
 * and the change commit (or roll back) together.
 */
export async function logAudit(db: SQLite.SQLiteDatabase, entry: AuditInput): Promise<void> {
  await db.runAsync(
    `INSERT INTO audit_log (id, entity_type, entity_id, group_id, action, summary, amount, created_at, actor_person_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(), entry.entityType, entry.entityId, entry.groupId ?? null,
      entry.action, entry.summary, entry.amount ?? null, Date.now(),
      entry.actorPersonId ?? null,
    ],
  );
}

export type AuditFilter = {
  groupId?: string;          // restrict to one group
  entityId?: string;         // restrict to one entity (e.g. a single transaction)
  action?: AuditAction;
  entityType?: AuditEntityType;
  fromMs?: number;
  toMs?: number;
  limit?: number;
};

export async function getAuditLog(
  db: SQLite.SQLiteDatabase,
  filter: AuditFilter = {},
): Promise<AuditLog[]> {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (filter.groupId)    { where.push('group_id = ?');    args.push(filter.groupId); }
  if (filter.entityId)   { where.push('entity_id = ?');   args.push(filter.entityId); }
  if (filter.action)     { where.push('action = ?');      args.push(filter.action); }
  if (filter.entityType) { where.push('entity_type = ?'); args.push(filter.entityType); }
  if (filter.fromMs)     { where.push('created_at >= ?'); args.push(filter.fromMs); }
  if (filter.toMs)       { where.push('created_at <= ?'); args.push(filter.toMs); }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = filter.limit ?? 500;
  return db.getAllAsync<AuditLog>(
    `SELECT * FROM audit_log ${clause} ORDER BY created_at DESC LIMIT ${limit}`,
    args,
  );
}
