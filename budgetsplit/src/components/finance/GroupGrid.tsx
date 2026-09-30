import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../tokens';
import { IconCircle } from '../ui/IconCircle';

export type GroupTile = {
  id: string;
  name: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  color: string;
  /** "Only you", "With 3". */
  sub?: string;
};

/**
 * Choosing a group, as tiles (`U-23`): two across, the group's icon in its colour, its name and
 * who it is with; the chosen one has an accent border and a ✓. Plain items in, so Add (Personal
 * is a group) and Review (Personal is a sentinel) use the same control.
 */
export function GroupGrid({ items, selectedId, onSelect, accent = colors.accent }: {
  items: GroupTile[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** The ✓ and border tint, so the sheet agrees with the form behind it. */
  accent?: string;
}) {
  return (
    <View style={styles.grid}>
      {items.map(g => {
        const on = g.id === selectedId;
        return (
          <View key={g.id} style={styles.cell}>
            <TouchableOpacity
              style={[styles.tile, on && { borderColor: accent }]}
              onPress={() => onSelect(g.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={g.sub ? `${g.name}, ${g.sub}` : g.name}
            >
              <View style={styles.top}>
                <IconCircle icon={g.icon} size={32} color={g.color} />
                {on && <Feather name="check" size={16} color={accent} />}
              </View>
              <Text style={styles.name} numberOfLines={1}>{g.name}</Text>
              <Text style={styles.sub} numberOfLines={1}>{g.sub ?? ' '}</Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -space.xs },
  cell: { width: '50%', padding: space.xs },
  tile: {
    backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: space.smd, gap: space.xs, minHeight: 96,
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs },
  name: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  sub: { ...type.caption, color: colors.textMuted },
});
