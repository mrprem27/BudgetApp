import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, type, space } from '../tokens';
import { SheetModal } from '../ui/SheetModal';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import { PersonPicker } from './PersonPicker';
import { useCombineSame } from '../../hooks/useCombineSame';

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
  const { candidates, picked, setPicked, entryCount, busy, confirm } = useCombineSame(visible, personId, onClose);

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
