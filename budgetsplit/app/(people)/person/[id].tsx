import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, SectionList } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, type, space, layout } from '../../../src/theme';
import { Card } from '../../../src/components/ui/Card';
import { ListRow } from '../../../src/components/ui/ListRow';
import { Divider } from '../../../src/components/ui/Divider';
import { IconCircle } from '../../../src/components/ui/IconCircle';
import { TrustSheet } from '../../../src/components/finance/TrustSheet';
import { CombineSameSheet } from '../../../src/components/finance/CombineSameSheet';
import { trustStateLabel, groupTrustLabel, trustInert } from '../../../src/lib/trustCopy';
import { ScreenHeader } from '../../../src/components/ui/ScreenHeader';
import { HeaderIconButton } from '../../../src/components/ui/HeaderIconButton';
import { PersonNameSheet } from '../../../src/components/finance/PersonNameSheet';
import { usePersonEdit } from '../../../src/hooks/usePersonEdit';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { SectionHeader } from '../../../src/components/ui/SectionHeader';
import { PrimaryButton } from '../../../src/components/ui/PrimaryButton';
import { canRemind } from '../../../src/lib/whatsappReminder';
import { useReminder } from '../../../src/hooks/useReminder';
import { SecondaryButton } from '../../../src/components/ui/SecondaryButton';
import { AppRefreshControl } from '../../../src/components/ui/AppRefreshControl';
import { AmountText } from '../../../src/components/ui/AmountText';
import { MemberAvatar } from '../../../src/components/finance/MemberAvatar';
import { TransactionRow } from '../../../src/components/finance/TransactionRow';
import { TxnCell } from '../../../src/components/finance/TxnCell';
import { usePersonScreen } from '../../../src/hooks/usePersonScreen';
import { useGroupTxnActions } from '../../../src/hooks/useGroupTxnActions';
import { useContentInset } from '../../../src/hooks/useContentInset';
import { oweView } from '../../../src/lib/owe';
import { formatCompact } from '../../../src/lib/money';
import type { MyActivityItem } from '../../../src/db/queries/transactions';
import { backOr } from '../../../src/lib/nav';

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
  const [combineSheet, setCombineSheet] = useState(false);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const bottomPad = useContentInset({});
  const {
    me, person, sections, net, scopes, rhythm,
    receivableState, suggestWriteOff, toggleWrittenOff, syncNote,
    trustState, trustIsLive, toggleTrusted,
    sharedGroups, groupTrust, setGroupTrustFor, canCombine,
    loading, error, refreshing, onRefresh, reload,
  } = usePersonScreen(id ?? '');

  // Rows span every shared group, so the actions read the owning group off each txn.
  const { handleDelete, handleEditTxn } = useGroupTxnActions(reload);
  const edit = usePersonEdit({ onRemoved: () => backOr(router, '/friends') });
  const remind = useReminder();

  useEffect(() => { if (!id) backOr(router, '/(tabs)'); }, [id, router]);

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

  const sendReminder = () => person && remind(person, net, scopes?.groups?.map(g => ({ name: g.name, amount: g.amount })));
  const showRemind = canRemind(net, person?.mobile);
  const personTrust = trustState === 'trusted' ? 'trusted' : 'review';

  // Everything you can change about this person, as rows of one card.
  const options: { key: string; node: React.ReactNode }[] = [];
  if (trustIsLive) {
    options.push({ key: 'trust', node: (
      <ListRow
        leading={<IconCircle icon="shield" size={layout.iconCircle} color={colors.accent} />}
        title="Their entries"
        value={trustStateLabel(personTrust)}
        onPress={() => setTrustSheet({ groupId: null })}
        accessibilityLabel={`Their entries: ${trustStateLabel(personTrust)}. Change`}
      />
    ) });
    // Shown whenever an exception EXISTS, not only when the old gate
    // (`sharedGroups.length > 1`) allowed it. A stored override used to survive with no
    // control able to reach it — §13 calls that a one-way door.
    if (sharedGroups.length > 1 || groupTrust.size > 0) {
      for (const g of sharedGroups) {
        options.push({ key: g.id, node: (
          <ListRow
            variant="stacked"
            // The shared-groups list carries id/name/archived only, so one neutral
            // glyph rather than re-querying every group for its icon.
            leading={<IconCircle icon="users" size={layout.iconCircle} color={colors.accent} />}
            title={g.is_archived === 1 ? `${g.name} · Archived` : g.name}
            value={groupTrustLabel((groupTrust.get(g.id) as 'trusted' | 'review' | undefined) ?? null, personTrust)}
            onPress={() => setTrustSheet({ groupId: g.id })}
            accessibilityLabel={`${g.name}. Change what happens to ${name}'s entries here`}
          />
        ) });
      }
    }
  }
  if (net > 0 || receivableState === 'written_off') {
    const off = receivableState === 'written_off';
    options.push({ key: 'writeOff', node: (
      <ListRow
        leading={<IconCircle icon={off ? 'rotate-ccw' : 'slash'} size={layout.iconCircle} color={colors.accent} />}
        title={off ? 'Count it again' : 'Write it off'}
        subtitle={off ? 'Expect this money back after all' : 'Stop expecting this money back'}
        chevron={false}
        onPress={toggleWrittenOff}
      />
    ) });
  }
  // A duplicate placeholder for the same human, folded by hand (`DQ-94` part 2). Shown only
  // when there is somebody eligible to fold in — `usePersonScreen`'s `canCombine` runs the
  // same check `combinePeople` would, so this never offers a pair it would refuse.
  if (canCombine) {
    options.push({ key: 'combine', node: (
      <ListRow
        leading={<IconCircle icon="copy" size={layout.iconCircle} color={colors.accent} />}
        title="Same person as…"
        onPress={() => setCombineSheet(true)}
        accessibilityLabel={`Combine ${name} with another entry for the same person`}
      />
    ) });
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={name}
        onBack={() => backOr(router, '/(tabs)')}
        right={person ? <HeaderIconButton icon="edit-2" label="Edit details" onPress={() => edit.open(person)} /> : undefined}
      />

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
              {/*
                One card for where you two stand, like a group's header card: who and how much
                on one row, what explains it under that, and the two things you can do about it
                side by side at the bottom. It was a centred column of text with the buttons
                scattered between settings (`U-79`).
              */}
              <Card padded style={styles.balCard}>
                <View style={styles.balRow}>
                  <MemberAvatar name={name} color={person?.avatar_color ?? colors.accent} size={48} imageUri={person?.image_uri} />
                  <View style={styles.balBody}>
                    <Text style={[styles.balLabel, { color: ov.color }]}>{ov.withName(name)}</Text>
                    <AmountText paise={ov.amount} size="xl" forceColor={ov.color} compact zeroDash />
                  </View>
                </View>

                {/* Where the net came from. `FriendBalance` only carries the total, so a
                    balance spanning three groups was a number with no explanation. */}
                {(scopes?.groups.length ?? 0) > 1 && (
                  <Text style={styles.note} numberOfLines={2}>
                    {scopes!.groups.map(g => `${g.name} ${formatCompact(g.amount)}`).join(' · ')}
                  </Text>
                )}

                {!!rhythm && <Text style={styles.note}>{rhythm}</Text>}

                {/* Written off is not settled: the balance above is unchanged and still
                    shown. It has only stopped counting as money you can rely on. */}
                {receivableState === 'written_off' && (
                  <Text style={styles.note}>Written off, not counted as money coming back</Text>
                )}

                {/* Suggest, never downgrade. Judged against this person's own rhythm,
                    so a quarterly settler isn't nagged at forty days. */}
                {suggestWriteOff && (
                  <Text style={styles.stale}>Quiet for longer than usual, still expecting this back?</Text>
                )}

                {/*
                  What is waiting to reach them, and why.

                  Never "not synced" — the entries ARE recorded and already count in
                  every figure on this screen. What is unresolved is the other
                  person, and that is what this says.
                */}
                {syncNote && <Text style={styles.stale}>{syncNote}</Text>}

                {(net !== 0 || showRemind) && (
                  <View style={styles.actions}>
                    {net !== 0 && (
                      <PrimaryButton
                        label="Settle up"
                        onPress={() => router.push(`/add/quick?kind=transfer&to=${id}`)}
                        style={styles.action}
                      />
                    )}
                    {/* Only when they owe YOU and we have a number. `canRemind` owns
                        both halves of that — nudging someone about money you owe them
                        is an apology, not a reminder. */}
                    {showRemind && (
                      <SecondaryButton label="Remind" icon="message-circle" onPress={sendReminder} style={styles.action} />
                    )}
                  </View>
                )}
              </Card>

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
                setting it excepts. Write-off and "same person" are rows of the same
                card, so everything you can change about this person is in one place.
              */}
              {options.length > 0 && (
                <Card>
                  {options.map((row, i) => (
                    <React.Fragment key={row.key}>
                      {i > 0 && <Divider indent="text" />}
                      {row.node}
                    </React.Fragment>
                  ))}
                </Card>
              )}
              {/* No account, no write path, so the control would do nothing. Say why
                  rather than render a row that cannot act. */}
              {!trustIsLive && <Text style={styles.trustHint}>{trustInert(name)}</Text>}
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
          : personTrust}
        inherited={personTrust}
        onChoose={(next) => {
          // Person-level has no null: one of the two answers is always in force.
          if (trustSheet?.groupId) setGroupTrustFor(trustSheet.groupId, next);
          else if (next !== null && next !== trustState) toggleTrusted();
        }}
      />
      <CombineSameSheet
        visible={combineSheet}
        onClose={() => setCombineSheet(false)}
        personId={id}
        personName={name}
      />
      <PersonNameSheet {...edit.sheetProps} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: layout.screenPaddingH },
  head: { gap: space.md, paddingBottom: space.sm },
  balCard: { gap: space.xs },
  balRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.xs },
  balBody: { flex: 1, minWidth: 0 },
  balLabel: { ...type.label },
  note: { ...type.caption, color: colors.textSecondary },
  stale: { ...type.caption, color: colors.healthAmber },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  action: { flex: 1 },
  trustHint: { ...type.caption, color: colors.textMuted },
});
