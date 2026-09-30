import { View, Text, StyleSheet } from 'react-native';
import { colors, type, space } from '../../tokens';
import { Card } from '../../ui/Card';
import { Divider } from '../../ui/Divider';
import { ListRow } from '../../ui/ListRow';
import { AmountText } from '../../ui/AmountText';
import { freqLabel } from '../../../lib/recurrence';
import type { RecurringSub } from '../../../lib/recurringData';

/**
 * Stopped rules get their own view, like archived groups (`U-54`, 2026-09-30): one row at the end of
 * the list opens it, and a row at its top comes back. Out of the way of what is still charging,
 * one tap from being found, and never a list that grows under the live one.
 */
export function StoppedEntry({ count, onPress }: { count: number; onPress: () => void }) {
  if (count === 0) return null;
  return (
    <Card clip style={styles.entry}>
      <ListRow
        icon="archive"
        iconColor={colors.textSecondary}
        title="Stopped"
        value={<Text style={styles.count}>{count}</Text>}
        onPress={onPress}
        accessibilityLabel={`${count} stopped. Show`}
      />
    </Card>
  );
}

/** The stopped view's rows: each opens its rule, where it can be started again. */
export function StoppedList({ stopped, onOpen }: { stopped: RecurringSub[]; onOpen: (id: string) => void }) {
  return (
    <Card clip>
      {stopped.map((s, i) => (
        <View key={s.id}>
          {i > 0 && <Divider indent="text" />}
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
  );
}

const styles = StyleSheet.create({
  entry: { marginTop: space.sm },
  count: { ...type.body, color: colors.textSecondary },
});
