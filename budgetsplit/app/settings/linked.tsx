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
  const [busy, setBusy] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ url: string; expiresAt: number } | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextLinks, nextClaims] = await Promise.all([listLinks(), listPendingClaims()]);
      setLinks(nextLinks);
      setClaims(nextClaims);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your linked people.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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
  sheetHint: { ...type.caption, color: colors.textMuted, lineHeight: 18, marginBottom: space.md, textAlign: 'center' },
});
