import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, SectionList, Linking, Share, Alert, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, type, space, layout } from '../../src/theme';
import { Card } from '../../src/components/ui/Card';
import { ListRow } from '../../src/components/ui/ListRow';
import { Divider } from '../../src/components/ui/Divider';
import { IconCircle } from '../../src/components/ui/IconCircle';
import { TrustSheet } from '../../src/components/finance/TrustSheet';
import { trustStateLabel, groupTrustLabel, trustInert } from '../../src/lib/trustCopy';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { PrimaryButton } from '../../src/components/ui/PrimaryButton';
import { canRemind, reminderText, whatsappUrl } from '../../src/lib/whatsappReminder';
import { buildUpiRequestUri } from '../../src/lib/upiIntent';
import { haptic } from '../../src/lib/haptics';
import { SecondaryButton } from '../../src/components/ui/SecondaryButton';
import { AppRefreshControl } from '../../src/components/ui/AppRefreshControl';
import { AmountText } from '../../src/components/ui/AmountText';
import { MemberAvatar } from '../../src/components/finance/MemberAvatar';
import { TransactionRow } from '../../src/components/finance/TransactionRow';
import { TxnCell } from '../../src/components/finance/TxnCell';
import { usePersonScreen } from '../../src/hooks/usePersonScreen';
import { useGroupTxnActions } from '../../src/hooks/useGroupTxnActions';
import { useContentInset } from '../../src/hooks/useContentInset';
import { oweView } from '../../src/lib/owe';
import { formatCompact } from '../../src/lib/money';
import type { MyActivityItem } from '../../src/db/queries/transactions';

/**
 * One person, everything you two have shared.
 *
 * Tapping a friend used to open a rename field or jump straight to Settle — there
 * was nowhere to see *why* you owe what you owe. This is that: the net, where it
 * came from group by group, and every transaction you are both on.
 */
