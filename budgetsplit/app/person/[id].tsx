import React, { useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, SectionList } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, type, space, layout } from '../../src/theme';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { PrimaryButton } from '../../src/components/ui/PrimaryButton';
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const bottomPad = useContentInset({});
  const {
    me, person, activity, sections, net, scopes, rhythm,
    receivableState, suggestWriteOff, toggleWrittenOff,
    trustState, trustIsLive, trustApplies, toggleTrusted,
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

              {(net > 0 || receivableState === 'written_off') && (
                <SecondaryButton
                  label={receivableState === 'written_off' ? 'Count it again' : 'Write it off'}
                  size="sm"
                  onPress={toggleWrittenOff}
                  style={styles.writeOffBtn}
                />
              )}

              {/*
                Trust is about what they can do to your numbers, not about the
                balance — so it shows whatever the balance is. The hint is honest
                about whether it can do anything yet: with no account there is no
                write path, and saying "protected" would be theatre.
              */}
              <SecondaryButton
                label={trustState === 'trusted' ? `Review ${name}'s entries` : `Trust ${name}`}
                size="sm"
                onPress={toggleTrusted}
                style={styles.trustBtn}
              />
              <Text style={styles.trustHint}>
                {!trustIsLive
                  ? `${name} has no linked account, so nothing can be added on their behalf yet.`
                  : trustApplies
                    ? 'Their entries count straight away, in every group you share.'
                    : 'Their entries wait for your approval before touching your numbers.'}
              </Text>

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
  trustHint: { ...type.caption, color: colors.textMuted, marginTop: space.xs, textAlign: 'center' },
  settle: { alignSelf: 'stretch', marginTop: space.md },
});
