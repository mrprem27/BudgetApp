import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, type, space } from '../../tokens';
import { Card } from '../../ui/Card';
import { Banner } from '../../ui/Banner';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { SecondaryButton } from '../../ui/SecondaryButton';
import { conflictFields } from '../../../lib/txnHistory';

type Props = {
  yours: Record<string, unknown>;
  theirs: Record<string, unknown>;
  onKeepYours: () => void;
  onKeepTheirs: () => void;
  busy?: boolean;
};

/**
 * "Keep yours or theirs?" (SPEC-SERVER.md §6.3, layout picked in S15: two
 * stacked cards). The transaction was changed on another phone before this
 * one's change arrived. Theirs is what the phone shows right now; yours is kept
 * here until the person chooses. Never blended — money is one person's call.
 */
export function ConflictCard({ yours, theirs, onKeepYours, onKeepTheirs, busy }: Props) {
  const rows = conflictFields(yours, theirs);

  const side = (label: string, which: 'yours' | 'theirs') => (
    <Card padded style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      {rows.map(r => (
        <View key={r.field} style={styles.row}>
          <Text style={styles.field}>{r.field}</Text>
          <Text style={[styles.value, r.differs && styles.differs]} numberOfLines={2}>{r[which]}</Text>
        </View>
      ))}
      {which === 'yours'
        ? <PrimaryButton label="Keep yours" onPress={onKeepYours} disabled={busy} style={styles.cta} />
        : <SecondaryButton label="Keep theirs" onPress={onKeepTheirs} disabled={busy} style={styles.cta} />}
    </Card>
  );

  return (
    <View style={styles.wrap}>
      <Banner
        tone={colors.healthAmber}
        icon="git-merge"
        text="This was changed on another phone before your change arrived. Pick the one that’s right — they won’t be mixed."
      />
      {side('Yours', 'yours')}
      {side('Theirs · on the other phone', 'theirs')}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  card: { gap: space.sm },
  label: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  field: { ...type.body, color: colors.textSecondary },
  value: { ...type.body, color: colors.textPrimary, flexShrink: 1, textAlign: 'right' },
  differs: { color: colors.healthAmber, fontFamily: type.button.fontFamily },
  cta: { marginTop: space.sm },
});
