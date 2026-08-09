import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { SheetModal } from '../../ui/SheetModal';
import { Card } from '../../ui/Card';
import { Chip } from '../../ui/Chip';
import { IconCircle } from '../../ui/IconCircle';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { SectionHeader } from '../../ui/SectionHeader';
import { colors, type, space, radius, layout } from '../../tokens';
import { formatRupees } from '../../../lib/money';
import { parseVoice, type VoiceDraft } from '../../../lib/voiceParse';
import type { LearnedMap } from '../../../lib/smartCategoryLearn';
import { AddKind } from '../../../constants/enums';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** The caller's real category catalog, so a suggestion always exists. */
  categories: { name: string }[];
  /** Merchant→category memory, so voice inherits the user's own corrections. */
  learned?: LearnedMap;
  /** Applies the draft to the Add form. Never saves — the user still taps Save. */
  onApply: (draft: VoiceDraft) => void;
  accent?: string;
  /** Which kind the form is on, so the copy and the understood-card match it. */
  kind: AddKind;
  /** The caller's real people. A transfer can name one; the other kinds ignore this. */
  people?: { id: string; name: string }[];
};

/**
 * Examples per kind. A transfer's shape is genuinely different — a person and a direction, not
 * a merchant — so showing expense examples there taught the wrong phrasing.
 */
const EXAMPLES: Record<AddKind, string[]> = {
  [AddKind.Expense]: ['four fifty groceries', 'twelve hundred rent yesterday', 'chai dus rupaye'],
  [AddKind.Income]: ['fifty thousand salary', 'two thousand refund yesterday', 'paanch sau cashback'],
  [AddKind.Transfer]: ['paid Riya five hundred', 'two thousand to Sam yesterday', 'settled dus hazaar'],
};

const PROMPT: Record<AddKind, string> = {
  [AddKind.Expense]: 'say the amount and what it was for',
  [AddKind.Income]: 'say the amount and where it came from',
  [AddKind.Transfer]: 'say the amount and who you paid',
};

/**
 * Say a whole expense in one phrase and have it filled in for you.
 *
 * **The recognition is the keyboard's own dictation, not a bundled recognizer.** That is a
 * deliberate trade, not a shortcut: iOS and Android already put an on-device speech engine
 * behind the keyboard mic — the same `SFSpeechRecognizer` a native module would wrap — so
 * adding one would duplicate a capability the OS provides, drop Expo Go support, and pin a
 * third-party native dependency into the critical path of a privacy-marketed feature. What
 * the app actually contributes is the part the OS *doesn't* do: turning "four fifty groceries
 * yesterday" into an amount, a category and a date (`lib/voiceParse`).
 *
 * The transcript is parsed **live** as it arrives, so what the app understood is visible
 * while you're still talking, and nothing is committed — `onApply` fills the Add form and
 * the user still taps Save. Misheard money is the worst silent failure there is, so being
 * wrong here is always one visible correction away.
 *
 * A future no-open capture path (Siri App Intents) reuses `parseVoice` unchanged; only the
 * trigger differs.
 */
export function VoiceEntrySheet({
  visible, onClose, categories, learned, onApply, accent = colors.accent, kind, people,
}: Props) {
  const [text, setText] = useState('');
  const isTransfer = kind === AddKind.Transfer;

  // `nowMs` is captured per keystroke on purpose: a relative date ("yesterday") should
  // resolve against when you *said* it, and the sheet is open for seconds.
  const draft = useMemo(
    () => parseVoice(text, { categories, learned, nowMs: Date.now(), people }),
    [text, categories, learned, people],
  );
  const person = draft.personId ? people?.find(p => p.id === draft.personId) ?? null : null;

  const heardSomething = text.trim().length > 0;
  const usable = draft.amountPaise > 0;

  const close = () => { setText(''); onClose(); };
  const apply = () => { if (!usable) return; onApply(draft); setText(''); onClose(); };

  return (
    <SheetModal visible={visible} onClose={close} title="Say it instead">
      <View style={styles.promptRow}>
        <IconCircle icon="mic" size={layout.avatarSize} color={accent} />
        <Text style={styles.prompt}>
          Tap the field, then the <Text style={styles.bold}>microphone on your keyboard</Text> —
          {PROMPT[kind]}.
        </Text>
      </View>

      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder={EXAMPLES[kind][0]}
        placeholderTextColor={colors.textMuted}
        autoFocus
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="What did you spend?"
      />

      {!heardSomething && (
        <>
          <SectionHeader title="Try saying" />
          <View style={styles.examples}>
            {EXAMPLES[kind].map(e => (
              <Chip key={e} label={e} icon="message-circle" maxWidth={260} onPress={() => setText(e)} />
            ))}
          </View>
        </>
      )}

      {heardSomething && (
        <>
          <SectionHeader title="What we understood" />
          <Card clip>
            <Row
              icon="hash"
              label="Amount"
              value={usable ? formatRupees(draft.amountPaise) : 'not heard'}
              tint={usable ? accent : colors.expense}
              strong
            />
            {isTransfer && (
              <Row
                icon="user"
                label="Paid to"
                value={person?.name ?? 'you pick'}
                tint={person ? accent : colors.textMuted}
              />
            )}
            <Row
              icon="tag"
              label={isTransfer ? 'Reason' : 'Category'}
              value={draft.category ?? 'you pick'}
              tint={draft.category ? accent : colors.textMuted}
            />
            <Row
              icon="calendar"
              label="Date"
              value={draft.dateMs ? format(draft.dateMs, 'd MMM') : 'today'}
              tint={colors.textMuted}
            />
            {!!draft.note && <Row icon="align-left" label="Note" value={draft.note} tint={colors.textMuted} />}
          </Card>

          {!usable && (
            <Text style={styles.warn}>
              No amount in there yet — say a number, like "four fifty groceries". Everything
              else is optional.
            </Text>
          )}
        </>
      )}

      {/* Fills the form; it does NOT save. */}
      <PrimaryButton label="Fill it in" onPress={apply} disabled={!usable} style={styles.cta} />
      <Text style={styles.footNote}>You'll see the full form before anything is saved.</Text>
    </SheetModal>
  );
}

function Row({ icon, label, value, tint, strong }: {
  icon: keyof typeof Feather.glyphMap; label: string; value: string; tint: string; strong?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Feather name={icon} size={14} color={tint} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[strong ? styles.rowValueStrong : styles.rowValue, { color: tint }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  promptRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  prompt: { ...type.label, color: colors.textSecondary, flex: 1, lineHeight: 18 },
  bold: { ...type.labelSemi, color: colors.textPrimary },
  input: {
    ...type.body,
    color: colors.textPrimary,
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    paddingVertical: space.smd,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  examples: { gap: space.sm, alignItems: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.smd, paddingHorizontal: space.md, minHeight: layout.rowMinHeight },
  rowLabel: { ...type.label, color: colors.textMuted, width: 72 },
  rowValue: { ...type.body, flex: 1 },
  rowValueStrong: { ...type.amountMD, flex: 1 },
  warn: { ...type.caption, color: colors.healthAmber, marginTop: space.sm, lineHeight: 16 },
  cta: { marginTop: space.lg },
  footNote: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.sm },
});
