import type * as SQLite from 'expo-sqlite';
import { getCategories } from '../db/queries/categories';
import { insertPending } from '../db/queries/pending';
import { matchCategory } from './smartCategory';
import { detectPayMethod } from './payMethodDetect';
import type { DetectedParse } from './importDetect';
import type { TxnKind } from '../constants/enums';

/** Queue a parsed statement into Review. Returns how many rows were queued. */
export async function queueImportedRows(db: SQLite.SQLiteDatabase, { result, source }: DetectedParse): Promise<number> {
  // The USER'S catalog, per kind — `matchCategory`'s contract is "never guess a
  // category they don't have", and guessing from the seed list could assign one
  // they renamed or deleted. Same source the voice and confirm paths already use.
  const [expenseCats, incomeCats, transferCats] = await Promise.all([
    getCategories(db, 'expense'), getCategories(db, 'income'), getCategories(db, 'transfer'),
  ]);
  const catalogFor: Record<TxnKind, { name: string }[]> = {
    expense: expenseCats, income: incomeCats, settlement: transferCats,
  };
  await insertPending(db, result.rows.map(r => ({
    date: r.date,
    amount: r.amount,
    description: r.description,
    kind: r.kind,
    // Keep the category when the source already carries one (our own export, a
    // Paytm tag); otherwise guess it from the description, against the user's
    // catalog for that kind.
    category: r.category ?? matchCategory(r.description, catalogFor[r.kind]),
    direction: r.direction,
    source,
    // Prefer the parser's detected From; else sniff the row's raw text. Null
    // when nothing matches — the user sets it in Review.
    pay_method: r.payMethod ?? detectPayMethod(r.raw) ?? null,
    raw: r.raw,
  })));
  return result.rows.length;
}
