import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SheetModal } from '../ui/SheetModal';
import { colors, type, space, radius } from '../tokens';
import { asFeather } from '../../constants/palette';
import type { BudgetGroup } from '../../db/queries/groups';

type Props = {
  groups: BudgetGroup[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** How many quick-access pills to show before the "More" button. Default 3. */
  maxQuick?: number;
  /** Optional label above the pills (e.g. "In"). */
  label?: string;
};

/**
 * Group selector: a few quick-access pills for the most-used groups (one tap),
 * plus a "More" pill that opens a bottom-sheet picker for the rest. Fast for the
 * common case, complete for the long tail, and it never grows the form much.
 *
 * The currently-selected group is always shown as a pill — if it isn't in the
 * first `maxQuick`, it takes the last quick slot so you can always see/▸change it.
 */
export function GroupSelector({ groups, selectedId, onSelect, maxQuick = 3, label }: Props) {
  const [open, setOpen] = useState(false);
  if (groups.length === 0) return null;

  const base = groups.slice(0, maxQuick);
  const selectedInBase = base.some(g => g.id === selectedId);
  const selectedGroup = groups.find(g => g.id === selectedId);
  // Guarantee the selected group is visible without reordering the others.
  const visible = selectedInBase || !selectedGroup
    ? base
    : [...base.slice(0, maxQuick - 1), selectedGroup];
  const showMore = groups.length > maxQuick;

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View style={styles.row}>
        {visible.map(g => {
          const active = g.id === selectedId;
          return (
            <TouchableOpacity
              key={g.id}
              style={[styles.pill, active && { backgroundColor: g.color + '22', borderColor: g.color }]}
              onPress={() => onSelect(g.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={g.name}
            >
              <View style={[styles.pillIcon, { backgroundColor: g.color + '22' }]}>
                <Feather name={asFeather(g.icon, 'layers')} size={13} color={g.color} />
              </View>
              <Text
                style={[styles.pillName, active && { color: g.color, fontFamily: 'Inter_600SemiBold' }]}
                numberOfLines={1}
              >
                {g.name}
              </Text>
              {active && <Feather name="check" size={12} color={g.color} />}
            </TouchableOpacity>
          );
        })}

        {showMore && (
          <TouchableOpacity
            style={styles.moreBtn}
            onPress={() => setOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="More groups"
          >
            <Feather name="more-horizontal" size={16} color={colors.textSecondary} />
            <Text style={styles.moreText}>More</Text>
          </TouchableOpacity>
        )}
      </View>

      <SheetModal visible={open} onClose={() => setOpen(false)} title="Choose group">
        <View style={styles.list}>
          {groups.map((g, i) => {
            const active = g.id === selectedId;
            return (
              <TouchableOpacity
                key={g.id}
                style={[styles.listRow, i < groups.length - 1 && styles.listRowBorder]}
                onPress={() => { setOpen(false); if (g.id !== selectedId) onSelect(g.id); }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={g.name}
              >
                <View style={[styles.listIcon, { backgroundColor: g.color + '22' }]}>
                  <Feather name={asFeather(g.icon, 'layers')} size={16} color={g.color} />
                </View>
                <Text style={[styles.listName, active && styles.listNameActive]} numberOfLines={1}>{g.name}</Text>
                {active && <Feather name="check" size={18} color={colors.accent} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </SheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  label: {
    ...type.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: 'Inter_600SemiBold',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.xs,
  },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 5,
    paddingRight: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 150,
  },
  pillIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pillName: {
    ...type.label,
    color: colors.textSecondary,
    flexShrink: 1,
  },

  moreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.bgMuted,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  moreText: {
    ...type.label,
    color: colors.textSecondary,
    fontFamily: 'Inter_600SemiBold',
  },

  list: {
    backgroundColor: colors.bgInput,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    minHeight: 52,
  },
  listRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  listIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  listName: { ...type.body, color: colors.textPrimary, flex: 1 },
  listNameActive: { fontFamily: 'Inter_600SemiBold', color: colors.accent },
});
