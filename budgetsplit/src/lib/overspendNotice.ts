import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OverspendRaid } from '../db/queries/savings';

/**
 * Persists an overspend auto-raid result across the moment it actually happens
 * (app boot / foreground, in `app/_layout.tsx`) to the moment the user can see
 * it (the Savings tab). Without this, a raid triggered while the app wasn't on
 * the Savings tab was silently discarded — cash was already fixed up by the
 * time the user got there, so the notice never appeared at all.
 */
const KEY = 'pending_overspend_notice_v1';

export async function getPendingOverspendNotice(): Promise<OverspendRaid | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OverspendRaid;
  } catch {
    return null;
  }
}

export async function setPendingOverspendNotice(raid: OverspendRaid | null): Promise<void> {
  if (raid === null) {
    await AsyncStorage.removeItem(KEY);
  } else {
    await AsyncStorage.setItem(KEY, JSON.stringify(raid));
  }
}
