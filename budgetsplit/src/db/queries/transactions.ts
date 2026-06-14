import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { materializeInstances } from '../../lib/recurrence';

export type Txn = {
  id: string;
  group_id: string;
  kind: 'income' | 'expense' | 'settlement';
  entry_mode: 'quick' | 'itemized';
  date: number;
  category: string;
  note: string | null;
  attachment_uri: string | null;
  tags: string | null;
  recur_freq: 'daily' | 'weekly' | 'monthly' | 'custom' | null;
  recur_interval: number | null;
  recur_end: number | null;
  recur_override_date: number | null;
  is_deleted: number;
  created_at: number;
  updated_at: number;
};

export type TxnPayment = { txn_id: string; person_id: string; amount: number };
export type TxnShare  = { txn_id: string; person_id: string; amount: number };

export type LineItem = {
  id: string;
  txn_id: string;
  name: string;
  qty: number;
  unit_price: number;
  assigned_to: string;
};

export type TxnWithSplits = Txn & {
  payments: Array<{ personId: string; amount: number }>;
  shares:   Array<{ personId: string; amount: number }>;
};

export async function getTransactionsForGroup(
  db: SQLite.SQLiteDatabase,
  groupId: string,
): Promise<TxnWithSplits[]> {
  const now = Date.now();

  const nonRecurringTxns = await db.getAllAsync<Txn>(
    `SELECT * FROM txn WHERE group_id = ? AND is_deleted = 0 AND recur_freq IS NULL ORDER BY date DESC, created_at DESC`,
    [groupId],
  );
  const nonRecurring = await Promise.all(nonRecurringTxns.map(t => loadSplits(db, t)));

  const recurTxns = await db.getAllAsync<Txn>(
    `SELECT * FROM txn WHERE group_id = ? AND is_deleted = 0 AND recur_freq IS NOT NULL`,
    [groupId],
  );
  const instances: TxnWithSplits[] = [];
  for (const rt of recurTxns) {
    const rw = await loadSplits(db, rt);
    instances.push(...materializeInstances(rw, rt.date, now));
  }

  return [...nonRecurring, ...instances].sort((a, b) => b.date - a.date || b.created_at - a.created_at);
}

export async function getTransactionsInRange(
  db: SQLite.SQLiteDatabase,
  groupId: string | null,
  fromMs: number,
  toMs: number,
): Promise<TxnWithSplits[]> {
  // Non-recurring txns in range
  const args: (string | number)[] = [fromMs, toMs];
  let where = 'WHERE t.date >= ? AND t.date <= ? AND t.is_deleted = 0 AND t.recur_freq IS NULL';
  if (groupId) {
    where += ' AND t.group_id = ?';
    args.push(groupId);
  }
  const txns = await db.getAllAsync<Txn>(
    `SELECT t.* FROM txn t ${where} ORDER BY t.date DESC`,
    args,
  );
  const nonRecurring = await Promise.all(txns.map(t => loadSplits(db, t)));

  // Recurring parent txns that could have instances in the range
  const recurArgs: (string | number)[] = [fromMs];
  let recurWhere = 'WHERE t.recur_freq IS NOT NULL AND t.is_deleted = 0 AND (t.recur_end IS NULL OR t.recur_end >= ?)';
  if (groupId) {
    recurWhere += ' AND t.group_id = ?';
    recurArgs.push(groupId);
  }
  const recurTxns = await db.getAllAsync<Txn>(
    `SELECT t.* FROM txn t ${recurWhere}`,
    recurArgs,
  );
  const instances: TxnWithSplits[] = [];
  for (const rt of recurTxns) {
    const rw = await loadSplits(db, rt);
    instances.push(...materializeInstances(rw, fromMs, toMs));
  }

  return [...nonRecurring, ...instances].sort((a, b) => b.date - a.date);
}

