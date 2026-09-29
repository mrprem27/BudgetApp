import type * as SQLite from 'expo-sqlite';
import { isSameDay, isYesterday } from 'date-fns';
import { getAuditLog, type AuditLog, type AuditAction, type AuditEntityType } from '../db/queries/audit';
import { getAllPersons } from '../db/queries/persons';
import { fullDate } from './dateFormat';

/** One audit row, with the name of whoever did it — null when it was me. */
export type HistoryEntry = AuditLog & { actorName: string | null };
export type HistorySection = { title: string; data: HistoryEntry[] };

/** The audit log for the History screen, each row naming its actor. */
export async function loadHistory(db: SQLite.SQLiteDatabase, groupId?: string): Promise<HistoryEntry[]> {
  const [rows, people] = await Promise.all([getAuditLog(db, { groupId }), getAllPersons(db)]);
  const names = new Map(people.map(p => [p.id, p.name]));
  // A synced row carries its actor; one whose person I no longer have is still not me.
  return rows.map(r => ({ ...r, actorName: r.actor_person_id ? names.get(r.actor_person_id) ?? 'Someone' : null }));
}

// The label is built from BOTH columns: the entity supplies the noun, the action
// the verb. Hardcoding "Expense …" made a group archive read "Expense deleted".
const ENTITY_NOUN: Record<AuditEntityType, string> = {
  txn: 'Transaction', group: 'Group', member: 'Member', budget: 'Budget', recurring: 'Recurring', settlement: 'Settlement',
};
const ACTION_VERB: Record<AuditAction, string> = {
  created: 'added', updated: 'edited', deleted: 'deleted', archived: 'archived',
  settled: 'recorded', paused: 'paused', resumed: 'resumed', ended: 'ended',
};

/**
 * What one row says: its heading, and the sign on its amount.
 *
 * `txn` covers income too, which read "Expense added" over a red "−₹50,000"
 * salary. The kind is the second word of every txn summary `transactions.ts`
 * writes ("Added income …", "Deleted expense · …"), so income reads as money in.
 *
 * A settlement's own summary says which of the four things it was ("Invested
 * ₹10,000", "Settled ₹500"), so its heading borrows that first word rather than
 * saying "Settlement recorded" over an SIP.
 */
export function auditEntryView(e: Pick<AuditLog, 'entity_type' | 'action' | 'summary'>): { label: string; sign: '+' | '−' | ''; tone: 'in' | 'out' | 'neutral' } {
  const label = e.entity_type === 'settlement' && e.summary
    ? `${e.summary.split(' ')[0]} money`
    : `${ENTITY_NOUN[e.entity_type] ?? 'Item'} ${ACTION_VERB[e.action] ?? 'changed'}`;
  if (e.action === 'settled') return { label, sign: '+', tone: 'in' };
  const income = e.entity_type === 'txn' && e.summary?.split(' ')[1] === 'income';
  if (e.action === 'created') return income ? { label, sign: '+', tone: 'in' } : { label, sign: '−', tone: 'out' };
  if (e.action === 'deleted') return { label, sign: '', tone: 'out' };
  return { label, sign: '', tone: 'neutral' };
}

function dateLabel(d: Date, now: Date): string {
  if (isSameDay(d, now)) return 'TODAY';
  if (isYesterday(d)) return 'YESTERDAY';
  return fullDate(d).toUpperCase();
}

/** The first `limit` entries, grouped under TODAY / YESTERDAY / a date. */
export function historySections(entries: HistoryEntry[], limit: number, now = new Date()): HistorySection[] {
  const map = new Map<string, HistoryEntry[]>();
  for (const e of entries.slice(0, limit)) {
    const d = new Date(e.created_at);
    if (!isFinite(d.getTime())) continue;
    const key = dateLabel(d, now);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
}
