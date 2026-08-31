import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Switch, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter, useFocusEffect } from 'expo-router';
import { colors, type, space, layout } from '../../src/theme';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { Card } from '../../src/components/ui/Card';
import { ListRow } from '../../src/components/ui/ListRow';
import { Divider } from '../../src/components/ui/Divider';
import { Banner } from '../../src/components/ui/Banner';
import { settings } from '../../src/lib/settings';
import { dateTime } from '../../src/lib/dateFormat';
import { haptic } from '../../src/lib/haptics';
import { serverConfigured } from '../../src/lib/serverApi';
import { useServerSession } from '../../src/hooks/useServerSession';
import { pendingUploadCount } from '../../src/db/queries/syncOutbox';
import { getAllGroups, sharedGroupsOf } from '../../src/db/queries/groups';
import { pendingGroupInvites, acceptGroupInvite } from '../../src/lib/syncEngine';
import { rememberSyncPassphrase, forgetSyncPassphrase, maybeSnapshot } from '../../src/lib/syncSnapshot';
import { PassphraseSheet } from '../../src/components/finance/backup/PassphraseSheet';
import type { SyncGroup } from '../../src/lib/serverApi';

/**
 * What syncing actually means for you — said plainly, in one place.
 *
 * This screen exists because the honest answers are surprising, and every one of
 * them is something a user would otherwise have to discover by being wrong about
 * it: only shared groups travel, the server cannot read any of it, off is a pause
 * rather than a retraction, and it is not live.
 */
