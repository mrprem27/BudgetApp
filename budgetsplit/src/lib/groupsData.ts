import type * as SQLite from 'expo-sqlite';
import { getAllGroups } from '../db/queries/groups';
import { getMe } from '../db/queries/persons';
import { getMyExposure } from '../db/queries/balances';

/** What turning splitting off would hide: shared groups, and money still unsettled either way. */
export async function splittingFootprint(db: SQLite.SQLiteDatabase): Promise<{ shared: number; outstanding: number }> {
  const [grps, me] = await Promise.all([getAllGroups(db), getMe(db)]);
  const exp = me ? await getMyExposure(db, me.id) : null;
  return { shared: grps.filter(g => g.is_personal !== 1).length, outstanding: exp ? exp.owe + exp.owed : 0 };
}
