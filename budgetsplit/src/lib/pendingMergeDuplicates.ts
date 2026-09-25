import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MergeDuplicate } from './sync';

/**
 * Possible duplicates Merge found (`DQ-94`), persisted so they can still be
 * shown after the screen that ran the merge is gone.
 *
 * Two of the three sign-in screens navigate away on success — `app/auth.tsx`
 * replaces itself with `/settings/account`, and onboarding's `SignInStage`
 * unmounts once onboarding finishes — so the in-memory list a hook holds
 * during the merge itself doesn't survive to be shown. `settings/account.tsx`
 * is the one screen every path either lands on or can always be reached from,
 * so it reads this on mount and shows the review there. A richer shape than a
 * plain preference (`settings.ts`'s own header), so it gets its own module.
 */
const KEY = 'pending_merge_duplicates';

export async function getPendingMergeDuplicates(): Promise<MergeDuplicate[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as MergeDuplicate[] : [];
  } catch {
    return [];
  }
}

export async function setPendingMergeDuplicates(duplicates: MergeDuplicate[]): Promise<void> {
  if (duplicates.length === 0) { await AsyncStorage.removeItem(KEY); return; }
  await AsyncStorage.setItem(KEY, JSON.stringify(duplicates));
}

export async function clearPendingMergeDuplicates(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
