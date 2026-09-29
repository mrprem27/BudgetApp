import { useSQLiteContext } from 'expo-sqlite';
import { Alert } from 'react-native';
import { insertCategory, renameCategory, deleteCategory, type Category } from '../db/queries/categories';
import { useDataRefresh } from '../components/system/DataRefreshProvider';
import { haptic } from '../lib/haptics';
import type { CategoryKind } from '../constants/enums';

/**
 * The Categories screen's writes. Each returns whether it worked, after telling
 * the user when it did not — so the screen only resets its own form on `true`.
 */
export function useCategoryWrites(kind: CategoryKind, reload: () => void | Promise<void>) {
  const db = useSQLiteContext();
  const { refresh } = useDataRefresh();

  async function run(write: () => Promise<void>, success: () => void): Promise<boolean> {
    try {
      await write();
      success();
      reload();
      refresh();
      return true;
    } catch {
      haptic.error();
      Alert.alert('Something went wrong', 'Please try again.');
      return false;
    }
  }

  return {
    add: (name: string, icon: string, color: string, section: string | null) =>
      run(async () => { await insertCategory(db, name, icon, color, kind, section); }, haptic.success),
    /** Adopt a name already in use into the catalog, so its spend splits out of "Others". */
    adopt: (name: string, icon: string, color: string) =>
      run(async () => { await insertCategory(db, name, icon, color, kind, 'Other'); }, haptic.success),
    rename: (cat: Category, name: string) =>
      run(() => renameCategory(db, cat.id, name), haptic.success),
    remove: (cat: Category) =>
      run(() => deleteCategory(db, cat.id), haptic.warning),
  };
}
