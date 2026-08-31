import * as SQLite from 'expo-sqlite';
import { NOT_AWAITING_APPROVAL } from './approvalSql';
import { memberActive } from './memberSql';
import { simplify } from '../../lib/settle';
import { asReceivableState, type ReceivableState } from '../../constants/enums';

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
function netSql(table: 'txn_payment' | 'txn_share', scope: 'group' | 'global' | 'per-group'): string {
  const where = scope === 'group' ? 't.group_id = ?' : CROSS_GROUP_FILTER;
  const select = scope === 'per-group' ? 't.group_id, s.person_id' : 's.person_id';
  const by = scope === 'per-group' ? 't.group_id, s.person_id' : 's.person_id';
  return `SELECT ${select}, SUM(s.amount) as total
     FROM ${table} s
     JOIN txn t ON t.id = s.txn_id
     JOIN budget_group bg ON bg.id = t.group_id
    WHERE ${BALANCE_TXN_FILTER} AND ${NOT_AWAITING_APPROVAL} AND ${where}
    GROUP BY ${by}`;
}

export const GROUP_PAYMENTS_SQL = netSql('txn_payment', 'group');
export const GROUP_SHARES_SQL = netSql('txn_share', 'group');
export const GLOBAL_PAYMENTS_SQL = netSql('txn_payment', 'global');
export const GLOBAL_SHARES_SQL = netSql('txn_share', 'global');
export const PER_GROUP_PAYMENTS_SQL = netSql('txn_payment', 'per-group');
export const PER_GROUP_SHARES_SQL = netSql('txn_share', 'per-group');

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

/**
 * Every shared group's net, in one pass, keyed by group.
 *
 * Two queries total rather than two per group, so this stays cheaper than the
 * global pair it replaces even with a dozen groups.
 */
export async function getNetByGroup(
  db: SQLite.SQLiteDatabase,
): Promise<Map<string, NetBalance>> {
  const [payments, shares] = await Promise.all([
    db.getAllAsync<{ group_id: string; person_id: string; total: number }>(PER_GROUP_PAYMENTS_SQL),
    db.getAllAsync<{ group_id: string; person_id: string; total: number }>(PER_GROUP_SHARES_SQL),
  ]);
  const byGroup = new Map<string, NetBalance>();
  const bump = (groupId: string, personId: string, delta: number) => {
    let net = byGroup.get(groupId);
    if (!net) { net = {}; byGroup.set(groupId, net); }
    net[personId] = (net[personId] ?? 0) + delta;
  };
  for (const p of payments) bump(p.group_id, p.person_id, p.total);
  for (const s of shares) bump(s.group_id, s.person_id, -s.total);
  return byGroup;
}

/**
 * What each person nets out to with me, across every shared group.
 *
 * **Simplified per GROUP, then summed — never simplified globally.** That
 * distinction is the whole function, and getting it wrong lost real debt.
 *
 * `simplify` is a greedy match over whatever net it is handed: it will pair the
 * largest debtor against the largest creditor whether or not those two people
 * have ever met. Run over the *global* net it therefore invented settlements
 * between strangers — and the caller then kept only the legs naming me and
 * silently dropped the rest. Concretely: I owe Aarav ₹500 in the flat, Priya owes
 * me ₹500 from the trip, and Aarav and Priya share nothing. The global match
 * emitted the single leg "Priya pays Aarav ₹500", which names neither me nor a
 * pair that can transact — so both of my balances read zero and Home, Personal,
 * Insights, Groups and Reminders all announced **"Settled up"** while the flat's
 * own screen still said I owed ₹500.
 *
 * Per group, the same greedy match can only ever pair people who share that
 * group, which is exactly the set of people who can settle with each other. Debts
 * across groups then cancel by summation, which is what the docs always claimed
 * this did.
 */
async function netPerPerson(
  db: SQLite.SQLiteDatabase,
  meId: string,
): Promise<Map<string, number>> {
  const byGroup = await getNetByGroup(db);
  const out = new Map<string, number>();
  const bump = (personId: string, delta: number) =>
    out.set(personId, (out.get(personId) ?? 0) + delta);

  for (const net of byGroup.values()) {
    for (const s of simplify(net)) {
      // Sign convention, unchanged: positive means they owe me.
      if (s.from === meId) bump(s.to, -s.amount);
      else if (s.to === meId) bump(s.from, s.amount);
    }
  }
  return out;
}

export type FriendBalance = {
  personId: string;
  name: string;
  avatarColor: string;
  imageUri: string | null;
  net: number;
  groupCount: number;
  /** Whether what they owe still counts as cover. See `person.receivable_state`. */
  receivableState: ReceivableState;
};