async function loadSplits(db: SQLite.SQLiteDatabase, txn: Txn): Promise<TxnWithSplits> {
  const payments = await db.getAllAsync<TxnPayment>(
    'SELECT * FROM txn_payment WHERE txn_id = ?', [txn.id],
  );
  const shares = await db.getAllAsync<TxnShare>(
    'SELECT * FROM txn_share WHERE txn_id = ?', [txn.id],
  );
  return {
    ...txn,
    payments: payments.map(p => ({ personId: p.person_id, amount: p.amount })),
    shares:   shares.map(s => ({ personId: s.person_id, amount: s.amount })),
  };
}

export type InsertTxnInput = {
  groupId: string;
  kind: 'income' | 'expense' | 'settlement';
  entryMode: 'quick' | 'itemized';
  date: number;
  category: string;
  note?: string;
  attachmentUri?: string;
  tags?: string[];
  recurFreq?: 'daily' | 'weekly' | 'monthly' | 'custom';
  recurInterval?: number;
  recurEnd?: number;
  payments: Array<{ personId: string; amount: number }>;
  shares:   Array<{ personId: string; amount: number }>;
};

export async function insertTxn(
  db: SQLite.SQLiteDatabase,
  input: InsertTxnInput,
): Promise<string> {
  const id = uuid();
  const now = Date.now();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO txn
         (id,group_id,kind,entry_mode,date,category,note,attachment_uri,tags,
          recur_freq,recur_interval,recur_end,is_deleted,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`,
      [
        id, input.groupId, input.kind, input.entryMode, input.date,
        input.category, input.note ?? null, input.attachmentUri ?? null,
        input.tags ? JSON.stringify(input.tags) : null,
        input.recurFreq ?? null, input.recurInterval ?? null, input.recurEnd ?? null,
        now, now,
      ],
    );
    for (const p of input.payments) {
      await db.runAsync(
        'INSERT INTO txn_payment (txn_id, person_id, amount) VALUES (?, ?, ?)',
        [id, p.personId, p.amount],
      );
    }
    for (const s of input.shares) {
      await db.runAsync(
        'INSERT INTO txn_share (txn_id, person_id, amount) VALUES (?, ?, ?)',
        [id, s.personId, s.amount],
      );
    }
  });

  return id;
}

export type InsertItemizedTxnInput = InsertTxnInput & {
  items: Array<{
    name: string;
    qty: number;
    unitPrice: number;
    assignedTo: string[];
  }>;
};

export async function insertItemizedTxn(
  db: SQLite.SQLiteDatabase,
  input: InsertItemizedTxnInput,
): Promise<string> {
  const id = uuid();
  const now = Date.now();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO txn
         (id,group_id,kind,entry_mode,date,category,note,attachment_uri,tags,
          recur_freq,recur_interval,recur_end,is_deleted,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`,
      [
        id, input.groupId, input.kind, 'itemized', input.date,
        input.category, input.note ?? null, input.attachmentUri ?? null,
        input.tags ? JSON.stringify(input.tags) : null,
        null, null, null, now, now,
      ],
    );
    for (const item of input.items) {
      await db.runAsync(
        'INSERT INTO line_item (id, txn_id, name, qty, unit_price, assigned_to) VALUES (?, ?, ?, ?, ?, ?)',
        [uuid(), id, item.name, item.qty, item.unitPrice, JSON.stringify(item.assignedTo)],
      );
    }
    for (const p of input.payments) {
      await db.runAsync(
        'INSERT INTO txn_payment (txn_id, person_id, amount) VALUES (?, ?, ?)',
        [id, p.personId, p.amount],
      );
    }
    for (const s of input.shares) {
      await db.runAsync(
        'INSERT INTO txn_share (txn_id, person_id, amount) VALUES (?, ?, ?)',
        [id, s.personId, s.amount],
      );
    }
  });

  return id;
}

export async function softDeleteTxn(db: SQLite.SQLiteDatabase, txnId: string): Promise<void> {
  await db.runAsync(
    'UPDATE txn SET is_deleted=1, updated_at=? WHERE id=?',
    [Date.now(), txnId],
  );
}

export async function getLineItems(db: SQLite.SQLiteDatabase, txnId: string): Promise<LineItem[]> {
  return db.getAllAsync<LineItem>('SELECT * FROM line_item WHERE txn_id = ?', [txnId]);
}
