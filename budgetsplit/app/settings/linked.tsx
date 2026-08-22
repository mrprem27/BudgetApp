import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator, Switch, Share } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { format } from 'date-fns';
import { shortDate } from '../../src/lib/dateFormat';
import QRCode from 'react-native-qrcode-svg';
import { colors, type, space, layout } from '../../src/theme';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { Card } from '../../src/components/ui/Card';
import { ListRow } from '../../src/components/ui/ListRow';
import { Divider } from '../../src/components/ui/Divider';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { PrimaryButton } from '../../src/components/ui/PrimaryButton';
import { SecondaryButton } from '../../src/components/ui/SecondaryButton';
import { useSQLiteContext } from 'expo-sqlite';
import { getAllPersons, setRemoteUid, type Person } from '../../src/db/queries/persons';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { haptic } from '../../src/lib/haptics';
import {
  createInvite, listPendingClaims, decideClaim, listLinks,
  setLinkPhoneSharing, removeLink,
  type ServerLink, type PendingClaim,
} from '../../src/lib/serverApi';

/**
 * Who you're linked with, who's waiting on your approval, and what you're
 * showing them.
 *
 * Two rules this screen exists to make visible:
 * 1. **You approve who links to you.** An invite link can be forwarded, so
 *    claiming one only asks.
 * 2. **Sharing your number is a disclosure, not a permission.** Turning it off
 *    stops future reads; it cannot reach into their phone and delete it. The
 *    copy says exactly that rather than implying a recall.
 */