export default function PersonScreen() {
  /** Which trust choice is open: the person-level one, or one group's exception. */
  const [trustSheet, setTrustSheet] = useState<{ groupId: string | null } | null>(null);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const bottomPad = useContentInset({});
  const {
    me, person, activity, sections, net, scopes, rhythm,
    receivableState, suggestWriteOff, toggleWrittenOff, syncNote,
    trustState, trustIsLive, trustApplies, toggleTrusted,
    sharedGroups, groupTrust, setGroupTrustFor,
    loading, error, refreshing, onRefresh, reload,
  } = usePersonScreen(id ?? '');

  // Rows span every shared group, so the actions read the owning group off each txn.
  const { handleDelete, handleEditTxn } = useGroupTxnActions(null, reload);

  useEffect(() => { if (!id) router.back(); }, [id, router]);

  const renderSectionHeader = useCallback(
    ({ section }: { section: { title: string } }) => <SectionHeader title={section.title} />,
    [],
  );
  const renderItem = useCallback(
    ({ item, index, section }: { item: MyActivityItem; index: number; section: { data: MyActivityItem[] } }) => (
      <TxnCell first={index === 0} last={index === section.data.length - 1}>
        <TransactionRow
          txn={item}
          myId={me?.id ?? ''}
          groupName={item.groupName}
          onPress={() => handleEditTxn(item)}
          onDelete={() => handleDelete(item.id)}
        />
      </TxnCell>
    ),
    [me?.id, handleEditTxn, handleDelete],
  );

  if (!id) return null;

  const ov = oweView(net);
  const name = person?.name ?? 'Person';

  /**
   * Opens WhatsApp with the message pre-written. Falls back to the share sheet
   * when the stored number has no country code — losing the reminder entirely
   * over that would be worse than letting the user pick the app.
   */
  async function sendReminder() {
    if (!person?.mobile) return;
    const text = reminderText({
      name: person.name,
      amountPaise: net,
      groups: scopes?.groups?.map(g => ({ name: g.name, amount: g.amount })),
      payLink: me?.upi_vpa ? buildUpiRequestUri(me.upi_vpa, me.name, net) : null,
    });
    const url = whatsappUrl(person.mobile, text);
    try {
      if (url && await Linking.canOpenURL(url)) await Linking.openURL(url);
      else await Share.share({ message: text });
    } catch {
      haptic.error();
      Alert.alert('Could not open WhatsApp', 'You can copy the message and send it yourself.');
    }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={name} onBack={() => router.back()} />

      {error ? (
        <ErrorState onRetry={reload} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={t => t.id}
          contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
          refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={renderSectionHeader}
          renderItem={renderItem}
          ListHeaderComponent={
            <View style={styles.head}>
              <MemberAvatar name={name} color={person?.avatar_color ?? colors.accent} size={56} imageUri={person?.image_uri} />
              <Text style={[styles.balLabel, { color: ov.color }]}>{ov.withName(name)}</Text>
              <AmountText paise={ov.amount} size="xl" forceColor={ov.color} compact zeroDash />

              {/* Where the net came from. `FriendBalance` only carries the total, so a
                  balance spanning three groups was a number with no explanation. */}
              {(scopes?.groups.length ?? 0) > 1 && (
                <Text style={styles.scopeLine} numberOfLines={2}>
                  {scopes!.groups.map(g => `${g.name} ${formatCompact(g.amount)}`).join(' · ')}
                </Text>
              )}

              {!!rhythm && <Text style={styles.rhythm}>{rhythm}</Text>}

              {/* Written off is not settled: the balance above is unchanged and still
                  shown. It has only stopped counting as money you can rely on. */}
              {receivableState === 'written_off' && (
                <Text style={styles.writtenOff}>Written off — not counted as money coming back</Text>
              )}

              {/* Suggest, never downgrade. Judged against this person's own rhythm,
                  so a quarterly settler isn't nagged at forty days. */}
              {suggestWriteOff && (
                <Text style={styles.stale}>Quiet for longer than usual — still expecting this back?</Text>
              )}

              {/*
                What is waiting to reach them, and why.

                Never "not synced" — the entries ARE recorded and already count in
                every figure on this screen. What is unresolved is the other
                person, and that is what this says.
              */}
              {syncNote && <Text style={styles.stale}>{syncNote}</Text>}

              {(net > 0 || receivableState === 'written_off') && (
                <SecondaryButton
                  label={receivableState === 'written_off' ? 'Count it again' : 'Write it off'}
                  size="sm"
                  onPress={toggleWrittenOff}
                  style={styles.writeOffBtn}
                />
              )}

              {/*
                Trust is a SETTING WITH A STATE, not an imperative.

                This was a full-width `Trust {name}` button — an action label — sat
                above rows reading `Counts straight away`, which are state labels,
                all of them accent-coloured, full-width and floating bare on the
                background. One told you what would happen if you tapped; the others
                told you what was already true, and nothing distinguished them.

                Now it is a Card of ListRows (§3/§4): each shows its current value
                and opens a sheet listing every option. The per-group rows sit under
                the same roof because an exception is the same kind of thing as the
                setting it excepts.
              */}
              {trustIsLive ? (
                <Card style={styles.trustCard}>
                  <ListRow
                    leading={<IconCircle icon="shield" size={layout.iconCircle} color={colors.accent} />}
                    title="Their entries"
                    value={trustStateLabel(trustState === 'trusted' ? 'trusted' : 'review')}
                    onPress={() => setTrustSheet({ groupId: null })}
                    accessibilityLabel={`Their entries: ${trustStateLabel(trustState === 'trusted' ? 'trusted' : 'review')}. Change`}
                  />
                  {/*
                    Shown whenever an exception EXISTS, not only when the old gate
                    (`sharedGroups.length > 1`) allowed it. A stored override used to
                    survive with no control able to reach it — §13 calls that a
                    one-way door.
                  */}
                  {(sharedGroups.length > 1 || groupTrust.size > 0) && sharedGroups.map(g => (
                    <React.Fragment key={g.id}>
                      <Divider indent="text" />
                      <ListRow
                        variant="stacked"
                        // The shared-groups list carries id/name/archived only, so one neutral
                        // glyph rather than re-querying every group for its icon.
                        leading={<IconCircle icon="users" size={layout.iconCircle} color={colors.accent} />}
                        title={g.is_archived === 1 ? `${g.name} · Archived` : g.name}
                        value={groupTrustLabel(
                          (groupTrust.get(g.id) as 'trusted' | 'review' | undefined) ?? null,
                          trustState === 'trusted' ? 'trusted' : 'review',
                        )}
                        onPress={() => setTrustSheet({ groupId: g.id })}
                        accessibilityLabel={`${g.name}. Change what happens to ${name}'s entries here`}
                      />
                    </React.Fragment>
                  ))}
                </Card>
              ) : (
                // No account, no write path, so the control would do nothing. Say
                // why rather than render a full-width button that cannot act.
                <Text style={styles.trustHint}>{trustInert(name)}</Text>
              )}

              {/* Only when they owe YOU and we have a number. `canRemind` owns
                  both halves of that — nudging someone about money you owe them
                  is an apology, not a reminder. */}
              {canRemind(net, person?.mobile) && (
                <SecondaryButton
                  label="Remind on WhatsApp"
                  icon="message-circle"
                  onPress={sendReminder}
                  style={styles.settle}
                />
              )}

              {net !== 0 && (
                <PrimaryButton
                  label="Settle up"
                  onPress={() => router.push(`/add/quick?kind=transfer&to=${id}`)}
                  style={styles.settle}
                />
              )}
            </View>
          }
          ListEmptyComponent={
            loading ? null : (
              <EmptyState
                icon="users"
                title={`Nothing shared with ${name} yet`}
                body="Expenses you split with them, and settlements either way, show up here."
                actionLabel="Add an expense"
                onAction={() => router.push('/add/quick?kind=expense')}
              />
            )
          }
        />
      )}
      <TrustSheet
        visible={!!trustSheet}
        onClose={() => setTrustSheet(null)}
        name={name}
        scope={trustSheet?.groupId ? (sharedGroups.find(g => g.id === trustSheet.groupId)?.name ?? null) : null}
        value={trustSheet?.groupId
          ? ((groupTrust.get(trustSheet.groupId) as 'trusted' | 'review' | undefined) ?? null)
          : (trustState === 'trusted' ? 'trusted' : 'review')}
        inherited={trustState === 'trusted' ? 'trusted' : 'review'}
        onChoose={(next) => {
          // Person-level has no null: one of the two answers is always in force.
          if (trustSheet?.groupId) setGroupTrustFor(trustSheet.groupId, next);
          else if (next !== null && next !== trustState) toggleTrusted();
        }}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: layout.screenPaddingH },
  head: { alignItems: 'center', gap: space.xs, paddingBottom: space.lg },
  balLabel: { ...type.label, marginTop: space.sm },
  scopeLine: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.xs },
  rhythm: { ...type.caption, color: colors.textSecondary, marginTop: space.xs },
  writtenOff: { ...type.caption, color: colors.textMuted, marginTop: space.xs, textAlign: 'center' },
  stale: { ...type.caption, color: colors.healthAmber, marginTop: space.xs, textAlign: 'center' },
  writeOffBtn: { marginTop: space.sm },
  trustBtn: { marginTop: space.md },
  trustCard: { marginTop: space.md, alignSelf: 'stretch' },
  trustHint: { ...type.caption, color: colors.textMuted, marginTop: space.xs, textAlign: 'center' },
  groupTrust: { marginTop: space.md, alignSelf: 'stretch' },
  groupTrustLabel: { ...type.sectionLabel, color: colors.textSecondary, marginBottom: space.sm },
  groupTrustRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: space.sm, minHeight: layout.touchMin, paddingVertical: space.xs,
  },
  groupTrustName: { ...type.body, color: colors.textPrimary, flexShrink: 1 },
  groupTrustValue: { ...type.labelSemi, color: colors.accent },
  groupTrustInherit: { color: colors.textMuted },
  settle: { alignSelf: 'stretch', marginTop: space.md },
});
