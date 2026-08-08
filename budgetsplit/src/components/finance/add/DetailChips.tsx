import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Chip } from '../../ui/Chip';
import { SectionHeader } from '../../ui/SectionHeader';
import { space } from '../../tokens';
import { freqLabel } from '../../../lib/recurrence';
import { PAY_METHOD_LABEL, type PayMethod, type RecurFreq } from '../../../constants/enums';
import type { CapturedPlace } from '../../../lib/location';

type Props = {
  /** Tint for chips that are set — the screen's kind colour. */
  accent: string;

  /**
   * The *secondary* note. Omitted when smart-category is off, because then the
   * form's top field already is the note — offering a chip for it too would be two
   * controls editing one value.
   */
  note?: string;
  onOpenNote?: () => void;
  onClearNote?: () => void;

  attachmentUri: string | null;
  onOpenAttachment: () => void;
  onClearAttachment: () => void;

  /** Tags on this transaction. Orthogonal to category — one category, many tags. */
  tags: string[];
  onOpenTags: () => void;

  /** Omitted entirely when location is off in settings, or while editing. */
  place?: CapturedPlace | null;
  capturingLoc?: boolean;
  onCaptureLocation?: () => void;
  onClearLocation?: () => void;

  payMethod: PayMethod;
  onOpenPayMethod: () => void;
  /** Income reads the same field as "landed in" rather than "paid by". */
  isIncome?: boolean;

  /**
   * Opens the itemized-split wizard. Sits with the other details rather than in a
   * full-width card row of its own — it's the app's most differentiated feature so
   * it must stay visible, but it isn't more important than the amount.
   */
  onSplitByItems?: () => void;

  /** Omitted while editing, or when the `recurring` flag is off. */
  recurEnabled?: boolean;
  recurFreq?: RecurFreq;
  recurInterval?: string;
  onOpenRecurring?: () => void;
  onClearRecurring?: () => void;
};

/**
 * The optional details on the Add screen: one chip each, named, showing its value
 * once set.
 *
 * Replaces the "More options" accordion, which was wrong in three ways at once.
 * Its label had no information scent — NN/g's explicit progressive-disclosure
 * anti-pattern is a control that doesn't say what's behind it — and its hint read
 * "Split · Attach" when the split sheet was never inside it. Expanding it inserted
 * five or six blocks with no animation and no auto-scroll, shoving the split
 * summary off-screen. And in edit mode it rendered no header at all, so the
 * section couldn't be collapsed again.
 *
 * A chip states what it is when unset and what you chose when set, so nothing is
 * hidden behind a door you have to open to find out. Nothing moves when you use
 * it: chips change label in place.
 *
 * **Every chip carries its own glyph in both states.** The first version used
 * `icon="plus"` while unset, so Note / Receipt / Location / Repeat rendered four
 * chips with an identical `+` and the meaningful icon only appeared once the value
 * was set — backwards, since unset is exactly when you need to know what a control
 * is. State is carried by the tint, the value replacing the name, and the ✕; identity
 * is carried by the glyph, always.
 */
export function DetailChips({
  accent,
  note, onOpenNote, onClearNote,
  attachmentUri, onOpenAttachment, onClearAttachment,
  tags, onOpenTags,
  place, capturingLoc, onCaptureLocation, onClearLocation,
  payMethod, onOpenPayMethod, isIncome,
  onSplitByItems,
  recurEnabled, recurFreq, recurInterval, onOpenRecurring, onClearRecurring,
}: Props) {
  const noteSet = !!note && note.trim().length > 0;

  return (
    <View>
      <SectionHeader title="Other details" />
      <View style={styles.row}>
        {onOpenNote && (
          <Chip
            label={noteSet ? note!.trim() : 'Note'}
            icon="align-left"
            selected={noteSet}
            accent={accent}
            maxWidth={200}
            onPress={onOpenNote}
            onRemove={noteSet ? onClearNote : undefined}
            accessibilityLabel={noteSet ? `Note: ${note!.trim()}` : 'Add a note'}
          />
        )}

        {/* Always "Receipt" — a camera capture's filename is a UUID, so showing it
            would be noise. The tint and the ✕ carry the attached state. */}
        <Chip
          label="Receipt"
          icon="paperclip"
          selected={!!attachmentUri}
          accent={accent}
          onPress={onOpenAttachment}
          onRemove={attachmentUri ? onClearAttachment : undefined}
          accessibilityLabel={attachmentUri ? 'Receipt attached' : 'Attach a receipt'}
        />

        {/* One chip whatever the count: listing each tag here would let a well-tagged
            transaction push every other detail off the row. The count is the state. */}
        <Chip
          label={tags.length === 0 ? 'Tags' : tags.length === 1 ? tags[0] : `${tags.length} tags`}
          icon="hash"
          selected={tags.length > 0}
          accent={accent}
          maxWidth={180}
          onPress={onOpenTags}
          accessibilityLabel={tags.length === 0 ? 'Add tags' : `Tags: ${tags.join(', ')}`}
        />

        {onCaptureLocation && (
          <Chip
            label={capturingLoc ? 'Locating…' : place?.label ?? 'Location'}
            icon="map-pin"
            selected={!!place}
            accent={accent}
            maxWidth={180}
            onPress={place ? undefined : onCaptureLocation}
            onRemove={place ? onClearLocation : undefined}
            accessibilityLabel={place ? `Location: ${place.label}` : 'Capture location'}
          />
        )}

        {/* Always a set chip — there is no "no pay method" state to offer. For
            income the same field means the opposite direction: where it landed. */}
        <Chip
          label={PAY_METHOD_LABEL[payMethod]}
          icon={isIncome ? 'download' : 'credit-card'}
          selected
          accent={accent}
          onPress={onOpenPayMethod}
          accessibilityLabel={isIncome ? `Landed in ${PAY_METHOD_LABEL[payMethod]}` : `Paid by ${PAY_METHOD_LABEL[payMethod]}`}
        />

        {onSplitByItems && (
          <Chip
            label="Split by items"
            icon="list"
            accent={accent}
            onPress={onSplitByItems}
            accessibilityLabel="Split this bill by items"
          />
        )}

        {onOpenRecurring && (
          <Chip
            label={recurEnabled ? freqLabel(recurFreq, Number(recurInterval ?? '1')) : 'Repeat'}
            icon="repeat"
            selected={!!recurEnabled}
            accent={accent}
            onPress={onOpenRecurring}
            onRemove={recurEnabled ? onClearRecurring : undefined}
            accessibilityLabel={recurEnabled ? 'Repeats' : 'Make this repeat'}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
