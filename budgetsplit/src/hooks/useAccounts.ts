import { useState } from 'react';
import { Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useScreenData } from './useScreenData';
import { useDataRefresh } from '../components/system/DataRefreshProvider';
import { haptic } from '../lib/haptics';
import {
  getAccounts, upsertAccount, archiveAccount, type AccountInput, type AccountWithBalance,
} from '../db/queries/accounts';
import { recordBalanceAdjustment } from '../db/queries/spendPower';

/**
 * Data + writes for the Accounts screen (`U-68`). Every write moves Money's figures, so each one
 * calls `refresh()` as well as reloading here, like `useAssets`.
 */
export function useAccounts() {
  const db = useSQLiteContext();
  const { refresh } = useDataRefresh();
  const [busy, setBusy] = useState(false);

  const { data, loading, error, refreshing, onRefresh, reload } = useScreenData(async (database) => {
    const [live, archived] = await Promise.all([getAccounts(database), getAccounts(database, { archived: true })]);
    return { live, archived };
  }, []);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      haptic.success();
      await reload();
      refresh();
      return true;
    } catch {
      haptic.error();
      Alert.alert('Couldn’t save that', 'Please try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return {
    accounts: data?.live ?? [],
    archived: data?.archived ?? [],
    loading, error, refreshing, onRefresh, reload, busy,

    create: (input: AccountInput) => run(async () => { await upsertAccount(db, input); }),

    /**
     * Save an account. `balance` is what it holds today: an account nothing has moved yet just
     * starts there; one with history gets a dated Balance adjustment for the gap (`U-64`), so
     * the entries under it still add up.
     */
    save: (account: AccountWithBalance, input: AccountInput & { balance?: number }) => run(async () => {
      const untouched = account.balance === account.opening_balance;
      const gap = input.balance === undefined ? 0 : input.balance - account.balance;
      await upsertAccount(db, {
        ...input,
        id: account.id,
        openingBalance: gap !== 0 && untouched ? input.balance : undefined,
      });
      if (gap !== 0 && !untouched && account.kind !== 'card') {
        await recordBalanceAdjustment(db, account.kind, gap, account.id);
      }
    }),

    archive: (account: AccountWithBalance) => new Promise<boolean>((resolve) => {
      Alert.alert(
        `Stop using ${account.name}?`,
        'It leaves the lists you pick from. Its entries and balance still count.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Stop using', style: 'destructive', onPress: async () => resolve(await run(async () => { await archiveAccount(db, account.id); })) },
        ],
      );
    }),

    unarchive: (id: string) => run(async () => { await archiveAccount(db, id, false); }),
  };
}
