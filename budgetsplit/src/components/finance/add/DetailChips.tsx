import React from 'react';
import { View, StyleSheet } from 'react-native';
import { timeOfDay } from '../../../lib/dateFormat';
import { Chip } from '../../ui/Chip';
import { Card } from '../../ui/Card';
import { Divider } from '../../ui/Divider';
import { ListRow } from '../../ui/ListRow';
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

  /** Omitted where the save path can't persist an attachment. */
  attachmentUri?: string | null;
  onOpenAttachment?: () => void;
  onClearAttachment?: () => void;

  /** Tags on this transaction. Orthogonal to category — one category, many tags. */
  tags?: string[];
  onOpenTags?: () => void;

  /** The transaction's time-of-day. Always set (it defaults to now), like pay method. */
  txnDate: number;
  onOpenTime: () => void;

  /** Omitted entirely when location is off in settings, or while editing. */
  place?: CapturedPlace | null;
  capturingLoc?: boolean;
  onCaptureLocation?: () => void;
  onClearLocation?: () => void;

  payMethod: PayMethod;
  onOpenPayMethod: () => void;
  /** Income reads the same field as "landed in" rather than "paid by". */
  isIncome?: boolean;

  /** Opens the itemized-split wizard. */
  onSplitByItems?: () => void;

  /** Omitted while editing, or when the `recurring` flag is off. */
  recurEnabled?: boolean;
  recurFreq?: RecurFreq;
  recurInterval?: string;
  onOpenRecurring?: () => void;
};

/**
 * The optional details on the Add screen, in three groups: what you attach, how
 * and when it was paid, and the two actions that change the transaction's shape.
 *
 * It was one flat wrap of eight chips holding three different kinds of thing —
 * values you attach, settings that are always set, and actions. The last pair read
 * worst as chips: `Split by items` and `Repeat` carried no tint, no value and no ✕,
 * so they looked permanently "unset" while actually being doors to another screen.
 * They are rows now, which is what AGENTS §4 wants for a full-width navigation.
 *
 * **Every chip carries its own glyph in both states.** The first version used
 * `icon="plus"` while unset, so four chips rendered an identical `+` and the
 * meaningful icon only appeared once set — backwards, since unset is exactly when
 * you need to know what a control is. State is carried by the tint, the value
 * replacing the name, and the ✕; identity is carried by the glyph, always.
 *
 * A chip has exactly one trailing affordance (AGENTS §9): `⌄` while it is unset and
 * opening a picker, `✕` once it holds a value you can clear. Never both — `Chip`
 * silently drops the chevron if given both.
 */
