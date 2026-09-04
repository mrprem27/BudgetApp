import React from 'react';
import { View, StyleSheet } from 'react-native';
import { format, isSameDay } from 'date-fns';
import { shortDate, timeOfDay } from '../../../lib/dateFormat';
import { Chip } from '../../ui/Chip';
import { IconCircle } from '../../ui/IconCircle';
import { colors, space } from '../../tokens';
import { asFeather } from '../../../constants/palette';
import { categoryVisual } from '../../../constants/categories';
import type { Category } from '../../../db/queries/categories';
import type { AddKind } from '../../../constants/enums';
import type { FeatherName } from '../../../constants/palette';

type Props = {
  kind: AddKind;
  selectedCategory: Category | null;
  onCategory: () => void;
  txnDate: number;
  onDate: () => void;
  /** The screen's kind colour, used when no category colour applies. */
  accent?: string;
  /**
   * Replaces the left chip entirely.
   *
   * The left chip answers *"where does this belong?"*, and the answer is not always
   * a category: an expense picks one, a transfer gives a Reason, and **Invest names
   * an asset** — its category is fixed to `INVESTMENT_CATEGORY`, so offering a
   * picker would ask a question with one legal answer. Same row, same shape, same
   * chevron; only the noun changes.
   */
  destination?: { label: string; icon: FeatherName; onPress: () => void; a11y: string };
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
export function CategoryDatePills({
  kind, selectedCategory, onCategory, txnDate, onDate, accent = colors.accent, destination,
}: Props) {
  const catWord = kind === 'transfer' ? 'Reason' : 'Category';
  const catColor = selectedCategory?.color ?? accent;
  const isToday = isSameDay(new Date(txnDate), new Date());

  return (
    <View style={styles.row}>
      {destination ? (
        <Chip
          grow
          chevron
          label={destination.label}
          icon={destination.icon}
          onPress={destination.onPress}
          accessibilityLabel={destination.a11y}
        />
      ) : (
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
      )}
      {/*
        One chip for WHEN, not two.
        
        Date and time were separate chips answering halves of one question, which
        cost a slot on the busiest screen in the app and made the row longer than
        it needed to be. The time still shows — it is in the label — so nothing is
        hidden; only editing it is one tap deeper, inside the date sheet, which is
        where somebody adjusting when it happened already is.
      */}
      <Chip
        chevron
        icon="calendar"
        label={`${isToday ? 'Today' : shortDate(new Date(txnDate))} · ${timeOfDay(txnDate)}`}
        maxWidth={200}
        onPress={onDate}
        accessibilityLabel={`When: ${isToday ? 'today' : format(new Date(txnDate), 'd MMMM yyyy')} at ${timeOfDay(txnDate)}. Change`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
});
