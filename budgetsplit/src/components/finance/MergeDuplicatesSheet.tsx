import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors, type, space, radius } from '../tokens';
import { SheetModal } from '../ui/SheetModal';
import { Card } from '../ui/Card';
import { Divider } from '../ui/Divider';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import { formatRupees } from '../../lib/money';
import { useMergeDuplicates } from '../../hooks/useMergeDuplicates';
import type { MergeDuplicate } from '../../lib/sync';

/**
 * Merge adds everything as new, on purpose (`DQ-94`) — no name matching, no
 * silent dedupe. The one exception is shown here, once, after a merge: entries
 * that match an account entry by the app's own duplicate rule (same group,
 * category, amount, within a day). Nothing is removed without being seen —
 * two genuinely identical purchases on the same day are real, so the default
 * for every pair is to keep both.
 */
export function MergeDuplicatesSheet({
  visible, duplicates, onClose,
}: {
  visible: boolean;
  duplicates: MergeDuplicate[];
  onClose: () => void;
}) {
  const { pending, busy, removed, removeMine, removeAll } = useMergeDuplicates(duplicates);

  return (
    <SheetModal visible={visible} onClose={onClose} title="Possible duplicates">
      <Text style={styles.intro}>
        {duplicates.length === 1
          ? 'This entry from your phone looks like one your account already has.'
          : `${duplicates.length} entries from your phone look like ones your account already has.`}
        {' '}Nothing was removed, pick for each one.
      </Text>
      <ScrollView style={styles.list}>
        {duplicates.map(d => {
          const gone = removed.has(d.mine);
          return (
            <Card key={d.mine} style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.category}>{d.category}</Text>
                <Text style={styles.amount}>{formatRupees(d.amount)}</Text>
              </View>
              <Divider indent="none" />
              {gone ? (
                <Text style={styles.doneNote}>This phone’s copy was removed.</Text>
              ) : (
                <SecondaryButton
                  label="Remove this phone’s copy"
                  onPress={() => removeMine(d.mine)}
                  disabled={busy}
                  style={styles.removeButton}
                />
              )}
            </Card>
          );
        })}
      </ScrollView>
      <View style={styles.actions}>
        {pending.length > 1 && (
          <SecondaryButton label={`Remove all ${pending.length}`} onPress={removeAll} disabled={busy} />
        )}
        <PrimaryButton label="Keep both, done reviewing" onPress={onClose} disabled={busy} />
      </View>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  intro: { ...type.body, color: colors.textSecondary, marginBottom: space.md, lineHeight: 20 },
  list: { maxHeight: 360 },
  card: { marginBottom: space.sm, padding: space.md, borderRadius: radius.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: space.sm },
  category: { ...type.body, color: colors.textPrimary },
  amount: { ...type.amountSM, color: colors.textPrimary },
  doneNote: { ...type.label, color: colors.textMuted, paddingTop: space.sm },
  removeButton: { marginTop: space.sm },
  actions: { gap: space.sm, marginTop: space.md },
});
