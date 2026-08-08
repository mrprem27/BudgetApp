import React from 'react';
import { SheetModal } from '../../ui/SheetModal';
import { EmptyState } from '../../ui/EmptyState';
import { MemberAvatar } from '../MemberAvatar';
import { DestOption } from './DestOption';
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
      scroll={false}
    >
      {members.length === 0 ? (
        // Was a bare <Text> — AGENTS.md §2: an empty state is never just text.
        <EmptyState
          icon="user-plus"
          title="No one else here yet"
          body="This group has no other members, so there's nobody to settle with. Add someone to the group first, or switch this transaction to Personal."
        />
      ) : (
        members.map(m => (
          <DestOption
            key={m.id}
            label={m.name}
            leading={<MemberAvatar name={m.name} color={m.avatar_color} size={28} imageUri={m.image_uri} />}
            active={counterparty === m.id}
            onPress={() => onSelect(m.id)}
          />
        ))
      )}
    </SheetModal>
  );
}
