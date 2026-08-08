import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SheetModal } from '../../ui/SheetModal';
import { Card } from '../../ui/Card';
import { ListRow } from '../../ui/ListRow';
import { Divider } from '../../ui/Divider';
import { EmptyState } from '../../ui/EmptyState';
import { colors, layout } from '../../tokens';
import type { SavedView } from '../../../lib/reviewViews';
import type { Person } from '../../../db/queries/persons';

type Props = {
  visible: boolean;
  onClose: () => void;
  views: SavedView[];
  groups: { id: string; name: string }[];
  membersByGroup: Record<string, Person[]>;
  onApply: (view: SavedView) => void;
  onDelete: (id: string) => void;
};

/**
 * The saved-view list: a persisted filter + group + payer you can re-apply to the
 * inbox in one tap.
 *
 * The subtitle is the whole point of the row — a view named "Rent" means nothing
 * without "Flat 4B · paid by Anya" under it, because applying one silently bulk-assigns
 * rows to that group and commits them as that payer.
 */
export function SavedViewsSheet({
  visible, onClose, views, groups, membersByGroup, onApply, onDelete,
}: Props) {
  return (
    <SheetModal visible={visible} onClose={onClose} title="Saved views" scroll={false}>
      {views.length === 0 ? (
        <EmptyState
          icon="bookmark"
          title="No saved views"
          body="Set a filter, a group and a payer, then “Save current view” — it comes back in one tap next time you import."
        />
      ) : (
        <Card clip>
          {views.map((v, i) => {
            const groupName = v.groupId ? (groups.find(g => g.id === v.groupId)?.name ?? 'group') : null;
            const payerName = v.paidBy
              ? (membersByGroup[v.groupId ?? '']?.find(m => m.id === v.paidBy)?.name ?? null)
              : null;
            const sub = [groupName, payerName ? `paid by ${payerName}` : null].filter(Boolean).join(' · ');

            return (
              <View key={v.id}>
                {i > 0 && <Divider indent="text" />}
                <ListRow
                  icon="bookmark"
                  title={v.name}
                  subtitle={sub || undefined}
                  chevron={false}
                  onPress={() => onApply(v)}
                  value={
                    <TouchableOpacity
                      onPress={() => onDelete(v.id)}
                      hitSlop={layout.touchMin / 4}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${v.name}`}
                    >
                      <Feather name="trash-2" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  }
                />
              </View>
            );
          })}
        </Card>
      )}
    </SheetModal>
  );
}
