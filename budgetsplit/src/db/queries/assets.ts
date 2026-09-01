import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { INVESTMENT_CATEGORY } from '../../constants/categories';
import { PayMethod } from '../../constants/enums';
import { getMe } from './persons';
import { getAllGroups, personalGroupOf } from './groups';
import { insertTxnRows } from './transactions';

/**
 * The asset register: what you own that isn't cash.
 *
 * ## Why this exists
 *
 * Money that leaves your account without being spent has to land somewhere. Before
 * this it landed in one number in `settings` called `money.investments`, which
 * could answer "how much is invested" and nothing else — not "what is the gold
 * worth", not "how much is in the FD", not "what did the flat cost". So the two
 * available answers were both wrong: log it as an **expense**, which double-counts
 * (the cash already moved, and the expense counts it again as consumption and eats
 * a budget), or log nothing and watch net worth fall by the amount invested.
 *
 * ## The one rule
 *
 * **A transfer moves money between two things you own, so net worth does not
 * change.** Cash goes down and the asset goes up, or the reverse. Both halves are
 * written in ONE transaction — a half-written transfer is the defect that made
 * ₹50,000 vanish from net worth with a correct-looking row on the ledger, and it
 * is not made less likely by there being more asset rows to hit.
 *
 * The transaction half is a `settlement` in the Personal group, which is what
 * makes every other surface behave: AGENTS §12 excludes settlements from
 * category breakdowns and budgets (so an SIP no longer eats your Food budget),
 * the ledger still shows it (so the money is explainable), and `CASH_TOTALS_SQL`
 * moves cash the right way from the shape alone — payments only for money going
 * out, shares only for money coming back.
 */

export type AssetKind = 'investment' | 'property' | 'gold' | 'deposit' | 'vehicle' | 'other';

export type Asset = {
  id: string;
  name: string;
  kind: AssetKind;
  icon: string | null;
  color: string | null;
  /** Paise. Never negative — see {@link transferFromAsset}. */
  balance: number;
  is_archived: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
};

/** Refusals a caller must handle. Thrown, not returned, because every one of
 *  these means the write did not happen and the UI must say so. */
export class AssetError extends Error {
  constructor(readonly reason: 'no-asset' | 'no-me' | 'no-personal-group' | 'bad-amount' | 'insufficient', message: string) {
    super(message);
    this.name = 'AssetError';
  }
}

const COLUMNS = 'id, name, kind, icon, color, balance, is_archived, sort_order, created_at, updated_at';

/** Live assets, in the user's own order. */
export async function getAssets(db: SQLite.SQLiteDatabase): Promise<Asset[]> {
  return db.getAllAsync<Asset>(
    `SELECT ${COLUMNS} FROM asset WHERE is_archived = 0 ORDER BY sort_order ASC, created_at ASC`,
  );
}

export async function getArchivedAssets(db: SQLite.SQLiteDatabase): Promise<Asset[]> {
  return db.getAllAsync<Asset>(
    `SELECT ${COLUMNS} FROM asset WHERE is_archived = 1 ORDER BY sort_order ASC, created_at ASC`,
  );
}

export async function getAssetById(db: SQLite.SQLiteDatabase, id: string): Promise<Asset | null> {
  return db.getFirstAsync<Asset>(`SELECT ${COLUMNS} FROM asset WHERE id = ?`, [id]);
}

/**
 * What every asset is worth, together.
 *
 * This is the figure that replaced `money.investments`, and it counts LIVE assets
 * only: archiving is how you say "I no longer own this", so an archived row must
 * not keep propping up net worth.
 */
export async function getAssetsTotal(db: SQLite.SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ total: number | null }>(
    'SELECT SUM(balance) AS total FROM asset WHERE is_archived = 0',
  );
  return row?.total ?? 0;
}

