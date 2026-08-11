import * as SQLite from 'expo-sqlite';
import { simplify } from '../../lib/settle';

export type NetBalance = Record<string, number>;

/**
 * What counts toward a balance between people — written once because it was written four
 * times and two clauses went missing from all four.
 *
 * - `is_deleted = 0` · `kind != 'income'` — money arriving is nobody's debt.
 * - **`recur_freq IS NULL`** — a recurring *rule* is an ordinary `txn` row that carries its
 *   own payment and share rows (that is how `materializeDueOccurrences` reads them back), so
 *   without this the template is counted **and** every occurrence it spawns is counted, for
 *   as long as the rule exists. Every other read path in the app already has this filter.
 */
export const BALANCE_TXN_FILTER = "t.is_deleted = 0 AND t.kind != 'income' AND t.recur_freq IS NULL";

/**
 * The extra clause a **cross-group** balance needs, and a per-group one must not have.
 *
 * A personal settlement is deliberately booked one-sided — `reviewCommit` writes a payment
 * with no share, or a share with no payment — because `computeCash` does
 * `− settledOut + settledIn`, and booking both sides would net to zero and hide that money
 * actually moved. That is correct for cash and catastrophic for a pairwise balance: the
 * unmatched row lands in the global net as a debt owed by you to nobody in particular, and
 * `simplify` then pairs you against whichever friend happens to hold a positive balance.
 *
 * Reachable from a bank import — "Money received from Rahul" commits to Personal by default —
 * so Home would announce that you owe someone you have never transacted with.
 *
 * `getGroupNet` deliberately omits this: it is scoped to a group the caller named, and the
 * personal group has exactly one member, so no pair can be formed there anyway.
 */
export const CROSS_GROUP_FILTER = 'bg.is_personal = 0';

/**
 * All four aggregates have the same shape and differ only in the split table and the scope,
 * so they are built from one template — the drift this fixes came from four hand-written
 * copies. Exported so `balancesSql.test.ts` can run the real SQL rather than a paraphrase.
 */
function netSql(table: 'txn_payment' | 'txn_share', scope: 'group' | 'global'): string {
  const where = scope === 'group' ? 't.group_id = ?' : CROSS_GROUP_FILTER;
  return `SELECT s.person_id, SUM(s.amount) as total
     FROM ${table} s
     JOIN txn t ON t.id = s.txn_id
     JOIN budget_group bg ON bg.id = t.group_id
    WHERE ${BALANCE_TXN_FILTER} AND ${where}
    GROUP BY s.person_id`;
}

export const GROUP_PAYMENTS_SQL = netSql('txn_payment', 'group');
export const GROUP_SHARES_SQL = netSql('txn_share', 'group');
export const GLOBAL_PAYMENTS_SQL = netSql('txn_payment', 'global');
export const GLOBAL_SHARES_SQL = netSql('txn_share', 'global');

export async function getGroupNet(
  db: SQLite.SQLiteDatabase,
  groupId: string,
): Promise<NetBalance> {
  const payments = await db.getAllAsync<{ person_id: string; total: number }>(
    GROUP_PAYMENTS_SQL,
    [groupId],
  );
  const shares = await db.getAllAsync<{ person_id: string; total: number }>(
    GROUP_SHARES_SQL,
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
  const payments = await db.getAllAsync<{ person_id: string; total: number }>(GLOBAL_PAYMENTS_SQL);
  const shares = await db.getAllAsync<{ person_id: string; total: number }>(GLOBAL_SHARES_SQL);

  const net: NetBalance = {};
  for (const p of payments) net[p.person_id] = (net[p.person_id] ?? 0) + p.total;
  for (const s of shares)   net[s.person_id] = (net[s.person_id] ?? 0) - s.total;
  return net;
}

export type FriendBalance = {
  personId: string;
  name: string;
  avatarColor: string;
  imageUri: string | null;
  net: number;
  groupCount: number;
};

export async function getFriendBalances(
  db: SQLite.SQLiteDatabase,
  meId: string,
): Promise<FriendBalance[]> {
  const rows = await db.getAllAsync<{ person_id: string; name: string; avatar_color: string; image_uri: string | null; group_count: number }>(
    `SELECT p.id as person_id, p.name, p.avatar_color, p.image_uri,
            COUNT(DISTINCT gm2.group_id) as group_count
     FROM group_member gm1
     JOIN group_member gm2 ON gm1.group_id = gm2.group_id AND gm2.person_id != ?
     JOIN person p ON p.id = gm2.person_id
     JOIN budget_group bg ON bg.id = gm1.group_id AND bg.is_personal = 0
     WHERE gm1.person_id = ?
     GROUP BY p.id`,
    [meId, meId],
  );

  const net = await getGlobalNet(db);
  const settlements = simplify(net);

  return rows.map(r => {
    let friendNet = 0;
    for (const s of settlements) {
      if (s.from === meId && s.to === r.person_id) friendNet -= s.amount;
      if (s.to === meId && s.from === r.person_id) friendNet += s.amount;
    }
    return {
      personId: r.person_id,
      name: r.name,
      avatarColor: r.avatar_color,
      imageUri: r.image_uri,
      net: friendNet,
      groupCount: r.group_count,
    };
  });
  // (No post-filter: everyone you share a non-personal group with is shown, incl.
  // settled-up friends at net 0 and archived-group balances — the old
  // `f.net !== 0 || f.groupCount > 0` guard was a no-op since group_count >= 1 always.)
}

/**
 * My total Owe/Owed exposure across all groups — the single source of truth for
 * every *global* owe/owed headline (Insights, Personal, Groups tab, Reminders).
 * Built on {@link getFriendBalances}, which nets each person via
 * `simplify(getGlobalNet)` — i.e. "after all settlements", per the spec. A person
 * counts toward `owe` OR `owed` once, by their single net figure (never both), so
 * a debt in one group and a credit in another for the same person cancel out.
 */
export type MyExposure = {
  /** Total paise I owe (positive). */
  owe: number;
  /** Total paise owed to me (positive). */
  owed: number;
  /** owed - owe. */
  net: number;
  owePeople: number;
  owedPeople: number;
  /** The canonical signed-per-person list (net > 0 = they owe me). */
  perPerson: FriendBalance[];
};

/** Pure aggregation of a per-person balance list into my totals. Exported for testing. */
export function summarizeExposure(perPerson: FriendBalance[]): MyExposure {
  let owe = 0, owed = 0, owePeople = 0, owedPeople = 0;
  for (const f of perPerson) {
    if (f.net > 0) { owed += f.net; owedPeople += 1; }
    else if (f.net < 0) { owe += -f.net; owePeople += 1; }
  }
  return { owe, owed, net: owed - owe, owePeople, owedPeople, perPerson };
}

export async function getMyExposure(
  db: SQLite.SQLiteDatabase,
  meId: string,
): Promise<MyExposure> {
  return summarizeExposure(await getFriendBalances(db, meId));
}
