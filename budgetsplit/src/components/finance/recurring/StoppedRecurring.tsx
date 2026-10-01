import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, type } from '../../tokens';
import { Divider } from '../../ui/Divider';
import { ListRow } from '../../ui/ListRow';
import { SectionCard } from '../../ui/SectionCard';
import { AmountText } from '../../ui/AmountText';
import { freqLabel } from '../../../lib/recurrence';
import type { RecurringSub } from '../../../lib/recurringData';

/**
 * Stopped rules: a closed box at the end of the same page (`U-54`, back on 2026-10-01 after a day
 * as a view of its own that replaced the whole list). Out of the way of what is still charging,
 * one tap from being found; each row opens its rule, where it can be started again.
 */
export function StoppedRecurring({ stopped, onOpen }: { stopped: RecurringSub[]; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  if (stopped.length === 0) return null;
  return (
    <SectionCard
      title="Stopped"
      right={<Text style={styles.count}>{stopped.length}</Text>}
      expanded={open}
      onToggle={() => setOpen(o => !o)}
    >
      {stopped.map(s => (
        <View key={s.id}>
          <Divider indent="text" />
          <ListRow
            icon="square"
            iconColor={colors.textMuted}
            title={s.name}
            subtitle={`${s.name === s.category ? '' : `${s.category} · `}${freqLabel(s.freq, s.interval)} · ended`}
            value={<AmountText paise={s.amount} size="sm" forceColor={colors.textMuted} rounded />}
            onPress={() => onOpen(s.id)}
            accessibilityLabel={`${s.name}, stopped`}
          />
        </View>
      ))}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  count: { ...type.amountSM, color: colors.textSecondary },
});
