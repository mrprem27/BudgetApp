import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ModalHeader } from '../../ui/ModalHeader';
import { colors, type } from '../../tokens';
import { formatCompact } from '../../../lib/money';
import { PAY_METHOD_LABEL, SPLIT_MODE_LABEL, TRANSFER_SCOPE_ALL, AddKind, ADD_KIND_LABEL } from '../../../constants/enums';
import type { useAddTxnForm } from '../../../hooks/useAddTxnForm';
import type { QuickAddSheet } from './QuickAddSheets';

type Form = ReturnType<typeof useAddTxnForm>;

/**
 * The destination line under the title, for all three kinds — an expense's group,
 * an income's landing account and a settlement's scope all answer the same
 * question ("what is this about?").
 *
 * It replaced a `ContextPill` block above the amount, which cost a whole row and
 * only ever rendered for two of the three kinds: income had no destination
 * indicator at all while being silently forced into the Personal group.
 */
function destinationOf(f: Form): { label: string; sheet: QuickAddSheet; a11y: string } {
  if (f.kind === AddKind.Income) {
    const where = f.paidFromLabel;
    return { label: `Lands in ${where}`, sheet: 'payMethod', a11y: `Income lands in ${where}. Change` };
  }

  if (f.kind === AddKind.Transfer) {
    const name = f.transferScope === TRANSFER_SCOPE_ALL
      ? 'All groups'
      : f.transferScopes?.groups.find(g => g.groupId === f.transferScope)?.name ?? 'Group';
    // Blank until the scopes load rather than "₹0" — this renders before
    // `computeTransferScopes` has run, and a hard zero reads as "nothing is owed"
    // when the truth is "not worked out yet".
    const entry = f.transferScope === TRANSFER_SCOPE_ALL
      ? f.transferScopes?.all
      : f.transferScopes?.groups.find(g => g.groupId === f.transferScope);
    const open = f.transferScopes == null ? undefined : `${formatCompact(entry?.amount ?? 0)} open`;
    return {
      label: [name, open].filter(Boolean).join(' · '),
      sheet: 'scope',
      a11y: "Choose what you're settling",
    };
  }

  // Spent with people, not in a group: name the people, never the hidden group behind it.
  if (f.selectedPersonIds.length > 0) {
    const names = f.members.filter(m => f.selectedPersonIds.includes(m.id)).map(m => m.name.split(' ')[0]).join(', ');
    const split = SPLIT_MODE_LABEL[f.selectedGroup?.default_split ?? 'equal'].toLowerCase();
    return { label: `With ${names} · ${split}`, sheet: 'destination', a11y: `Spent with ${names}. Change` };
  }

  const group = f.selectedGroup?.name ?? 'Personal';
  const who = f.members.length > 1
    ? `${f.members.length} people · ${SPLIT_MODE_LABEL[f.selectedGroup?.default_split ?? 'equal'].toLowerCase()}`
    : 'just you';
  return { label: `${group} · ${who}`, sheet: 'destination', a11y: `Goes to ${group}. Change` };
}

function titleOf(f: Form): string {
  if (f.isRecurEdit) return 'Edit recurring';
  // The kind's own name, the one on its pill: "settlement" appeared nowhere else in the app, a new
  // transfer was titled "Settle up" under a pill reading Transfer, and Invest was titled an expense.
  const noun = ADD_KIND_LABEL[f.kind].toLowerCase();
  if (f.isEditing) return f.kind === AddKind.Invest ? 'Edit investment' : `Edit ${noun}`;
  return f.kind === AddKind.Transfer || f.kind === AddKind.Invest ? ADD_KIND_LABEL[f.kind] : `Add ${noun}`;
}

/** ✕ · title + destination · Save. */
export function AddHeader({ form: f, accent, onClose, onOpenSheet }: {
  form: Form;
  /** Kind colour, so Save matches the form behind it. */
  accent: string;
  onClose: () => void;
  onOpenSheet: (s: QuickAddSheet) => void;
}) {
  const destination = destinationOf(f);
  const disabled = !f.canSave || f.saving;

  return (
    <ModalHeader
      title={titleOf(f)}
      onClose={onClose}
      subtitle={destination.label}
      onPressSubtitle={() => onOpenSheet(destination.sheet)}
      subtitleAccessibilityLabel={destination.a11y}
      right={
        /* Save lives top-right, next to ✕ — the two ends of the same bar mean
           "leave without saving" and "save". A footer button reads as a page CTA
           and pushes the form up; this is a modal, not a page. A deliberate
           exception to AGENTS §5's PrimaryButton rule, which §5 records. */
        <TouchableOpacity
          onPress={() => f.handleSave()}
          disabled={disabled}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Save"
          accessibilityState={{ disabled }}
        >
          <Text style={[styles.save, { color: disabled ? colors.textMuted : accent }]}>Save</Text>
        </TouchableOpacity>
      }
    />
  );
}

const styles = StyleSheet.create({
  save: { ...type.button },
});
