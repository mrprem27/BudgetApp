import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter, useFocusEffect } from 'expo-router';
import { colors, type, space, layout } from '../../src/theme';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { Card } from '../../src/components/ui/Card';
import { ListRow } from '../../src/components/ui/ListRow';
import { Divider } from '../../src/components/ui/Divider';
import { Banner } from '../../src/components/ui/Banner';
import { serverConfigured } from '../../src/lib/serverApi';
import { haptic } from '../../src/lib/haptics';
import { useServerSession } from '../../src/hooks/useServerSession';
import { pendingInvites, answerInvite, type PendingInvite } from '../../src/db/queries/syncApply';
import { scheduleSync } from '../../src/lib/sync/run';
import { SyncStatus } from '../../src/components/system/SyncStatus';
import { useDataRefresh } from '../../src/components/system/DataRefreshProvider';

/**
 * What syncing actually means for you — said plainly, in one place.
 *
 * This screen exists because the honest answers are surprising, and each is
 * something a user would otherwise find out by being wrong about it: everything
 * goes to the account, the server can read it, nobody else's entry moves your
 * numbers without your say-so, and it isn't a live connection.
 *
 * There is no switch. Signing in is what joins a phone to its account
 * (first sign-in, `SPEC-SERVER.md` §4) and signing out is what leaves it; a
 * second control that could say "off" while the account still held everything
 * would be one more thing that looks like a promise and isn't.
 */
export default function SyncScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { session } = useServerSession();
  const { refresh } = useDataRefresh();
  const configured = serverConfigured();

  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [joining, setJoining] = useState<string | null>(null);

  const load = useCallback(() => {
    let alive = true;
    pendingInvites(db).then(p => { if (alive) setInvites(p); }).catch(() => {});
    return () => { alive = false; };
  }, [db]);

  useFocusEffect(load);

  /**
   * Accept an invitation.
   *
   * Queued like any other change (`answerInvite`), so it holds offline and can't
   * half-fail here. The group and its entries arrive with the sync this kicks off —
   * a cursor of zero already means "everything", so there is no special first pull.
   */
  async function accept(g: PendingInvite) {
    setJoining(g.memberId);
    try {
      await answerInvite(db, g, true);
    } catch {
      setJoining(null);
      haptic.error();
      Alert.alert('Could not accept', 'Please try again.');
      return;
    }
    setJoining(null);
    haptic.success();
    setInvites(prev => prev.filter(x => x.memberId !== g.memberId));
    // The group then shows up everywhere, not only here.
    scheduleSync(db, () => { refresh(); load(); }, 0);
    Alert.alert(
      'Joined',
      'The group appears as soon as the app syncs — in a few seconds if you’re online. Entries other people add show up in '
      + 'the group straight away, but move none of your own numbers until you accept them — '
      + 'unless you have marked that person trusted.',
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Sync" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Where this phone's data stands (SPEC-SERVER.md §6.1). Draws nothing
            when signed out; the Banner below says what to do then. */}
        <SyncStatus />
        {!configured ? (
          <Banner icon="cloud-off" text="This build has no server configured, so there is nothing to sync to." />
        ) : !session ? (
          <Banner
            icon="user"
            text="Sign in first — sync is your account, on every phone you sign in on."
            actionLabel="Account"
            onAction={() => router.push('/settings/account')}
          />
        ) : null}

        {/*
          Invitations sit at the top because they are the one thing here that
          someone else is waiting on. Accepting is what makes a group start
          arriving — an invitation never answered looks identical to sync not
          working.
        */}
        {invites.length > 0 && (
          <>
            <Text style={styles.heading}>Waiting for you</Text>
            <Card>
              {invites.map((g, i) => (
                <View key={g.memberId}>
                  {i > 0 && <Divider indent="none" />}
                  <ListRow
                    icon="user-plus"
                    title={g.invitedBy ? `${g.invitedBy} invited you to ${g.groupName}` : `You're invited to ${g.groupName}`}
                    subtitle="Accepting starts sharing this group's entries between you."
                    variant="stacked"
                    chevron={false}
                    value={joining === g.memberId
                      ? <ActivityIndicator color={colors.accent} />
                      : <Text style={styles.accept}>Accept</Text>}
                    onPress={joining ? undefined : () => accept(g)}
                  />
                </View>
              ))}
            </Card>
          </>
        )}

        {/*
          The things people get wrong, answered before they have to ask. Each is a
          real surprise, not reassurance: a user who assumes the opposite of any of
          these would make a decision they wouldn't otherwise have made.
        */}
        <Text style={styles.heading}>What this does</Text>
        <Card padded>
          <Fact
            title="Everything goes to your account"
            body="Your groups, and your own spending, goals, budgets and net worth. A new phone gets all of it back when you sign in. It works offline, and catches up when there's a connection."
          />
          <Divider indent="none" />
          <Fact
            title="The server can read it"
            body="Your account's copy is stored as it is, not sealed. That's what lets the server check who may change what in a shared group, and bring everything back on a new phone."
          />
          <Divider indent="none" />
          <Fact
            title="Nothing lands without your say-so"
            body="An entry someone else adds shows up in the group, but moves none of your own numbers until you accept it — unless you have marked that person trusted."
          />
          <Divider indent="none" />
          <Fact
            title="It isn't live"
            body="Changes go up a few seconds after you make them while the app is open, and catch up when you come back to it. A ledger doesn't need to be a chat."
          />
        </Card>

        <Text style={styles.footnote}>
          Signing out sends anything not yet sent, then empties this phone. Your account keeps
          everything, and signing in again brings it back.
        </Text>
      </ScrollView>
    </View>
  );
}

function Fact({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factTitle}>{title}</Text>
      <Text style={styles.factBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: layout.screenPaddingH, paddingBottom: space.xl },
  heading: { ...type.sectionLabel, color: colors.textSecondary, marginTop: space.lg, marginBottom: space.sm },
  fact: { paddingVertical: space.smd },
  factTitle: { ...type.bodySemi, color: colors.textPrimary, marginBottom: space.xs },
  factBody: { ...type.caption, color: colors.textSecondary, lineHeight: 18 },
  accept: { ...type.button, color: colors.accent },
  footnote: { ...type.caption, color: colors.textMuted, lineHeight: 18, marginTop: space.lg },
});