export async function insertAsset(
  db: SQLite.SQLiteDatabase,
  input: { name: string; kind?: AssetKind; icon?: string | null; color?: string | null; balance?: number },
): Promise<Asset> {
  const name = input.name.trim();
  if (!name) throw new AssetError('bad-amount', 'An asset needs a name');
  const balance = Math.round(input.balance ?? 0);
  if (!Number.isFinite(balance) || balance < 0) throw new AssetError('bad-amount', 'An asset cannot start negative');

  const id = uuid();
  const now = Date.now();
  const next = await db.getFirstAsync<{ n: number | null }>('SELECT MAX(sort_order) AS n FROM asset');
  await db.runAsync(
    `INSERT INTO asset (id, name, kind, icon, color, balance, is_archived, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [id, name, input.kind ?? 'other', input.icon ?? null, input.color ?? null, balance, (next?.n ?? -1) + 1, now, now],
  );
  return (await getAssetById(db, id))!;
}

/** Rename / recolour / re-kind. Deliberately cannot change `balance` — that only
 *  moves through a transfer or {@link restateAssetBalance}, both of which leave a
 *  row explaining the change. */
export async function updateAsset(
  db: SQLite.SQLiteDatabase,
  id: string,
  patch: { name?: string; kind?: AssetKind; icon?: string | null; color?: string | null },
): Promise<void> {
  const sets: string[] = [];
  const binds: (string | null)[] = [];
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (!n) throw new AssetError('bad-amount', 'An asset needs a name');
    sets.push('name = ?'); binds.push(n);
  }
  if (patch.kind !== undefined) { sets.push('kind = ?'); binds.push(patch.kind); }
  if (patch.icon !== undefined) { sets.push('icon = ?'); binds.push(patch.icon); }
  if (patch.color !== undefined) { sets.push('color = ?'); binds.push(patch.color); }
  if (sets.length === 0) return;
  await db.runAsync(
    `UPDATE asset SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`,
    [...binds, Date.now(), id],
  );
}

/**
 * Stop counting an asset without erasing the transfers that built it.
 *
 * Archive rather than delete, for the same reason a group is archived: the
 * transfers into it are real history and the months they happened in must keep
 * adding up. Net worth drops by the balance, which is the honest reading of "I
 * sold the flat and did not record where the money went" — and the user can say
 * where it went properly with a transfer out first.
 */
export async function archiveAsset(db: SQLite.SQLiteDatabase, id: string, archived = true): Promise<void> {
  await db.runAsync('UPDATE asset SET is_archived = ?, updated_at = ? WHERE id = ?', [archived ? 1 : 0, Date.now(), id]);
}

/** Persist a drag-reorder. */
export async function setAssetOrder(db: SQLite.SQLiteDatabase, idsInOrder: string[]): Promise<void> {
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < idsInOrder.length; i++) {
      await db.runAsync('UPDATE asset SET sort_order = ?, updated_at = ? WHERE id = ?', [i, now, idsInOrder[i]]);
    }
  });
}

/** An asset with transfers against it can be archived but not destroyed; one that
 *  never moved is a typo and can go. */
export async function deleteAsset(db: SQLite.SQLiteDatabase, id: string): Promise<{ ok: true } | { ok: false; reason: 'has-history' }> {
  // Soft-deleted rows count too. The Undo toast can bring one back, and a
  // restored transfer pointing at an asset that no longer exists is an orphan
  // whose balance can never be reconciled.
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM txn WHERE asset_id = ?', [id],
  );
  if ((row?.n ?? 0) > 0) return { ok: false, reason: 'has-history' };
  await db.runAsync('DELETE FROM asset WHERE id = ?', [id]);
  return { ok: true };
}

/** Both sides of a transfer, resolved once so the two directions cannot drift. */
async function transferContext(db: SQLite.SQLiteDatabase, assetId: string, amountPaise: number) {
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
    throw new AssetError('bad-amount', 'A transfer needs a positive amount');
  }
  const [me, groups, asset] = await Promise.all([getMe(db), getAllGroups(db), getAssetById(db, assetId)]);
  if (!me) throw new AssetError('no-me', 'No current user');
  if (!asset) throw new AssetError('no-asset', 'That asset no longer exists');
  const personal = personalGroupOf(groups);
  if (!personal) throw new AssetError('no-personal-group', 'No personal group');
  return { me, asset, personal, amount: Math.round(amountPaise) };
}

/**
 * Cash → asset. Buying gold, funding an SIP, putting money in an FD.
 *
 * Writes the settlement and moves the balance in ONE transaction, using the
 * no-transaction variants of both (expo-sqlite cannot nest). A kill between the
 * two would book the cash out and never raise the asset, so net worth would fall
 * by the amount invested and stay there, under a ledger row that looked entirely
 * correct — undetectable afterwards, because a running balance is not derivable
 * from the rows.
 *
 * `payments` only, `shares` empty: that is the shape `CASH_TOTALS_SQL` reads as
 * `settledOut`, i.e. cash genuinely left. Booking both sides would net to zero and
 * hide the movement.
 */
export async function transferToAsset(
  db: SQLite.SQLiteDatabase,
  assetId: string,
  amountPaise: number,
  /** Which bucket the money leaves, so cash lands in the right place. */
  fromBucket: PayMethod = PayMethod.Bank,
  note?: string,
): Promise<string> {
  const { me, asset, personal, amount } = await transferContext(db, assetId, amountPaise);
  const id = uuid();
  const now = Date.now();

  await db.withTransactionAsync(async () => {
    await insertTxnRows(db, {
      groupId: personal.id,
      kind: 'settlement',
      entryMode: 'quick',
      date: now,
      category: INVESTMENT_CATEGORY,
      note: note ?? `Moved to ${asset.name}`,
      payMethod: fromBucket,
      assetId: asset.id,
      payments: [{ personId: me.id, amount }],
      shares: [],
    }, id, now);
    await db.runAsync(
      'UPDATE asset SET balance = balance + ?, updated_at = ? WHERE id = ?',
      [amount, now, asset.id],
    );
  });
  return id;
}

/**
 * Asset → cash. Selling gold, redeeming an FD, a maturity landing in the bank.
 *
 * The exact reverse, and still **not income**: you already owned this money, it
 * has only changed shape. Counting it as income would inflate every earnings
 * figure and every income-based ratio in the app on the day you sold something.
 *
 * Refuses to overdraw rather than clamping. A clamp would silently write a
 * different number than the one the user typed, and "I sold ₹60,000 of a ₹50,000
 * holding" is a mistake worth stopping, not rounding.
 */
export async function transferFromAsset(
  db: SQLite.SQLiteDatabase,
  assetId: string,
  amountPaise: number,
  /** Which bucket the money arrives in. */
  toBucket: PayMethod = PayMethod.Bank,
  note?: string,
): Promise<string> {
  const { me, asset, personal, amount } = await transferContext(db, assetId, amountPaise);
  if (amount > asset.balance) {
    throw new AssetError('insufficient', `${asset.name} only holds ${(asset.balance / 100).toFixed(2)}`);
  }
  const id = uuid();
  const now = Date.now();

  await db.withTransactionAsync(async () => {
    await insertTxnRows(db, {
      groupId: personal.id,
      kind: 'settlement',
      entryMode: 'quick',
      date: now,
      category: INVESTMENT_CATEGORY,
      note: note ?? `Moved from ${asset.name}`,
      payMethod: toBucket,
      assetId: asset.id,
      // Shares only, no payments — `settledIn`, i.e. cash arriving. The mirror of
      // the outbound shape above, and the same one `reviewCommit` writes for an
      // inbound personal transfer.
      payments: [],
      shares: [{ personId: me.id, amount }],
    }, id, now);
    /*
     * Guarded again HERE, in SQL, inside the transaction.
     *
     * `transferContext` read the balance before the transaction opened, so two
     * overlapping withdrawals could both pass that check and drive the balance
     * below zero — against the never-negative promise the table is built on. The
     * WHERE clause makes the check and the write the same operation.
     */
    const res = await db.runAsync(
      'UPDATE asset SET balance = balance - ?, updated_at = ? WHERE id = ? AND balance >= ?',
      [amount, now, asset.id, amount],
    );
    if (res.changes === 0) {
      throw new AssetError('insufficient', `${asset.name} does not hold that much any more`);
    }
  });
  return id;
}

/**
 * "It's worth more now." A market move, not a transfer.
 *
 * Deliberately does NOT write a transaction: nothing moved between your pockets,
 * so booking a settlement would make cash move for a gain that never touched your
 * bank. Net worth changes, and that is the whole of it. This is the one path that
 * changes a balance without a row, and it is why `updateAsset` cannot.
 */
export async function restateAssetBalance(
  db: SQLite.SQLiteDatabase,
  id: string,
  balancePaise: number,
): Promise<void> {
  const balance = Math.round(balancePaise);
  if (!Number.isFinite(balance) || balance < 0) {
    throw new AssetError('bad-amount', 'An asset cannot be worth less than nothing');
  }
  await db.runAsync('UPDATE asset SET balance = ?, updated_at = ? WHERE id = ?', [balance, Date.now(), id]);
}

/** The name the one-time migration gives the asset it mints from `money.investments`. */
export const MIGRATED_INVESTMENTS_NAME = 'Investments';

/**
 * The asset that `moveToInvestments` targets — the migrated one if it exists,
 * else the first investment-kind asset, else a freshly created one.
 *
 * Exists so the Savings tab's long-standing "Moved to investments" action keeps
 * working unchanged while the register underneath it becomes real.
 */
export async function defaultInvestmentAsset(db: SQLite.SQLiteDatabase): Promise<Asset> {
  const existing = await db.getFirstAsync<Asset>(
    `SELECT ${COLUMNS} FROM asset
      WHERE is_archived = 0 AND (name = ? OR kind = 'investment')
      ORDER BY CASE WHEN name = ? THEN 0 ELSE 1 END, sort_order ASC`,
    [MIGRATED_INVESTMENTS_NAME, MIGRATED_INVESTMENTS_NAME],
  );
  if (existing) return existing;
  return insertAsset(db, { name: MIGRATED_INVESTMENTS_NAME, kind: 'investment' });
}
