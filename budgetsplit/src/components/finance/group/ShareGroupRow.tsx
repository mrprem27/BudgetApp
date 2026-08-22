import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { colors, type, space, layout } from '../../tokens';
import { Card } from '../../ui/Card';
import { ListRow } from '../../ui/ListRow';
import { Divider } from '../../ui/Divider';
import { SheetModal } from '../../ui/SheetModal';
import { IconCircle } from '../../ui/IconCircle';
import { MemberAvatar } from '../MemberAvatar';
import { haptic } from '../../../lib/haptics';
import { settings } from '../../../lib/settings';
import { shareGroup } from '../../../lib/syncEngine';
import { listLinks, serverConfigured, type ServerLink } from '../../../lib/serverApi';
import type { Person } from '../../../db/queries/persons';

/**
 * The one way to put a group on the wire.
 *
 * Sharing is deliberately **per person and explicit**, never a switch on the
 * group. A group is only a set of humans, so "share this group" as a single
 * toggle would silently extend to whoever is added to it next — the same reason
 * trust is per person rather than per group.
 *
 * Everything about this row is gated on things being genuinely ready: a server, a
 * session, sync switched on, and the person being someone you have already linked
 * with. Where one is missing the row says which, because the alternative is a
 * control that does nothing and gives no reason.
 */

type Props = {
  groupId: string;
  /** Local members, so we only offer people actually in this group. */
  members: Person[];
  /** Whether this group is already published and syncing. */
  onShared: () => void;
};

export function ShareGroupRow({ groupId, members, onShared }: Props) {
  const db = useSQLiteContext();
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<ServerLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const configured = serverConfigured();

  React.useEffect(() => {
    settings.syncEnabled().then(setEnabled).catch(() => {});
  }, []);

  /**
   * Only people who are BOTH in this group and linked to my account.
   *
   * Both halves are load-bearing. Not a member: their entries would be refused by
   * `ingestPeerTxn` as `not-a-member`, so sharing would appear to work and then
   * quietly deliver nothing. Not linked: the server refuses the invite outright,
   * and there is no directory to look them up in by design.
   */
  const openPicker = useCallback(async () => {
    haptic.selection();
    setOpen(true);
    setLoading(true);
    try {
      const all = await listLinks();
      const memberUids = new Set(members.map(m => m.remote_uid).filter(Boolean));
      setLinks(all.filter(l => memberUids.has(l.person.id)));
    } catch {
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, [members]);

  async function share(link: ServerLink) {
    setBusyId(link.person.id);
    const res = await shareGroup(db, groupId, link.person.id);
    setBusyId(null);
    if (res.ok) {
      haptic.success();
      setOpen(false);
      onShared();
      Alert.alert(
        'Invitation sent',
        `${link.person.name ?? link.person.email} has been invited to this group. `
        + 'Nothing is shared until they accept it on their phone.\n\n'
        + 'From then on, entries in this group are encrypted here and sent to your account — '
        + 'the server stores sealed data it has no key for.',
      );
      return;
    }
    haptic.error();
    Alert.alert('Could not share', REASON[res.reason]);
  }

  // Nothing to say on a build with no server, and nothing that could be made to
  // work by explaining it.
  if (!configured) return null;

  return (
    <>
      <Card>
        <ListRow
          icon="refresh-cw"
          title="Share with a member"
          subtitle={enabled
            ? 'Send this group to someone you have linked with, so you both see the same entries.'
            : 'Sync is off. Turn it on to share a group.'}
          variant="stacked"
          onPress={enabled ? openPicker : () => router.push('/settings/sync')}
        />
      </Card>

      <SheetModal visible={open} onClose={() => setOpen(false)} title="Share this group">
        {loading ? (
          <ActivityIndicator color={colors.accent} style={styles.loading} />
        ) : links.length === 0 ? (
          /*
           * The empty state carries the actual reason, because there are two very
           * different ones and the fix differs: a member with no linked account,
           * or a linked person who is not in this group. Saying "nobody to share
           * with" alone would leave someone stuck with no idea which.
           */
          <View style={styles.empty}>
            <IconCircle icon="user-plus" color={colors.accent} bg={colors.accentMuted} size={64} />
            <Text style={styles.emptyTitle}>Nobody here to share with yet</Text>
            <Text style={styles.emptyBody}>
              You can share with someone who is both a member of this group and linked to your
              account. Link them under Settings → Linked people, and make sure they are in this
              group.
            </Text>
            <TouchableOpacity onPress={() => { setOpen(false); router.push('/settings/linked'); }}>
              <Text style={styles.emptyAction}>Open Linked people</Text>
            </TouchableOpacity>
          </View>
        ) : (
          links.map((l, i) => (
            <View key={l.person.id}>
              {i > 0 && <Divider indent="text" />}
              <ListRow
                leading={<MemberAvatar
                  name={l.person.name ?? l.person.email}
                  color={colors.accent}
                  size={layout.avatarSize}
                  imageUri={l.person.avatarUrl}
                />}
                title={l.person.name ?? l.person.email}
                subtitle={l.person.email}
                variant="stacked"
                chevron={false}
                value={busyId === l.person.id
                  ? <ActivityIndicator color={colors.accent} />
                  : <Text style={styles.send}>Share</Text>}
                onPress={busyId ? undefined : () => share(l)}
              />
            </View>
          ))
        )}
      </SheetModal>
    </>
  );
}

/**
 * Every refusal named, because each has a different next step and a generic
 * "something went wrong" would leave the user guessing between four of them.
 */
const REASON: Record<string, string> = {
  'not-signed-in': 'Sign in first — sharing needs an account to know which devices are yours.',
  'no-device-key': 'This device cannot store its own key, so it cannot share a group.',
  'not-linked': 'You are not linked with that person any more. Link again under Settings → Linked people.',
  'no-devices': 'They have an account but have not opened the app on a phone yet. '
    + 'Ask them to open BudgetSplit once, then try again.',
  failed: 'Could not reach the server. Check your connection and try again.',
};

const styles = StyleSheet.create({
  loading: { paddingVertical: space.xl },
  empty: { alignItems: 'center', paddingVertical: space.lg, paddingHorizontal: space.md },
  emptyTitle: { ...type.subheading, color: colors.textPrimary, marginTop: space.md, textAlign: 'center' },
  emptyBody: {
    ...type.body, color: colors.textSecondary, textAlign: 'center',
    marginTop: space.sm, lineHeight: 20,
  },
  emptyAction: { ...type.button, color: colors.accent, marginTop: space.md },
  send: { ...type.button, color: colors.accent },
});
