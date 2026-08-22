import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter, useFocusEffect } from 'expo-router';
import { colors, type, space, layout, radius } from '../../src/theme';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { Card } from '../../src/components/ui/Card';
import { ListRow } from '../../src/components/ui/ListRow';
import { Divider } from '../../src/components/ui/Divider';
import { IconCircle } from '../../src/components/ui/IconCircle';
import { PrimaryButton } from '../../src/components/ui/PrimaryButton';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { dateTime } from '../../src/lib/dateFormat';
import { settings, type SyncLogEntry } from '../../src/lib/settings';
import { runSync } from '../../src/lib/syncEngine';
import { pendingUploadsByGroup } from '../../src/db/queries/syncOutbox';
import { useDataRefresh } from '../../src/components/system/DataRefreshProvider';
import { haptic } from '../../src/lib/haptics';

/**
 * What sync is actually doing — and, more often, why it is not.
 *
 * `runSync` swallows every failure by design: a background sync must never put a
 * dialog in front of somebody who did not ask for one. The price of that is a
 * feature which, when it silently does nothing, looks exactly like a feature that
 * is working. This screen is where that price is paid back.
 *
 * The question it exists to answer is the one that came back from the first real
 * use: **"it says 26 changes waiting to go up, and they never go."** They never
 * go because the group they are in has not been shared with anyone — there is no
 * recipient. The queue was honest; nothing told you that.
 */
export default function SyncLogScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { refresh } = useDataRefresh();

  const [log, setLog] = useState<SyncLogEntry[]>([]);
  const [queued, setQueued] = useState<Array<{ groupId: string; name: string; n: number }>>([]);
  const [known, setKnown] = useState<Map<string, string>>(new Map());
  const [lastAt, setLastAt] = useState<number | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(() => {
    let alive = true;
    (async () => {
      const [entries, byGroup, groups, at] = await Promise.all([
        settings.syncLog(), pendingUploadsByGroup(db), settings.syncGroups(), settings.lastSyncAt(),
      ]);
      if (!alive) return;
      setLog(entries);
      setQueued(byGroup);
      setKnown(new Map(groups));
      setLastAt(at);
    })().catch(() => {});
    return () => { alive = false; };
  }, [db]);

  useFocusEffect(load);

  /**
   * Sync now, on purpose.
   *
   * The app syncs on open, which is right for a ledger and useless for
   * diagnosing one. A button that runs it while you watch is the difference
   * between "it is broken" and "it is waiting for something".
   */
  async function syncNow() {
    setRunning(true);
    haptic.selection();
    const r = await runSync(db);
    setRunning(false);
    if (r.changed) refresh();
    load();
  }

  /*
   * Three states, not two.
   *
   * `known` is only written after a sync COMPLETES, so before the first one it is
   * empty — and treating empty as "nowhere to go" turns "I have not asked the
   * server yet" into a confident claim about the world. Someone signed out, or
   * offline, or with sync switched off would be told their entries are stranded
   * when nothing of the sort has been established.
   *
   * `lastSyncAt` is what separates the two: never completed means unknown, and
   * unknown says so.
   */
  const asked = lastAt !== null;
  const total = queued.reduce((n, q) => n + q.n, 0);
  const movable = asked ? queued.filter(q => known.get(q.groupId) === 'approved') : [];
  const stuck = asked ? queued.filter(q => known.get(q.groupId) !== 'approved') : [];
  const stuckTotal = stuck.reduce((n, q) => n + q.n, 0);
  const movableTotal = movable.reduce((n, q) => n + q.n, 0);

  return (
    <View style={styles.container}>
      <ScreenHeader title="Sync activity" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>

        {/*
          The queue, split by whether it can actually move.

          One combined number was the whole problem: it counted entries that were
          going nowhere and told you they would go next time you opened the app.
        */}
        <Text style={styles.heading}>Waiting to go up</Text>
        {queued.length === 0 ? (
          <Card padded>
            <View style={styles.clearRow}>
              <IconCircle icon="check" color={colors.income} bg={colors.bgMuted} size={36} />
              <Text style={styles.clearText}>Everything on this phone has been sent.</Text>
            </View>
          </Card>
        ) : !asked ? (
          /*
           * Queued, and genuinely not yet knowable. Saying which of these can move
           * requires asking the server which groups are shared, and that has never
           * happened on this device.
           */
          <Card>
            <ListRow
              icon="help-circle"
              iconColor={colors.textSecondary}
              title={`${total} change${total === 1 ? '' : 's'} queued`}
              subtitle={
                'Sync has not completed on this phone yet, so there is no way to say which of these '
                + 'can be sent. They are saved and nothing is lost. Run a sync below to find out.'
              }
              variant="stacked"
              chevron={false}
            />
          </Card>
        ) : (
          <Card>
            {movableTotal > 0 && (
              <ListRow
                icon="upload-cloud"
                iconColor={colors.accent}
                title={`${movableTotal} change${movableTotal === 1 ? '' : 's'} ready to send`}
                subtitle="These will go on the next sync."
                variant="stacked"
                chevron={false}
              />
            )}
            {movableTotal > 0 && stuckTotal > 0 && <Divider indent="text" />}
            {stuckTotal > 0 && (
              <ListRow
                icon="alert-circle"
                iconColor={colors.healthAmber}
                title={`${stuckTotal} change${stuckTotal === 1 ? '' : 's'} with nowhere to go`}
                subtitle={
                  `${stuck.map(q => q.name || 'a group').join(', ')} `
                  + `${stuck.length === 1 ? 'has' : 'have'} not been shared with anyone, so there is nobody to send these to. `
                  + 'Share the group from its Members screen and they will go on the next sync — nothing is lost in the meantime.'
                }
                variant="stacked"
                chevron={false}
              />
            )}
          </Card>
        )}

        <Text style={styles.heading}>Recent syncs</Text>
        <Card>
          <ListRow
            icon="refresh-cw"
            title={lastAt ? `Last completed ${dateTime(new Date(lastAt))}` : 'Never completed'}
            subtitle="Sync runs when you open the app. Run it now to watch what happens."
            variant="stacked"
            chevron={false}
          />
        </Card>
        <View style={styles.action}>
          <PrimaryButton label={running ? 'Syncing…' : 'Sync now'} onPress={syncNow} loading={running} />
        </View>

        {log.length === 0 ? (
          <EmptyState
            icon="clock"
            title="Nothing to show yet"
            body="Once sync has run, the last few attempts appear here — what went up, what came down, and anything that could not."
          />
        ) : (
          <Card>
            {log.map((e, i) => (
              <View key={`${e.at}-${i}`}>
                {i > 0 && <Divider indent="text" />}
                <ListRow
                  icon={e.skipped ? 'minus-circle' : 'check-circle'}
                  iconColor={e.skipped ? colors.textMuted : colors.income}
                  title={dateTime(new Date(e.at))}
                  subtitle={describe(e)}
                  variant="stacked"
                  chevron={false}
                />
              </View>
            ))}
          </Card>
        )}

        <Text style={styles.footnote}>
          Only shared groups are ever sent. Your personal spending, income, goals, budgets and
          net worth never leave this phone.
        </Text>
      </ScrollView>
      {running && <ActivityIndicator style={styles.floating} color={colors.accent} />}
    </View>
  );
}

