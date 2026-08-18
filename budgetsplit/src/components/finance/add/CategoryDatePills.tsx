import React from 'react';
import { View, StyleSheet } from 'react-native';
import { format, isSameDay } from 'date-fns';
import { shortDate } from '../../../lib/dateFormat';
import { Chip } from '../../ui/Chip';
import { IconCircle } from '../../ui/IconCircle';
import { colors, space } from '../../tokens';
import { asFeather } from '../../../constants/palette';
import { categoryVisual } from '../../../constants/categories';
import type { Category } from '../../../db/queries/categories';
import type { AddKind } from '../../../constants/enums';

type Props = {
  kind: AddKind;
  selectedCategory: Category | null;
  onCategory: () => void;
  txnDate: number;
  onDate: () => void;
  /** The screen's kind colour, used when no category colour applies. */
  accent?: string;
};

/**
 * The Category (or "Reason" for transfers) + Date chip row shared across kinds.
 *
 * Both are `Chip`s with a trailing chevron, so they're the same component as the
 * "Other details" chips below them — differing only by the one prop that says
 * "this opens a picker". They used to be a private stylesheet of hand-rolled pills
 * (`borderRadius: 100`, `paddingHorizontal: 14`, raw `fontSize: 13`, a hand-drawn
 * 22px icon disc) sitting directly above chips built from the real primitive, which
 * is why one screen had two subtly different versions of the same shape.
 *
 * Each chip carries its own icon — a tag/message glyph for the category and a
 * calendar for the date — because a row of identically-shaped pills is only
 * scannable if the glyphs distinguish them.
 */
export function CategoryDatePills({ kind, selectedCategory, onCategory, txnDate, onDate, accent = colors.accent }: Props) {
  const catWord = kind === 'transfer' ? 'Reason' : 'Category';
  const catColor = selectedCategory?.color ?? accent;
  const isToday = isSameDay(new Date(txnDate), new Date());

  return (
    <View style={styles.row}>
      <Chip
        grow
        chevron
        label={selectedCategory?.name ?? catWord}
        // A chosen category shows its own colour+glyph in a disc; an empty one shows
        // the neutral glyph for what's being asked for.
        leading={selectedCategory
          ? <IconCircle icon={asFeather(categoryVisual(selectedCategory.name).icon, 'tag')} size={22} color={catColor} iconSize={13} />
          : undefined}
        icon={selectedCategory ? undefined : kind === 'transfer' ? 'message-circle' : 'tag'}
        onPress={onCategory}
        accessibilityLabel={selectedCategory ? `${catWord}: ${selectedCategory.name}` : `Choose ${catWord.toLowerCase()}`}
      />
      <Chip
        chevron
        icon="calendar"
        label={isToday ? 'Today' : shortDate(new Date(txnDate))}
        onPress={onDate}
        accessibilityLabel={`Date: ${isToday ? 'today' : format(new Date(txnDate), 'd MMMM yyyy')}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
});
