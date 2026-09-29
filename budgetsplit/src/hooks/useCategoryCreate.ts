import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { insertCategory, type Category } from '../db/queries/categories';
import type { CategoryKind } from '../constants/enums';
import { colors } from '../theme';

/**
 * A category typed into a picker: saved, then placed in the picker's list in
 * name order. Quick Add sorted it in and Itemized appended it to the end — one
 * action, two results.
 */
export function useCategoryCreate(setCategories: Dispatch<SetStateAction<Category[]>>) {
  const db = useSQLiteContext();
  return useCallback(async (name: string, kind: CategoryKind = 'expense') => {
    const created = await insertCategory(db, name, 'tag', colors.accent, kind);
    setCategories(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created;
  }, [db, setCategories]);
}
