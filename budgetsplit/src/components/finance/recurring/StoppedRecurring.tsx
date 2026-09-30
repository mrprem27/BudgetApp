import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space } from '../../tokens';
import { Card } from '../../ui/Card';
import { Divider } from '../../ui/Divider';
import { ListRow } from '../../ui/ListRow';
import { AmountText } from '../../ui/AmountText';
import { freqLabel } from '../../../lib/recurrence';
import type { RecurringSub } from '../../../lib/recurringData';

/**
 * Stopped rules behind one row, like archived groups (`U-54`): out of the way of what is still
 * charging, one tap from being found. Money's Recurring screen and every Recurring tab render
 * this one, so stopped rules are findable wherever rules are listed (`U-62`).
 */
export function StoppedRecurring({ stopped, onOpen }: { stopped: RecurringSub[]; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  if (stopped.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <Card clip>
        <ListRow
          icon="archive"
          title="Stopped"
          value={
            <View style={styles.value}>
              <Text style={styles.count}>{stopped.length}</Text>
              <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
            </View>
          }
          chevron={false}
          onPress={() => setOpen(o => !o)}
          accessibilityLabel={`${stopped.length} stopped. ${open ? 'Hide' : 'Show'}`}
        />
        {open && stopped.map(s => (
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
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.lg },
  value: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  count: { ...type.body, color: colors.textSecondary },
});