/**
 * One run, in a sentence.
 *
 * A run that did nothing is the common case and the one worth being clearest
 * about — "nothing to do" and "could not reach the server" look identical from
 * the outside and mean completely different things.
 */
function describe(e: SyncLogEntry): string {
  if (e.skipped) return SKIPPED[e.skipped] ?? `Did not run — ${e.skipped}.`;

  const parts: string[] = [];
  if (e.pushed) parts.push(`${e.pushed} sent`);
  if (e.pulled) parts.push(`${e.pulled} received`);
  if (e.vanished) parts.push(`${e.vanished} group${e.vanished === 1 ? '' : 's'} ended`);
  if (e.conflicts) {
    parts.push(`${e.conflicts} changed on another device first — pull brought their version in`);
  }
  return parts.length ? parts.join(' · ') : 'Nothing to do — everything already matched.';
}

const SKIPPED: Record<string, string> = {
  offline: 'Could not reach the server. Nothing was lost; it tries again next time.',
  disabled: 'Sync is switched off.',
  'signed-out': 'You are signed out, so there is no account to sync with.',
  'not-configured': 'This build has no server configured.',
  'no-device-key': 'This device cannot store its own key, so it cannot sync.',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: layout.screenPaddingH, paddingBottom: space.xl },
  heading: { ...type.sectionLabel, color: colors.textSecondary, marginTop: space.lg, marginBottom: space.sm },
  clearRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  clearText: { ...type.body, color: colors.textSecondary, flex: 1, lineHeight: 20 },
  action: { marginTop: space.md, marginBottom: space.lg },
  footnote: { ...type.caption, color: colors.textMuted, lineHeight: 18, marginTop: space.lg },
  floating: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius.md },
});
