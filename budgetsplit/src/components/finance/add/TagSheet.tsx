import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SheetModal } from '../../ui/SheetModal';
import { Chip } from '../../ui/Chip';
import { Input } from '../../ui/Input';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { SectionHeader } from '../../ui/SectionHeader';
import { colors, type, space } from '../../tokens';
import { cleanTag, tagKey, normalizeTags, TAG_MAX_COUNT, TAG_MAX_LENGTH } from '../../../lib/tags';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Currently applied tags. */
  value: string[];
  onChange: (tags: string[]) => void;
  /** Every tag already in use, most-used first (`getTagsByFrequency`). */
  suggestions: string[];
  /** Tint for selected chips — the screen's kind colour. */
  accent?: string;
};

/**
 * Pick or create tags for one transaction.
 *
 * Multi-select, unlike every other picker sheet in the app — which is exactly why it can't
 * reuse `ListRow`'s single-select idiom. Tapping toggles and the sheet stays open, because
 * the common case is applying two or three at once.
 *
 * The suggestion list is the vocabulary derived from existing transactions, so there's no
 * tag table to maintain and no orphans to clean up. On a fresh install it's empty and the
 * only path is the text field — which is why the field is always shown rather than hidden
 * behind an "add new" affordance.
 */
export function TagSheet({ visible, onClose, value, onChange, suggestions, accent = colors.accent }: Props) {
  const [draft, setDraft] = useState('');

  const applied = useMemo(() => new Set(value.map(tagKey)), [value]);
  const full = value.length >= TAG_MAX_COUNT;

  /** Suggestions minus what's already on the transaction — a chip that does nothing when
   *  tapped is worse than one that isn't there. */
  const available = useMemo(
    () => suggestions.filter(s => !applied.has(tagKey(s))),
    [suggestions, applied],
  );

  const draftClean = cleanTag(draft);
  const draftIsNew = draftClean.length > 0
    && !applied.has(tagKey(draftClean))
    && !suggestions.some(s => tagKey(s) === tagKey(draftClean));

  const toggle = (tag: string) => {
    const key = tagKey(tag);
    onChange(applied.has(key)
      ? value.filter(t => tagKey(t) !== key)
      : normalizeTags([...value, tag]));
  };

  const addDraft = () => {
    if (!draftClean || full) return;
    onChange(normalizeTags([...value, draftClean]));
    setDraft('');
  };

  return (
    <SheetModal visible={visible} onClose={onClose} title="Tags">
      {value.length > 0 && (
        <>
          <SectionHeader title="On this transaction" first />
          <View style={styles.row}>
            {value.map(t => (
              <Chip key={t} label={t} selected accent={accent} onRemove={() => toggle(t)} maxWidth={200} />
            ))}
          </View>
        </>
      )}

      <SectionHeader title={value.length > 0 ? 'Add another' : 'Add a tag'} first={value.length === 0} />
      <Input
        value={draft}
        onChangeText={setDraft}
        placeholder="needs, goa-trip, reimbursable…"
        icon="hash"
        maxLength={TAG_MAX_LENGTH}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={addDraft}
        editable={!full}
        accessibilityLabel="New tag"
      />
      {draftIsNew && !full && (
        <View style={styles.row}>
          <Chip label={`Add "${draftClean}"`} icon="plus" accent={accent} onPress={addDraft} maxWidth={240} />
        </View>
      )}

      {available.length > 0 && (
        <>
          <SectionHeader title="Used before" />
          <View style={styles.row}>
            {available.map(t => (
              <Chip
                key={t}
                label={t}
                icon="hash"
                accent={accent}
                onPress={full ? undefined : () => toggle(t)}
                maxWidth={200}
              />
            ))}
          </View>
        </>
      )}

      {full && (
        <Text style={styles.limit}>
          That's {TAG_MAX_COUNT} tags — remove one to add another. More than this and they
          stop being scannable.
        </Text>
      )}

      <PrimaryButton label="Done" onPress={onClose} style={styles.done} />
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  limit: { ...type.caption, color: colors.textMuted, marginTop: space.md, lineHeight: 16 },
  done: { marginTop: space.lg },
});
