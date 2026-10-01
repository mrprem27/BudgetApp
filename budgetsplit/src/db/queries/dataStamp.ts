import type * as SQLite from 'expo-sqlite';
import { prefsVersion } from '../../lib/prefsVersion';
import { dayKey } from '../../lib/streak';

/**
 * A value that changes whenever anything a screen shows could have: a write on this connection
 * (`total_changes`), a commit from another one (`data_version`: sync, the voice drain), a
 * preference a loader reads, or the calendar day. One round trip.
 *
 * `useScreenData` compares it on focus and skips the reload when it is unchanged (`U-02`), so a
 * write that forgot to call `refresh()` is still seen. It asks the database, not the callers.
 */
export async function readDataStamp(db: SQLite.SQLiteDatabase, nowMs: number = Date.now()): Promise<string> {
  const row = await db.getFirstAsync<{ c: number; v: number }>(
    'SELECT total_changes() AS c, (SELECT data_version FROM pragma_data_version) AS v',
  );
  return `${row?.c ?? 0}:${row?.v ?? 0}:${prefsVersion()}:${dayKey(nowMs)}`;
}
