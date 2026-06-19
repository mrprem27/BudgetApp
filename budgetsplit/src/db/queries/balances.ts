import * as SQLite from 'expo-sqlite';

export type NetBalance = Record<string, number>;

export async function getGroupNet(
  db: SQLite.SQLiteDatabase,
  groupId: string,
): Promise<NetBalance> {
  const payments = await db.getAllAsync<{ person_id: string; total: number }>(
    `SELECT tp.person_id, SUM(tp.amount) as total
     FROM txn_payment tp
     JOIN txn t ON t.id = tp.txn_id
     WHERE t.group_id = ? AND t.is_deleted = 0 AND t.kind != 'income'
     GROUP BY tp.person_id`,
    [groupId],
  );
  const shares = await db.getAllAsync<{ person_id: string; total: number }>(
    `SELECT ts.person_id, SUM(ts.amount) as total
     FROM txn_share ts
     JOIN txn t ON t.id = ts.txn_id
     WHERE t.group_id = ? AND t.is_deleted = 0 AND t.kind != 'income'
     GROUP BY ts.person_id`,
    [groupId],
  );

  const net: NetBalance = {};
  for (const p of payments) net[p.person_id] = (net[p.person_id] ?? 0) + p.total;
  for (const s of shares)   net[s.person_id] = (net[s.person_id] ?? 0) - s.total;
  return net;
}

export async function getGlobalNet(
  db: SQLite.SQLiteDatabase,
): Promise<NetBalance> {
  const payments = await db.getAllAsync<{ person_id: string; total: number }>(
    `SELECT tp.person_id, SUM(tp.amount) as total
     FROM txn_payment tp
     JOIN txn t ON t.id = tp.txn_id
     WHERE t.is_deleted = 0 AND t.kind != 'income'
     GROUP BY tp.person_id`,
  );
  const shares = await db.getAllAsync<{ person_id: string; total: number }>(
    `SELECT ts.person_id, SUM(ts.amount) as total
     FROM txn_share ts
     JOIN txn t ON t.id = ts.txn_id
     WHERE t.is_deleted = 0 AND t.kind != 'income'
     GROUP BY ts.person_id`,
  );

  const net: NetBalance = {};
  for (const p of payments) net[p.person_id] = (net[p.person_id] ?? 0) + p.total;
  for (const s of shares)   net[s.person_id] = (net[s.person_id] ?? 0) - s.total;
  return net;
}

export async function getMySpending(
  db: SQLite.SQLiteDatabase,
  meId: string,
  fromMs: number,
  toMs: number,
): Promise<number> {
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(ts.amount), 0) as total
     FROM txn_share ts
     JOIN txn t ON t.id = ts.txn_id
     WHERE ts.person_id = ? AND t.kind = 'expense'
       AND t.is_deleted = 0 AND t.date >= ? AND t.date <= ?`,
    [meId, fromMs, toMs],
  );
  return row?.total ?? 0;
}

export async function getMyIncome(
  db: SQLite.SQLiteDatabase,
  meId: string,
  fromMs: number,
  toMs: number,
): Promise<number> {
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(tp.amount), 0) as total
     FROM txn_payment tp
     JOIN txn t ON t.id = tp.txn_id
     WHERE tp.person_id = ? AND t.kind = 'income'
       AND t.is_deleted = 0 AND t.date >= ? AND t.date <= ?`,
    [meId, fromMs, toMs],
  );
  return row?.total ?? 0;
}