export function DetailChips({
  accent,
  note, onOpenNote, onClearNote,
  attachmentUri, onOpenAttachment, onClearAttachment,
  tags = [], onOpenTags,
  txnDate, onOpenTime,
  place, capturingLoc, onCaptureLocation, onClearLocation,
  payMethod, onOpenPayMethod, isIncome,
  onSplitByItems,
  recurEnabled, recurFreq, recurInterval, onOpenRecurring,
}: Props) {
  const noteSet = !!note && note.trim().length > 0;
  const hasActions = !!onSplitByItems || !!onOpenRecurring;

  return (
    // No `gap` on this container: `SectionHeader` owns its own vertical margins and
    // the two would silently add up (AGENTS §3/§12).
    <View>
      <SectionHeader title="Details" first />
      <View style={styles.row}>
        {onOpenNote && (
          <Chip
            label={noteSet ? note!.trim() : 'Note'}
            icon="align-left"
            selected={noteSet}
            accent={accent}
            maxWidth={200}
            chevron={!noteSet}
            onPress={onOpenNote}
            onRemove={noteSet ? onClearNote : undefined}
            accessibilityLabel={noteSet ? `Note: ${note!.trim()}` : 'Add a note'}
          />
        )}

        {/* One chip whatever the count: listing each tag would let a well-tagged
            transaction push every other detail off the row. The count is the state. */}
        {onOpenTags && (
          <Chip
            label={tags.length === 0 ? 'Tags' : tags.length === 1 ? tags[0] : `${tags.length} tags`}
            icon="hash"
            selected={tags.length > 0}
            accent={accent}
            maxWidth={180}
            chevron
            onPress={onOpenTags}
            accessibilityLabel={tags.length === 0 ? 'Add tags' : `Tags: ${tags.join(', ')}`}
          />
        )}

        {/* Always "Receipt" — a camera capture's filename is a UUID, so showing it
            would be noise. The tint and the ✕ carry the attached state. */}
        {onOpenAttachment && (
          <Chip
            label="Receipt"
            icon="paperclip"
            selected={!!attachmentUri}
            accent={accent}
            chevron={!attachmentUri}
            onPress={onOpenAttachment}
            onRemove={attachmentUri ? onClearAttachment : undefined}
            accessibilityLabel={attachmentUri ? 'Receipt attached' : 'Attach a receipt'}
          />
        )}

        {onCaptureLocation && (
          <Chip
            label={capturingLoc ? 'Locating…' : place?.label ?? 'Location'}
            icon="map-pin"
            selected={!!place}
            accent={accent}
            maxWidth={180}
            chevron={!place}
            // Pressable in both states. It used to go inert once a place was
            // captured, leaving the ✕ as the only way out — so a wrong reading
            // had to be cleared and re-taken rather than just re-tapped.
            onPress={onCaptureLocation}
            onRemove={place ? onClearLocation : undefined}
            accessibilityLabel={place ? `Location: ${place.label}. Re-capture` : 'Capture location'}
          />
        )}
      </View>

      {/* No `first`: this header's own 24pt top margin IS the break between groups. */}
      <SectionHeader title="How & when" />
      <View style={styles.row}>
        {/* Always a set chip — there is no "no pay method" state to offer. For
            income the same field means the opposite direction: where it landed. */}
        <Chip
          label={PAY_METHOD_LABEL[payMethod]}
          icon={isIncome ? 'download' : 'credit-card'}
          selected
          accent={accent}
          chevron
          onPress={onOpenPayMethod}
          accessibilityLabel={isIncome ? `Landed in ${PAY_METHOD_LABEL[payMethod]}` : `Paid by ${PAY_METHOD_LABEL[payMethod]}`}
        />

        {/* Always filled — the time is real whether or not it was chosen. */}
        <Chip
          label={timeOfDay(txnDate)}
          icon="clock"
          selected
          accent={accent}
          chevron
          onPress={onOpenTime}
          accessibilityLabel={`Time: ${timeOfDay(txnDate)}. Change`}
        />
      </View>

      {/* Rows, not chips: both open another surface rather than holding a value.
          Carded because `ListRow` self-pads 16pt horizontally, which would read as
          an accidental indent against the flush chip rows above (AGENTS §3). */}
      {hasActions && (
        <View style={styles.actions}>
          <Card clip>
            {onSplitByItems && (
              <ListRow
                icon="list"
                title="Split by items"
                onPress={onSplitByItems}
                accessibilityLabel="Split this bill by items"
              />
            )}
            {onSplitByItems && onOpenRecurring && <Divider indent="text" />}
            {onOpenRecurring && (
              <ListRow
                icon="repeat"
                title="Repeat this"
                // No ✕ here, and that is the trade: `ListRow` has no remove
                // affordance, so the sheet's own "Repeat this" switch is the off
                // switch. One place to turn it on, the same place to turn it off.
                value={recurEnabled ? freqLabel(recurFreq, Number(recurInterval ?? '1')) : undefined}
                onPress={onOpenRecurring}
                accessibilityLabel={recurEnabled ? 'Repeats. Change or turn off' : 'Make this repeat'}
              />
            )}
          </Card>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  // Matches SectionHeader's own group break, since there is no header above this.
  actions: { marginTop: space.lg },
});