export default function SyncScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { session } = useServerSession();
  const configured = serverConfigured();

  const [enabled, setEnabled] = useState(false);
  const [waiting, setWaiting] = useState(0);
  const [sharedCount, setSharedCount] = useState(0);
  const [invites, setInvites] = useState<SyncGroup[]>([]);
  const [joining, setJoining] = useState<string | null>(null);
  const [lastAt, setLastAt] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [everything, setEverything] = useState(false);
  const [askPass, setAskPass] = useState(false);
  const [savingPass, setSavingPass] = useState(false);

  const load = useCallback(() => {
    let alive = true;
    (async () => {
      const [on, n, groups, pending, at, why] = await Promise.all([
        settings.syncEnabled(), pendingUploadCount(db), getAllGroups(db), pendingGroupInvites(),
        settings.lastSyncAt(), settings.lastSyncNote(),
      ]);
      const everythingOn = await settings.syncEverything().catch(() => false);
      if (alive) setEverything(everythingOn);
      if (!alive) return;
      setEnabled(on);
      setWaiting(n);
      setSharedCount(sharedGroupsOf(groups).length);
      setInvites(pending);
      setLastAt(at);
      setNote(why);
    })().catch(() => {});
    return () => { alive = false; };
  }, [db]);

  useFocusEffect(load);

  /**
   * Accept an invitation.
   *
   * The group's entries are NOT fetched here — they arrive on the next ordinary
   * sync, because a cursor of zero already means "everything". Special-casing a
   * first pull would be a second code path doing what the normal one does.
   */
  async function accept(g: SyncGroup) {
    setJoining(g.id);
    const ok = await acceptGroupInvite(g.id);
    setJoining(null);
    if (!ok) {
      haptic.error();
      Alert.alert('Could not accept', 'Check your connection and try again.');
      return;
    }
    haptic.success();
    setInvites(prev => prev.filter(x => x.id !== g.id));
    Alert.alert(
      'Joined',
      'This group will appear the next time the app syncs. Entries other people add show up in '
      + 'the group straight away, but move none of your own numbers until you accept them — '
      + 'unless you have marked that person trusted.',
    );
  }

  /**
   * The second switch: a whole-app encrypted copy, not entry sync.
   *
   * Turning it ON asks for a passphrase, because that is the only thing that can
   * open it on a phone this one has never met. It is held in this device's
   * keychain so snapshots can run unattended, and never leaves — which is also
   * why forgetting it is unrecoverable, said here rather than discovered later.
   */
  async function toggleEverything(next: boolean) {
    haptic.selection();
    if (next) { setAskPass(true); return; }

    setEverything(false);
    await settings.setSyncEverything(false);
    await forgetSyncPassphrase();
    Alert.alert(
      'Stopped',
      'No new copies will be made. The ones already on your account stay there until you '
      + 'delete them under Backup & restore — turning this off is not a deletion.',
    );
  }

  async function confirmPassphrase(passphrase: string) {
    setSavingPass(true);
    const held = await rememberSyncPassphrase(passphrase);
    if (!held) {
      setSavingPass(false);
      setAskPass(false);
      haptic.error();
      Alert.alert('Cannot store the passphrase', 'This device has no secure storage, so an automatic copy could not be opened again.');
      return;
    }
    await settings.setSyncEverything(true);
    setEverything(true);
    setAskPass(false);
    setSavingPass(false);
    haptic.success();
    // Take the first one now rather than in six hours: turning it on and having
    // nothing happen is indistinguishable from it not working.
    const r = await maybeSnapshot(db);
    Alert.alert(
      r.ok ? 'First copy saved' : 'Turned on',
      r.ok
        ? 'Everything on this phone is now on your account, encrypted. It refreshes in the background from here on.\n\nKeep that passphrase — without it nobody, including us, can open this.'
        : 'The first copy will be made shortly.\n\nKeep that passphrase — without it nobody, including us, can open this.',
    );
    load();
  }

  async function toggle(next: boolean) {
    haptic.selection();
    if (!next) {
      // Turning it OFF is safe and reversible, so it does not need a confirm — but
      // it does need the truth, because "off" is widely read as "and take it back".
      setEnabled(false);
      await settings.setSyncEnabled(false);
      Alert.alert(
        'Sync paused',
        'Nothing new will go up or come down. What is already on the server stays there — turning sync off cannot take it back.',
      );
      return;
    }
    // Turning it ON is the consequential direction: this is the moment data leaves
    // the phone. Name what will travel before it does.
    Alert.alert(
      'Turn on sync?',
      `Entries in your ${sharedCount} shared group${sharedCount === 1 ? '' : 's'} will be encrypted on this phone and sent to your account, so the people in them stay up to date.\n\n`
      + 'This switch carries nothing else — your personal group, income, goals, budgets and net worth '
      + 'stay on this device unless you also turn on “Keep a copy of everything”.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Turn on',
          onPress: async () => {
            setEnabled(true);
            await settings.setSyncEnabled(true);
          },
        },
      ],
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Sync" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        {!configured ? (
          <Banner icon="cloud-off" text="This build has no server configured, so there is nothing to sync to." />
        ) : !session ? (
          <Banner
            icon="user"
            text="Sign in first — sync needs an account to know which devices are yours."
            actionLabel="Account"
            onAction={() => router.push('/settings/account')}
          />
        ) : null}

        {/*
          Invitations sit at the TOP, above the switch, because they are the one
          thing here that someone else is waiting on. Accepting is what makes a
          group start arriving — an invitation that is never answered looks
          identical to sync not working.
        */}
        {invites.length > 0 && (
          <>
            <Text style={styles.heading}>Waiting for you</Text>
            <Card>
              {invites.map((g, i) => (
                <View key={g.id}>
                  {i > 0 && <Divider indent="none" />}
                  <ListRow
                    icon="user-plus"
                    title="You have been invited to a group"
                    subtitle="Accepting starts sharing this group's entries between you both."
                    variant="stacked"
                    chevron={false}
                    value={joining === g.id
                      ? <ActivityIndicator color={colors.accent} />
                      : <Text style={styles.accept}>Accept</Text>}
                    onPress={joining ? undefined : () => accept(g)}
                  />
                </View>
              ))}
            </Card>
          </>
        )}

        <Card>
          <ListRow
            icon="refresh-cw"
            title="Keep shared groups in sync"
            subtitle={enabled
              ? 'On. Changes travel when you open the app.'
              : 'Off. Everything stays on this phone.'}
            variant="stacked"
            chevron={false}
            value={(
              <Switch
                value={enabled}
                onValueChange={toggle}
                disabled={!configured || !session}
                trackColor={{ false: colors.bgMuted, true: colors.accent }}
                thumbColor={colors.onAccent}
              />
            )}
          />
        </Card>

        {/*
          The second switch, and deliberately a separate card.

          It is not "more of the same": groups sync entry by entry, this is a
          whole-app snapshot. Presenting them as one control with a degree setting
          would hide that they fail differently — and that only this one can bring
          a phone back from nothing.
        */}
        <Card>
          <ListRow
            icon="hard-drive"
            title="Keep a copy of everything"
            subtitle={everything
              ? 'On. A fresh phone can become this one again — sign in, enter your passphrase.'
              : 'Off. Only the groups above would travel.'}
            variant="stacked"
            chevron={false}
            value={(
              <Switch
                value={everything}
                onValueChange={toggleEverything}
                disabled={!configured || !session}
                trackColor={{ false: colors.bgMuted, true: colors.accent }}
                thumbColor={colors.onAccent}
              />
            )}
          />
        </Card>
        {everything && (
          <Text style={styles.footnote}>
            Sealed on this phone with your passphrase, which is never sent — so the server holds a
            copy it cannot open, and losing the passphrase means losing the copy. It refreshes in
            the background, and the newest copy wins: two phones used heavily at the same time will
            not merge, so this is for getting a phone back, not for working on two at once.
          </Text>
        )}

        {/*
          The four things people get wrong, answered before they have to ask. Each
          is a real surprise, not reassurance: a user who assumes the opposite of
          any of these will make a decision they would not have made.
        */}
        <Text style={styles.heading}>What this does</Text>
        <Card padded>
          <Fact
            title={everything ? 'Groups sync; everything else is copied' : 'Only shared groups travel'}
            body={everything
              ? 'The switch above syncs the groups you split with, entry by entry. “Keep a copy of everything” also sends an encrypted copy of the rest — your own spending, goals, budgets and net worth — so a new phone can become this one. Both are sealed here first.'
              : 'Your personal spending, income, savings goals, budgets and net worth never leave this phone. Sync carries the groups you split with, and nothing else. Turn on “Keep a copy of everything” to change that.'}
          />
          <Divider indent="none" />
          <Fact
            title="We cannot read any of it"
            body="Everything is encrypted on this phone before it is sent. The server stores sealed blobs it has no key for — not amounts, not who paid, not what it was for."
          />
          <Divider indent="none" />
          <Fact
            title="Nothing lands without your say-so"
            body="An entry someone else adds shows up in the group, but moves none of your own numbers until you accept it — unless you have marked that person trusted."
          />
          <Divider indent="none" />
          <Fact
            title="It is not live"
            body="Changes are exchanged when you open the app, not the second someone types them. A ledger does not need to be a chat."
          />
        </Card>

        {enabled && (
          <>
            <Text style={styles.heading}>Right now</Text>
            <Card>
              {/*
                “They will go the next time you open the app” was false whenever
                the group had not been shared: there is no recipient, so those
                entries never move however many times you open it. The count was
                honest and the sentence was not. Details carries the real answer.
              */}
              <ListRow
                icon={waiting > 0 ? 'upload-cloud' : 'check'}
                title={waiting > 0
                  ? `${waiting} change${waiting === 1 ? '' : 's'} waiting to go up`
                  : 'Everything here has been sent'}
                subtitle={waiting > 0 ? 'Tap to see which can be sent, and which have nowhere to go yet.' : undefined}
                variant="stacked"
                onPress={() => router.push('/settings/sync-log')}
              />
              <Divider indent="text" />
              {/*
                The honest status line.

                `runSync` never throws, deliberately — a failed sync must not put a
                dialog in front of someone who did not ask for one. The cost is
                that silently doing nothing looks exactly like working. This is
                where the two are told apart, and it is the first thing to look at
                when sync appears dead on a real phone.
              */}
              <ListRow
                icon={NOTE[note ?? 'ok'] ? 'alert-circle' : 'clock'}
                iconColor={NOTE[note ?? 'ok'] ? colors.healthAmber : colors.textSecondary}
                title={lastAt ? `Last synced ${dateTime(new Date(lastAt))}` : 'Not synced yet'}
                subtitle={NOTE[note ?? 'ok'] ?? 'See what went up, what came down, and sync now.'}
                variant="stacked"
                onPress={() => router.push('/settings/sync-log')}
              />
            </Card>
          </>
        )}

        <Text style={styles.footnote}>
          Turning sync off pauses it. It does not delete what is already on the server,
          and it does not remove anything from anyone else&apos;s phone.
        </Text>
      </ScrollView>

      <PassphraseSheet
        visible={askPass}
        onClose={() => setAskPass(false)}
        mode="create"
        onSubmit={confirmPassphrase}
        submitting={savingPass}
      />
    </View>
  );
}

/**
 * Why a sync did nothing, in words rather than a code.
 *
 * Only the states worth explaining are here — 'ok' maps to nothing, because a
 * working sync needs no commentary and a subtitle saying "fine" is noise.
 */
const NOTE: Record<string, string | undefined> = {
  ok: undefined,
  offline: 'Could not reach the server last time. It will try again when you next open the app.',
  disabled: 'Sync is switched off, so nothing is being exchanged.',
  'not-configured': 'This build has no server configured.',
  'no-device-key': 'This device cannot store its own key, so it cannot sync.',
  'signed-out': 'You are signed out, so there is no account to sync with.',
  // Its own line, because it used to be reported as `offline` — so the screen
  // said "could not reach the server" above a banner saying "sign in first", and
  // the one action that would fix it looked unrelated to the problem.
  'session-expired': 'Your session ended, so sync stopped. Sign in again under Account.',
  restoring: 'Paused while a backup is being restored.',
};

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
