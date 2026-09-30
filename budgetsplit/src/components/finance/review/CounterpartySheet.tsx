import React from 'react';
import { SheetModal } from '../../ui/SheetModal';
import { EmptyState } from '../../ui/EmptyState';
import { PersonPicker } from '../PersonPicker';
import type { Person } from '../../../db/queries/persons';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** The chosen group's members, **excluding me** — settling with yourself isn't a thing. */
  members: Person[];
  /** Currently chosen counterparty id, or `''`. */
  counterparty: string;
  onSelect: (personId: string) => void;
  /** Money coming in reads "who paid you?"; money going out, "who did you pay?". */
  inbound: boolean;
};

/**
 * "Who was this transfer with?" for one pending row.
 *
 * A group transfer can't be committed until this is answered — it settles with one
 * member rather than splitting across all of them — so the empty case has to say what
 * to do about it, not just report the absence.
 */
export function CounterpartySheet({ visible, onClose, members, counterparty, onSelect, inbound }: Props) {
  return (
    <SheetModal
      visible={visible}
      onClose={onClose}
      title={inbound ? 'Who paid you?' : 'Who did you pay?'}
    >
      {members.length === 0 ? (
        // Was a bare <Text> — AGENTS.md §2: an empty state is never just text.
        <EmptyState
          icon="user-plus"
          title="No one else here yet"
          body="This group has no other members, so there's nobody to settle with. Add someone to the group first, or switch this transaction to Personal."
        />
      ) : (
        // The same people grid as every people chooser (`PersonPicker`, `U-22`), one pick.
        <PersonPicker persons={members} selected={counterparty ? [counterparty] : []} onToggle={onSelect} multi={false} />
      )}
    </SheetModal>
  );
}
