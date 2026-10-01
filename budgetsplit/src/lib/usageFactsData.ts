import type * as SQLite from 'expo-sqlite';
import { getLedgerStats } from '../db/queries/transactions';
import { getStoredSession } from './serverApi';
import { setUsageFacts, band } from './usageEvents';

/** The install facts that come from the ledger and the session: how much is logged (as a band), and whether signed in. */
export async function sendUsageFacts(db: SQLite.SQLiteDatabase): Promise<void> {
  const [ledger, session] = await Promise.all([getLedgerStats(db), getStoredSession().catch(() => null)]);
  setUsageFacts({ entries: band(ledger.txnCount), signed_in: !!session });
}
