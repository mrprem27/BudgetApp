import { useState } from 'react';
import { Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { deletePerson, saveFriendDetails, inviteFriendByEmail } from '../lib/personWrites';
import { refusalReason } from '../lib/personCopy';
import { haptic } from '../lib/haptics';
import { useDataRefresh } from '../components/system/DataRefreshProvider';
import type { Person } from '../db/queries/persons';

/**
 * Editing one person's details (name, UPI, phone, email) and removing them, for
 * `PersonNameSheet`. Friends and the person's own page both open it, so the save, the
 * invite that follows a new address and the removal live here once.
 */
export function usePersonEdit({ onRemoved }: { onRemoved?: () => void } = {}) {
  const db = useSQLiteContext();
  const { refresh } = useDataRefresh();
  const [person, setPerson] = useState<Person | null>(null);
  const [name, setName] = useState('');
  const [vpa, setVpa] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  function open(p: Person) {
    setPerson(p);
    setName(p.name);
    setVpa(p.upi_vpa ?? '');
    setPhone(p.mobile ?? '');
    setEmail(p.email ?? '');
  }

  /**
   * Remove somebody added by mistake.
   *
   * Refused for anyone with history, and the refusal explains itself rather than
   * saying no: a person with shared expenses is not a typo, and the honest answers
   * for them are removing them from a group (soft, reversible) or merging two rows
   * that turned out to be one human.
   */
  function confirmDelete() {
    const target = person;
    if (!target) return;
    Alert.alert(
      `Remove ${target.name}?`,
      'They will be gone from your friends list.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            const res = await deletePerson(db, target.id);
            if (!res.ok) {
              haptic.error();
              Alert.alert(`Can't remove ${target.name}`, refusalReason(res));
              return;
            }
            haptic.warning();
            setPerson(null);
            // Leave first: a page for someone who no longer exists must not reload.
            onRemoved?.();
            refresh();
          } catch {
            haptic.error();
            Alert.alert(`Couldn't remove ${target.name}`, 'Please try again.');
          }
        } },
      ],
    );
  }

  /**
   * Save the details, and — if an address was added — ask that person to connect.
   *
   * One act, deliberately. Adding somebody and inviting them are the same
   * intention, and splitting them across two screens is how an invite step ends
   * up never being found.
   *
   * The invite is best-effort and never blocks the save: the address is theirs
   * whether or not the request went out, and a failed send is something to retry,
   * not a reason to lose what they typed.
   */
  async function save() {
    const target = person;
    const trimmed = name.trim();
    const nextVpa = vpa.trim() || null;
    const nextPhone = phone.trim() || null;
    const nextEmail = email.trim().toLowerCase() || null;
    if (!target || !trimmed) { setPerson(null); return; }
    const unchanged = trimmed === target.name
      && nextVpa === (target.upi_vpa ?? null)
      && nextPhone === (target.mobile ?? null)
      && nextEmail === (target.email ?? null);
    if (unchanged) { setPerson(null); return; }
    let invite: string | null = null;
    try {
      invite = await saveFriendDetails(db, target, { name: trimmed, vpa: nextVpa, phone: nextPhone, email: nextEmail });
      haptic.success();
      setPerson(null);
      refresh();
    } catch {
      haptic.error();
      Alert.alert('Something went wrong', 'Please try again.');
      return;
    }
    if (invite) await inviteByEmail(target, invite);
  }

  /**
   * Ask an address to connect, and remember which person row it was for.
   *
   * That second half is the whole reason a local mirror table exists: when the
   * request is accepted, the account id has to land on the row the user actually
   * chose, not on a match they are asked to make later and will not find.
   */
  async function inviteByEmail(target: Person, address: string) {
    try {
      if (!(await inviteFriendByEmail(db, target, address))) return;
      refresh();
    } catch (e) {
      haptic.error();
      Alert.alert(
        'Saved, but the invite didn’t go',
        e instanceof Error ? e.message : 'Try again from their row.',
      );
    }
  }

  return {
    open,
    /** Spread onto `PersonNameSheet`. */
    sheetProps: {
      visible: !!person,
      onClose: () => setPerson(null),
      title: 'Edit details',
      value: name, onChangeText: setName, onSubmit: save,
      vpa, onChangeVpa: setVpa,
      phone, onChangePhone: setPhone,
      email, onChangeEmail: setEmail,
      onDelete: confirmDelete,
    },
  };
}
