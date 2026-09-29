import { useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { combinableWith, countCombinableEntries, type Person } from '../db/queries/persons';
import { combinePeople } from '../db/queries/personRemap';
import { useDataRefresh } from '../components/system/DataRefreshProvider';
import { haptic } from '../lib/haptics';

/** Merging a duplicate person into `personId`: who can be picked, what moves, and doing it. */
export function useCombineSame(visible: boolean, personId: string, onDone: () => void) {
  const db = useSQLiteContext();
  const { refresh } = useDataRefresh();
  const [candidates, setCandidates] = useState<Person[]>([]);
  const [picked, setPicked] = useState<Person | null>(null);
  const [entryCount, setEntryCount] = useState(0);
  const [busy, setBusy] = useState(false);

  // Fresh every time the sheet opens — a person combined a moment ago on another
  // screen must not still be offered here.
  useEffect(() => {
    if (!visible) { setPicked(null); return; }
    let alive = true;
    combinableWith(db, personId).then(c => { if (alive) setCandidates(c); }).catch(() => {});
    return () => { alive = false; };
  }, [visible, db, personId]);

  useEffect(() => {
    if (!picked) return;
    // The last pick's count must not label this one while its own is read.
    setEntryCount(0);
    let alive = true;
    countCombinableEntries(db, picked.id).then(n => { if (alive) setEntryCount(n); }).catch(() => {});
    return () => { alive = false; };
  }, [picked, db]);

  async function confirm() {
    if (!picked) return;
    setBusy(true);
    try {
      await combinePeople(db, personId, picked.id);
      haptic.success();
      refresh();
      onDone();
    } catch {
      haptic.error();
    } finally {
      setBusy(false);
    }
  }

  return { candidates, picked, setPicked, entryCount, busy, confirm };
}