export async function getFriendBalances(
  db: SQLite.SQLiteDatabase,
  meId: string,
): Promise<FriendBalance[]> {
  const rows = await db.getAllAsync<{ person_id: string; name: string; avatar_color: string; image_uri: string | null; receivable_state: string | null; group_count: number }>(
    `SELECT p.id as person_id, p.name, p.avatar_color, p.image_uri, p.receivable_state,
            COUNT(DISTINCT gm2.group_id) as group_count
     FROM group_member gm1
     JOIN group_member gm2 ON gm1.group_id = gm2.group_id AND gm2.person_id != ?
       AND ${memberActive('gm2')}
     JOIN person p ON p.id = gm2.person_id
     JOIN budget_group bg ON bg.id = gm1.group_id AND bg.is_personal = 0
     WHERE gm1.person_id = ? AND ${memberActive('gm1')}
     GROUP BY p.id`,
    [meId, meId],
  );

  const perPerson = await netPerPerson(db, meId);

  /*
   * Somebody who LEFT, and still owes or is owed.
   *
   * The membership query above is "who is in a group with me now", and after a
   * removal that correctly stops including them. But their entries do not go
   * anywhere — that is the whole point of removal being soft — so their balance
   * is still real and still in `netPerPerson`. Dropping them from this list would
   * make that money disappear from `getMyExposure` and every owe/owed headline
   * built on it, while the group's own screen still showed it.
   *
   * So they stay while there is something outstanding, and fall off the list by
   * themselves once it is settled. `groupCount: 0` is the honest answer to "how
   * many groups do we share" and is what marks them as a former member.
   */
  const listed = new Set(rows.map(r => r.person_id));
  const owedBy = [...perPerson.entries()].filter(([pid, net]) => net !== 0 && !listed.has(pid));
  const formerRows = owedBy.length === 0 ? [] : await db.getAllAsync<{
    person_id: string; name: string; avatar_color: string; image_uri: string | null;
    receivable_state: string | null; group_count: number;
  }>(
    `SELECT id AS person_id, name, avatar_color, image_uri, receivable_state, 0 AS group_count
       FROM person WHERE id IN (${owedBy.map(() => '?').join(',')})`,
    owedBy.map(([pid]) => pid),
  );

  return [...rows, ...formerRows].map(r => {
    return {
      personId: r.person_id,
      name: r.name,
      avatarColor: r.avatar_color,
      imageUri: r.image_uri,
      net: perPerson.get(r.person_id) ?? 0,
      groupCount: r.group_count,
      receivableState: asReceivableState(r.receivable_state),
    };
  });
  // (No post-filter: everyone you share a non-personal group with is shown, incl.
  // settled-up friends at net 0 and archived-group balances — the old
  // `f.net !== 0 || f.groupCount > 0` guard was a no-op since group_count >= 1 always.)
}

/**
 * My total Owe/Owed exposure across all groups — the single source of truth for
 * every *global* owe/owed headline (Insights, Personal, Groups tab, Reminders).
 * Built on {@link getFriendBalances}, which simplifies each shared group and then
 * sums the legs naming me — never a global simplification, which could route a
 * debt through somebody I share no group with and then drop it. A person counts
 * toward `owe` OR `owed` once, by their single net figure (never both), so a debt
 * in one group and a credit in another for the same person cancel out.
 */
export type MyExposure = {
  /** Total paise I owe (positive). */
  owe: number;
  /** Total paise owed to me (positive). */
  owed: number;
  /**
   * The part of `owed` from people still marked `expected` — what may be treated
   * as cover. Written-off balances stay in `owed` (they are still owed, and still
   * shown) but drop out here.
   *
   * Two figures rather than a filtered `owed`, because the display and the maths
   * want different ones: every screen shows the full balance; only the raid and
   * the debt-load factor consume this.
   */
  owedExpected: number;
  /** owed - owe. */
  net: number;
  owePeople: number;
  owedPeople: number;
  /** The canonical signed-per-person list (net > 0 = they owe me). */
  perPerson: FriendBalance[];
};

/** Pure aggregation of a per-person balance list into my totals. Exported for testing. */
export function summarizeExposure(perPerson: FriendBalance[]): MyExposure {
  let owe = 0, owed = 0, owedExpected = 0, owePeople = 0, owedPeople = 0;
  for (const f of perPerson) {
    if (f.net > 0) {
      owed += f.net;
      owedPeople += 1;
      if (f.receivableState === 'expected') owedExpected += f.net;
    } else if (f.net < 0) { owe += -f.net; owePeople += 1; }
  }
  return { owe, owed, owedExpected, net: owed - owe, owePeople, owedPeople, perPerson };
}

export async function getMyExposure(
  db: SQLite.SQLiteDatabase,
  meId: string,
): Promise<MyExposure> {
  return summarizeExposure(await getFriendBalances(db, meId));
}
