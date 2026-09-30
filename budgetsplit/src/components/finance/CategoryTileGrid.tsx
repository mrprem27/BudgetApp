import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../tokens';
import { IconCircle } from '../ui/IconCircle';
import { SHEET_PADDING_H } from '../ui/DraggableSheet';
import type { FeatherName } from '../../constants/palette';

export type CategoryTileItem = { key: string; label: string; icon: FeatherName; color: string };

type Props = {
  items: CategoryTileItem[];
  isSelected: (key: string) => boolean;
  onToggle: (key: string) => void;
  /**
   * A small check badge over the icon. Add's picker (one answer) leaves it off — the border and
   * fill already say which tile is chosen; Review's filter (any number) needs it, because more
   * than one tile can be active at once and the fill alone reads as "the last one tapped" (`U-42`).
   */
  showCheck?: boolean;
  listHeader?: React.ReactElement | null;
  emptyText?: string;
};

/**
 * The category tile grid — three columns, each tile its own colour and glyph. Built for Add's
 * picker; Review's category filter drew the same categories as a list of checkbox rows instead,
 * which read as a different control for the same choice (`U-42`). Both use this now.
 */
export function CategoryTileGrid({ items, isSelected, onToggle, showCheck, listHeader, emptyText = 'No matches' }: Props) {
  return (
    <FlatList
      data={items}
      keyExtractor={i => i.key}
      numColumns={3}
      columnWrapperStyle={styles.gridRow}
      style={styles.list}
      contentContainerStyle={styles.grid}
      keyboardShouldPersistTaps="handled"
      indicatorStyle="white"
      ListHeaderComponent={listHeader}
      ListEmptyComponent={!listHeader ? <Text style={styles.empty}>{emptyText}</Text> : null}
      renderItem={({ item }) => {
        const active = isSelected(item.key);
        return (
          <TouchableOpacity
            style={[styles.tile, active && styles.tileActive]}
            onPress={() => onToggle(item.key)}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active }}
          >
            <View>
              <IconCircle icon={item.icon} size={40} color={item.color} />
              {showCheck && active && (
                <View style={styles.check}>
                  <Feather name="check" size={11} color={colors.onAccent} />
                </View>
              )}
            </View>
            <Text style={[styles.tileLabel, active && styles.tileLabelActive]} numberOfLines={1}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  // Full-bleed to the sheet edge, with the inset moved onto the content. Inheriting the
  // sheet's padding put the scroll indicator 24pt in, hard against the tiles; now it rides
  // the edge and `paddingRight` keeps the tiles clear of it.
  list: { marginHorizontal: -SHEET_PADDING_H },
  grid: { paddingHorizontal: SHEET_PADDING_H, paddingBottom: space.md },
  gridRow: { gap: space.sm, marginBottom: space.sm },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.bgMuted,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tileActive: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  tileLabel: { ...type.caption, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 2 },
  tileLabelActive: { color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  check: {
    position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: 8,
    backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.bgMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  empty: { ...type.body, color: colors.textMuted, textAlign: 'center', paddingVertical: space.xl },
});