export default function LinkedPeopleScreen() {
  const router = useRouter();

  const [links, setLinks] = useState<ServerLink[]>([]);
  const [claims, setClaims] = useState<PendingClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const db = useSQLiteContext();
  const [busy, setBusy] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ url: string; expiresAt: number } | null>(null);
  const [creating, setCreating] = useState(false);
  /** Local people, so a link can be matched to one. */
  const [people, setPeople] = useState<Person[]>([]);
  /** The link currently being matched, if any. */
  const [matching, setMatching] = useState<ServerLink | null>(null);

  /** Who this account is already bound to locally, by name. */
  const boundName = (link: ServerLink) =>
    people.find(p => p.remote_uid === link.person.id)?.name ?? null;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextLinks, nextClaims, nextPeople] = await Promise.all([
        listLinks(), listPendingClaims(), getAllPersons(db),
      ]);
      setLinks(nextLinks);
      setClaims(nextClaims);
      setPeople(nextPeople.filter(p => p.is_me !== 1));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your linked people.');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  /**
   * Bind (or unbind) the account being matched. Unbinding must stay possible —
   * a wrong match would otherwise permanently let that account write entries as
   * someone they are not.
   */
  async function handleMatch(person: Person | null) {
    if (!matching) return;
    const uid = matching.person.id;
    try {
      // Clear any previous holder first: one account, one person.
      const prev = people.find(p => p.remote_uid === uid);
      if (prev && prev.id !== person?.id) await setRemoteUid(db, prev.id, null);
      if (person) await setRemoteUid(db, person.id, uid);
      haptic.success();
      setMatching(null);
      await load();
    } catch (e) {
      haptic.error();
      setError(e instanceof Error ? e.message : 'Could not match this account.');
    }
  }

  async function handleInvite() {
    setCreating(true);
    setError(null);
    try {
      const made = await createInvite();
      setInvite({ url: made.url, expiresAt: made.expiresAt });
      haptic.success();
    } catch (e) {
      haptic.error();
      setError(e instanceof Error ? e.message : 'Could not create an invite link.');
    } finally {
      setCreating(false);
    }
  }

  async function handleDecide(claim: PendingClaim, approve: boolean) {
    setBusy(claim.token);
    try {
      await decideClaim(claim.token, approve);
      await load();
      approve ? haptic.success() : haptic.warning();
    } catch (e) {
      haptic.error();
      setError(e instanceof Error ? e.message : 'Could not answer that request.');
    } finally {
      setBusy(null);
    }
  }

  async function handleShareToggle(link: ServerLink, next: boolean) {
    setBusy(link.id);
    // Optimistic: the switch must move under the thumb, and a failure reloads truth.
    setLinks(prev => prev.map(l => (l.id === link.id ? { ...l, sharingMyPhone: next } : l)));
    try {
      await setLinkPhoneSharing(link.id, next);
      haptic.selection();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change that.');
      await load();
    } finally {
      setBusy(null);
    }
  }

  function handleUnlink(link: ServerLink) {
    const who = link.person.name ?? link.person.email;
    Alert.alert(
      `Unlink ${who}?`,
      'You both stop seeing each other’s shared details. Anything you’ve already recorded about them on this device stays exactly as it is.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlink',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeLink(link.id);
              await load();
              haptic.warning();
            } catch (e) {
              haptic.error();
              setError(e instanceof Error ? e.message : 'Could not unlink.');
            }
          },
        },
      ],
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Linked people" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator color={colors.accent} style={styles.loading} />
        ) : (
          <>
            {error && <Text style={styles.error}>{error}</Text>}

            {claims.length > 0 && (
              <>
                <SectionHeader title="Waiting for you" />
                <Card>
                  {claims.map((claim, i) => (
                    <View key={claim.token}>
                      {i > 0 && <Divider indent="text" />}
                      <ListRow
                        icon="user-plus"
                        title={claim.from.name ?? claim.from.email}
                        subtitle={`${claim.from.email} · opened your invite ${format(new Date(claim.claimedAt), 'd MMM, h:mm a')}`}
                        variant="stacked"
                        chevron={false}
                      />
                      <View style={styles.decideRow}>
                        <SecondaryButton
                          label="Not them"
                          size="md"
                          danger
                          onPress={() => handleDecide(claim, false)}
                          disabled={busy === claim.token}
                          style={styles.decideBtn}
                        />
                        <PrimaryButton
                          label="Link"
                          onPress={() => handleDecide(claim, true)}
                          loading={busy === claim.token}
                          style={styles.decideBtn}
                        />
                      </View>
                    </View>
                  ))}
                </Card>
                <Text style={styles.hint}>
                  An invite link can be forwarded, so check this is the person you sent it to.
                </Text>
              </>
            )}

            <SectionHeader title="Linked" />
            {links.length === 0 ? (
              <Card padded>
                <EmptyState
                  icon="users"
                  title="Nobody linked yet"
                  body="Send someone an invite link and, once you confirm it's them, you'll see each other's shared details here."
                />
              </Card>
            ) : (
              <Card>
                {links.map((link, i) => (
                  <View key={link.id}>
                    {i > 0 && <Divider indent="text" />}
                    <ListRow
                      icon="user"
                      title={link.person.name ?? link.person.email}
                      subtitle={link.person.phone ?? link.person.email}
                      variant="stacked"
                      chevron={false}
                    />
                    {/*
                      Which local person this account IS. Nothing else in the app
                      can answer "who wrote this" without it, so an unbound link is
                      a link that can never send you anything.

                      Offered, never guessed — matching on name would be a guess
                      about money, and a friend is a local record whose details are
                      yours to set.
                    */}
                    <View style={styles.shareRow}>
                      <View style={styles.shareText}>
                        <Text style={styles.shareLabel}>Who this is, in your people</Text>
                        <Text style={styles.shareHint}>
                          {boundName(link)
                            ? `${boundName(link)} — entries they add can reach you, subject to whether you trust them.`
                            : 'Not matched yet. Until you say who this is, nothing they add can reach you at all.'}
                        </Text>
                      </View>
                      <SecondaryButton
                        label={boundName(link) ? 'Change' : 'Match'}
                        size="sm"
                        onPress={() => setMatching(link)}
                        disabled={busy === link.id}
                      />
                    </View>

                    <View style={styles.shareRow}>
                      <View style={styles.shareText}>
                        <Text style={styles.shareLabel}>Show them my number</Text>
                        <Text style={styles.shareHint}>
                          {link.sharingMyPhone
                            ? 'Shared. Turning this off stops them seeing it from now on — it can’t take back a number they already have.'
                            : 'Off. They can’t see your number.'}
                        </Text>
                      </View>
                      <Switch
                        value={link.sharingMyPhone}
                        onValueChange={(v) => handleShareToggle(link, v)}
                        disabled={busy === link.id}
                        trackColor={{ false: colors.bgMuted, true: colors.accent }}
                        thumbColor={colors.onAccent}
                      />
                    </View>
                    <View style={styles.unlinkRow}>
                      <SecondaryButton
                        label="Unlink"
                        size="sm"
                        danger
                        icon="user-minus"
                        onPress={() => handleUnlink(link)}
                      />
                    </View>
                  </View>
                ))}
              </Card>
            )}

            <PrimaryButton
              label="Invite someone"
              onPress={handleInvite}
              loading={creating}
              style={styles.inviteCta}
            />
            <Text style={styles.hint}>
              A link connects you to someone so you can share a name and, if you choose, a
              number. No money crosses a link — your groups, balances and transactions stay
              exactly where they are.
            </Text>
            <Text style={styles.hint}>
              There's no search here on purpose: nobody can look you up by name, email or
              number. A link you send is the only way in.
            </Text>
          </>
        )}
      </ScrollView>

      <SheetModal visible={!!invite} onClose={() => setInvite(null)} title="Invite someone">
        {invite && (
          <>
            <View style={styles.qrWrap}>
              <QRCode value={invite.url} size={180} backgroundColor={colors.bgCard} color={colors.textPrimary} />
            </View>
            <Text style={styles.sheetHint}>
              Let them scan this, or send the link. It works once, expires{' '}
              {shortDate(new Date(invite.expiresAt))}, and you’ll be asked to confirm
              it’s them before anything links.
            </Text>
            <PrimaryButton
              label="Send link"
              onPress={() => Share.share({ message: `Link up with me on BudgetSplit: ${invite.url}` })}
            />
          </>
        )}
      </SheetModal>

      {/*
        Match a linked account to a local person.
        
        Two guards worth stating: an account can only be bound to ONE person (the
        partial unique index enforces it — two answers to "who wrote this" is
        failure F5 in a different place), and matching says *who they are*, never
        *that you trust them*. Trust stays a separate switch on their own screen.
      */}
      <SheetModal
        visible={!!matching}
        onClose={() => setMatching(null)}
        title={`Who is ${matching?.person.name ?? matching?.person.email ?? 'this'}?`}
      >
        <Text style={styles.hint}>
          Pick the person in your app this account belongs to. Until you do, nothing
          they add can reach you — the app has no way to know who wrote it.
        </Text>
        <Card>
          {people.map((person, i) => (
            <View key={person.id}>
              {i > 0 && <Divider indent="text" />}
              <ListRow
                icon="user"
                title={person.name}
                subtitle={
                  person.remote_uid === matching?.person.id ? 'Matched to this account'
                    : person.remote_uid ? 'Already matched to another account'
                    : undefined
                }
                // A person bound to a DIFFERENT account is not selectable — the
                // unique index would reject it anyway, and `ListRow` has no
                // disabled state, so withholding `onPress` IS the guard.
                onPress={
                  person.remote_uid && person.remote_uid !== matching?.person.id
                    ? undefined
                    : () => handleMatch(person)
                }
              />
            </View>
          ))}
        </Card>
        {boundName(matching ?? ({} as ServerLink)) && (
          <SecondaryButton
            label="Unmatch"
            danger
            onPress={() => handleMatch(null)}
            style={styles.unmatch}
          />
        )}
      </SheetModal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: layout.screenPaddingH, paddingBottom: space.xl },
  loading: { marginTop: space.xl },
  error: { ...type.body, color: colors.expense, textAlign: 'center', marginBottom: space.md },
  decideRow: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.md },
  decideBtn: { flex: 1 },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingBottom: space.sm },
  shareText: { flex: 1 },
  shareLabel: { ...type.body, color: colors.textPrimary },
  shareHint: { ...type.caption, color: colors.textMuted, lineHeight: 16, marginTop: 2 },
  unlinkRow: { paddingHorizontal: space.md, paddingBottom: space.md, alignItems: 'flex-start' },
  inviteCta: { marginTop: space.lg },
  hint: { ...type.caption, color: colors.textMuted, lineHeight: 18, textAlign: 'center', marginTop: space.sm },
  qrWrap: { alignItems: 'center', paddingVertical: space.md },
  unmatch: { marginTop: space.md },
  hint2: { marginBottom: space.sm },
  sheetHint: { ...type.caption, color: colors.textMuted, lineHeight: 18, marginBottom: space.md, textAlign: 'center' },
});
