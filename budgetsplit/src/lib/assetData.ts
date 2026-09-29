import type * as SQLite from 'expo-sqlite';
import { getAssetById } from '../db/queries/assets';
import { getTransactionsForAsset } from '../db/queries/transactions';
import { getMe } from '../db/queries/persons';

/** One asset and the movements that built its balance. */
export async function loadAssetDetail(db: SQLite.SQLiteDatabase, id: string) {
  const [asset, txns, me] = await Promise.all([getAssetById(db, id), getTransactionsForAsset(db, id), getMe(db)]);
  return { asset, txns, myId: me?.id ?? '' };
}
