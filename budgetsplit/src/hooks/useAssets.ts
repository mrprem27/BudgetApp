import { useState } from 'react';
import { Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useScreenData } from './useScreenData';
import { useDataRefresh } from '../components/system/DataRefreshProvider';
import { haptic } from '../lib/haptics';
import { PayMethod } from '../constants/enums';
import {
  getAssets, getArchivedAssets, insertAsset, updateAsset, archiveAsset, deleteAsset,
  restateAssetBalance, transferToAsset, transferFromAsset, setAssetOrder,
  AssetError, type Asset, type AssetKind,
} from '../db/queries/assets';

/**
 * Data + write handlers for the asset register.
 *
 * Every write here changes NET WORTH, which is read on Home, Plan and the health
 * score — so each one calls `refresh()` as well as reloading this screen. A
 * register that updates only itself is how the same money reads two ways on two
 * tabs (AGENTS: "After a write, call `refresh()`").
 *
 * Refusals from the query layer are `AssetError`s and are shown verbatim, because
 * every one of them says something the user needs: the asset is gone, the amount
 * is not a number, or they are trying to sell more than they hold.
 */
export function useAssets() {
  const db = useSQLiteContext();
  const { refresh } = useDataRefresh();
  const [busy, setBusy] = useState(false);

  const { data, loading, error, refreshing, onRefresh, reload } = useScreenData(async (database) => {
    const [live, archived] = await Promise.all([getAssets(database), getArchivedAssets(database)]);
    return { live, archived, total: live.reduce((s, a) => s + a.balance, 0) };
  }, []);

  /** One place that reports a refusal, so no path can fail silently. */
  async function run(fn: () => Promise<void>, successHaptic: 'success' | 'warning' = 'success') {
    setBusy(true);
    try {
      await fn();
      haptic[successHaptic]();
      await reload();
      refresh();
      return true;
    } catch (e) {
      haptic.error();
      Alert.alert(
        'Couldn’t do that',
        e instanceof AssetError ? e.message : 'Please try again.',
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  return {
    assets: data?.live ?? [],
    archived: data?.archived ?? [],
    total: data?.total ?? 0,
    loading, error, refreshing, onRefresh, reload, busy,

    create: (input: { name: string; kind?: AssetKind; icon?: string | null; color?: string | null; balance?: number }) =>
      run(async () => { await insertAsset(db, input); }),

    rename: (id: string, patch: { name?: string; kind?: AssetKind; icon?: string | null; color?: string | null }) =>
      run(async () => { await updateAsset(db, id, patch); }),

    /** A market move: what it is worth now, with no cash changing hands. */
    restate: (id: string, balancePaise: number) =>
      run(async () => { await restateAssetBalance(db, id, balancePaise); }),

    addMoney: (id: string, amountPaise: number, from: PayMethod, note?: string) =>
      run(async () => { await transferToAsset(db, id, amountPaise, from, note); }),

    takeMoney: (id: string, amountPaise: number, to: PayMethod, note?: string) =>
      run(async () => { await transferFromAsset(db, id, amountPaise, to, note); }),

    reorder: (ids: string[]) => run(async () => { await setAssetOrder(db, ids); }),

    /**
     * Archive, with the consequence stated. Net worth drops by the balance, and a
     * user who has actually sold the thing wants a transfer out first so the money
     * lands somewhere — saying that up front is the difference between an honest
     * action and one that quietly makes them poorer on paper.
     */
    archive: (asset: Asset) => new Promise<boolean>((resolve) => {
      Alert.alert(
        `Stop counting ${asset.name}?`,
        asset.balance > 0
          ? `Your net worth drops by ${(asset.balance / 100).toFixed(2)}. Every transfer you made into it stays in your history.\n\n`
            + 'If you sold it, take the money out first so it lands back in your cash.'
          : 'It moves out of your list. Every transfer you made into it stays in your history.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          {
            text: 'Stop counting', style: 'destructive',
            onPress: async () => resolve(await run(async () => { await archiveAsset(db, asset.id, true); }, 'warning')),
          },
        ],
      );
    }),

    unarchive: (id: string) => run(async () => { await archiveAsset(db, id, false); }),

    /** Only ever succeeds for an asset nothing references — a typo, in practice. */
    remove: (asset: Asset) => new Promise<boolean>((resolve) => {
      Alert.alert(
        `Delete ${asset.name}?`,
        'This removes it completely. Only possible because nothing has been transferred in or out of it.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          {
            text: 'Delete', style: 'destructive',
            onPress: async () => {
              const res = await deleteAsset(db, asset.id);
              if (!res.ok) {
                haptic.error();
                Alert.alert(
                  'Keep this one',
                  'Money has moved in or out of it, and those transfers are part of your history. '
                  + 'Stop counting it instead — the history stays and it leaves your list.',
                );
                resolve(false);
                return;
              }
              haptic.warning();
              await reload();
              refresh();
              resolve(true);
            },
          },
        ],
      );
    }),
  };
}
