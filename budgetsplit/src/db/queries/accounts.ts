import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import type { AccountKind } from './accountSql';
import { ACCOUNT_FLOWS_SQL, CARD_FLOWS_SQL } from './cashQuery';
import { getMe } from './persons';
import { getMoneyProfile } from './moneyProfile';
import { queueUpsert } from './syncQueue';

/**
 * Where money is held or borrowed from (`U-68`, `DQ-14`): named bank accounts, cash, wallets,
 * credit cards. The money math still totals per kind (`getMoneyProfile`); this is the per-account
 * view of the same figures, and the only writer of an account's own fields.
 */
export type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  /** Paise. The start the account's movement is added to. */
  opening_balance: number;
  credit_limit: number | null;
  due_day: number | null;
  is_default: number;
  is_archived: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
};

/**
 * An account with what it holds today: opening + movement for bank, cash and wallet; for a
 * card, what is owed on it (the stated card balance sits on the default card).
 */
export type AccountWithBalance = Account & { balance: number };

const COLUMNS = 'id, name, kind, opening_balance, credit_limit, due_day, is_default, is_archived, sort_order, created_at, updated_at';

export async function getAccounts(db: SQLite.SQLiteDatabase, opts: { archived?: boolean } = {}): Promise<AccountWithBalance[]> {
  const [rows, me, profile] = await Promise.all([
    db.getAllAsync<Account>(
      `SELECT ${COLUMNS} FROM account WHERE is_archived = ? ORDER BY sort_order ASC, created_at ASC`,
      [opts.archived ? 1 : 0],
    ),
    getMe(db),
    getMoneyProfile(db),
  ]);
  const flows = new Map<string, number>();
  const cards = new Map<string, number>();
  if (me) {
    const now = Date.now();
    const baseline = profile.cardBaselineAt ?? 0;
    const [f, c] = await Promise.all([
      db.getAllAsync<{ account_id: string | null; delta: number }>(ACCOUNT_FLOWS_SQL, [me.id, me.id, now]),
      db.getAllAsync<{ account_id: string; delta: number }>(CARD_FLOWS_SQL, [baseline, baseline, me.id, now]),
    ]);
    for (const r of f) if (r.account_id) flows.set(r.account_id, r.delta);
    for (const r of c) cards.set(r.account_id, r.delta);
  }
  return rows.map(a => ({
    ...a,
    balance: a.kind === 'card'
      ? Math.max(0, (a.id === 'default:card' ? profile.creditUsed : 0) + (cards.get(a.id) ?? 0))
      : a.opening_balance + (flows.get(a.id) ?? 0),
  }));
}

export type AccountInput = {
  name: string;
  kind: AccountKind;
  openingBalance?: number;
  creditLimit?: number | null;
  dueDay?: number | null;
};

/** Add an account, or edit one (`id`). A default's kind never changes. Returns the id. */
export async function upsertAccount(db: SQLite.SQLiteDatabase, input: AccountInput & { id?: string }): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error('An account needs a name');
  const now = Date.now();
  const id = input.id ?? uuid();
  const card = input.kind === 'card';
  await db.withTransactionAsync(async () => {
    if (input.id) {
      await db.runAsync(
        `UPDATE account SET name = ?,
            kind = CASE WHEN is_default = 1 THEN kind ELSE ? END,
            opening_balance = COALESCE(?, opening_balance),
            credit_limit = ?, due_day = ?, updated_at = ?
          WHERE id = ?`,
        [name, input.kind, input.openingBalance === undefined ? null : Math.round(input.openingBalance),
          card ? input.creditLimit ?? null : null, card ? input.dueDay ?? null : null, now, id],
      );
    } else {
      await db.runAsync(
        `INSERT INTO account (id, name, kind, opening_balance, credit_limit, due_day, is_default, is_archived, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM account), ?, ?)`,
        [id, name, input.kind, Math.round(input.openingBalance ?? 0),
          card ? input.creditLimit ?? null : null, card ? input.dueDay ?? null : null, now, now],
      );
    }
    await queueUpsert(db, 'account', id);
  });
  return id;
}

/**
 * Hide an account from pickers. Its entries and balance still count: archiving says "I don't
 * use it now", not "that money is gone". A default stays, since entries fall back to it.
 */
export async function archiveAccount(db: SQLite.SQLiteDatabase, id: string, archived = true): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE account SET is_archived = ?, updated_at = ? WHERE id = ? AND is_default = 0',
      [archived ? 1 : 0, Date.now(), id],
    );
    await queueUpsert(db, 'account', id);
  });
}
