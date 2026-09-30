import type * as SQLite from 'expo-sqlite';
import { useStore } from './index';
import { getMe } from '../db/queries/persons';
import { getAllGroups } from '../db/queries/groups';
import { listAccounts } from '../db/queries/accounts';

/**
 * Re-read `me` and `groups` into the store. Most cross-screen writes (a new
 * expense, a budget edit, a savings deposit) touch neither, so the store is only
 * written when something differs — otherwise every consumer would re-render.
 */
export async function hydrateStore(db: SQLite.SQLiteDatabase): Promise<void> {
  const [me, groups, all] = await Promise.all([getMe(db), getAllGroups(db), listAccounts(db, { all: true })]);
  const accounts = all.map(({ id, name, kind, is_default }) => ({ id, name, kind, is_default }));
  const state = useStore.getState();
  const nextMe = me ?? null;
  if (JSON.stringify(state.me) !== JSON.stringify(nextMe)) state.setMe(nextMe);
  if (JSON.stringify(state.groups) !== JSON.stringify(groups)) state.setGroups(groups);
  if (JSON.stringify(state.accounts) !== JSON.stringify(accounts)) state.setAccounts(accounts);
}
