import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { colors, type, space } from '../tokens';
import { SheetModal } from '../ui/SheetModal';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import { PersonPicker } from './PersonPicker';
import { combinableWith, countCombinableEntries, type Person } from '../../db/queries/persons';
import { combinePeople } from '../../db/queries/personRemap';
import { useDataRefresh } from '../system/DataRefreshProvider';
import { haptic } from '../../lib/haptics';

/**
 * "Same person as…" (`DQ-94` part 2, task P3): two placeholders that are really
 * one human, combined by hand from the person screen.
 *
 * `personId` — the screen you're on — is always the one that survives:
 * `combinePeople`'s own name, contact details and trust choices win on a clash.
 * The picked person's entries, splits, item assignments and trust move onto it,
 * and the picked person's row is gone.
 */
export function CombineSameSheet({
  visible, onClose, personId, personName,
}: {
  visible: boolean;
  onClose: () => void;
  personId: string;
  personName: string;
}) {
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
    combinableWith(db, personId).then(setCandidates);
  }, [visible, db, personId]);

  useEffect(() => {
    if (!picked) return;
    countCombinableEntries(db, picked.id).then(setEntryCount);
  }, [picked, db]);

  async function confirm() {
    if (!picked) return;
    setBusy(true);
    try {
      await combinePeople(db, personId, picked.id);
      haptic.success();
      refresh();
      onClose();
    } catch {
      haptic.error();
    } finally {
      setBusy(false);
    }
  }

  return (
    <SheetModal visible={visible} onClose={onClose} title="Same person as…">
      {!picked ? (
        <>
          <Text style={styles.intro}>
            Pick the other entry for {personName} — everything they hold moves here, and the duplicate is gone.
          </Text>
          <PersonPicker
            persons={candidates}
            selected={[]}
            onToggle={id => setPicked(candidates.find(p => p.id === id) ?? null)}
            multi={false}
            placeholder="Search people…"
          />
        </>
      ) : (
        <>
          <Text style={styles.intro}>
            <Text style={styles.bold}>{picked.name}</Text> becomes <Text style={styles.bold}>{personName}</Text>.
            {entryCount > 0 && ` ${entryCount} ${entryCount === 1 ? 'entry moves' : 'entries move'} with them.`}
          </Text>
          <View style={styles.actions}>
            <PrimaryButton label={`Combine into ${personName}`} onPress={confirm} loading={busy} />
            <SecondaryButton label="Pick someone else" onPress={() => setPicked(null)} disabled={busy} />
          </View>
        </>
      )}
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  intro: { ...type.body, color: colors.textSecondary, marginBottom: space.md, lineHeight: 20 },
  bold: { fontFamily: 'Inter_600SemiBold', color: colors.textPrimary },
  actions: { gap: space.sm, marginTop: space.md },
});
