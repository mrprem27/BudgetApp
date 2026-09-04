import React, { useCallback } from 'react';
import { View, Text, StyleSheet, SectionList } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, type, space, layout } from '../../src/theme';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { AppRefreshControl } from '../../src/components/ui/AppRefreshControl';
import { IconCircle } from '../../src/components/ui/IconCircle';
import { TransactionRow } from '../../src/components/finance/TransactionRow';
import { TxnCell } from '../../src/components/finance/TxnCell';
import { useScreenData } from '../../src/hooks/useScreenData';
import { useContentInset } from '../../src/hooks/useContentInset';
import { getAssetById } from '../../src/db/queries/assets';
import { getTransactionsForAsset } from '../../src/db/queries/transactions';
import { getMe } from '../../src/db/queries/persons';
import { groupByDate } from '../../src/lib/txnGrouping';
import { formatRupees } from '../../src/lib/money';
import { ASSET_KIND_LABEL, ASSET_KIND_ICON } from '../../src/constants/assets';
import { backOr } from '../../src/lib/nav';
import type { TxnWithSplits } from '../../src/db/queries/transactions';

/**
 * One asset, and the movements that built its balance.
 *
 * ## Why this screen exists
 *
 * It was the missing half of the Invest pill. `OV-30` gave the app a way to record
 * money going into something you own; this is the only place it is presented *as*
 * that. Before it, the register showed a balance with **no path back to the rows
 * that made it** — `assets.ts`'s only reader of `asset_id` was `deleteAsset`'s
 * refusal check, and tapping an asset opened its edit sheet.
 *
 * The same shape as every other ledger: `TxnCell` + `TransactionRow` +
 * `groupByDate`, sections not sticky. The rows read correctly here for the same
 * reason they read correctly everywhere else — `settlementView` decides what an
 * asset movement looks like, once (`P8a`).
 *
 * The asset's own name is passed into the rows, because no loader joins `asset`
 * and the name otherwise survives only as a default note that a user-written note
 * erases.
 */
export default function AssetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const bottomPad = useContentInset();

  const { data, loading, error, refreshing, onRefresh, reload } = useScreenData(async (db) => {
    const [asset, txns, me] = await Promise.all([
      getAssetById(db, id),
      getTransactionsForAsset(db, id),
      getMe(db),
    ]);
    return { asset, txns, myId: me?.id ?? '' };
  }, [id]);

  const asset = data?.asset ?? null;
  const txns = data?.txns ?? [];
  const myId = data?.myId ?? '';
  const sections = groupByDate(txns);
  // One entry, so the row can name its destination without a lookup per row.
  const assetNames = asset ? { [asset.id]: asset.name } : {};

  const renderSectionHeader = useCallback(
    ({ section }: { section: { title: string } }) => <SectionHeader title={section.title} />,
    [],
  );

  const renderItem = useCallback(
    ({ item, index, section }: { item: TxnWithSplits; index: number; section: { data: TxnWithSplits[] } }) => (
      <TxnCell first={index === 0} last={index === section.data.length - 1}>
        <TransactionRow
          txn={item}
          myId={myId}
          isPersonal
          assetNames={assetNames}
          onPress={() => router.push(`/txn/${item.id}`)}
        />
      </TxnCell>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myId, asset?.id, asset?.name],
  );

  if (error) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Asset" onBack={() => backOr(router, '/assets')} />
        <ErrorState onRetry={() => reload()} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={asset?.name ?? 'Asset'} onBack={() => backOr(router, '/assets')} />

      <SectionList
        sections={sections}
        keyExtractor={t => t.id}
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad }]}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        // These headers have no background, so a stuck one sits transparently over
        // the rows scrolling under it — the rule every other ledger follows.
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          asset ? (
            <View style={styles.hero}>
              <IconCircle
                icon={ASSET_KIND_ICON[asset.kind]}
                size={56}
                color={asset.color ?? colors.accent}
                iconSize={24}
              />
              <Text style={styles.balance}>{formatRupees(asset.balance)}</Text>
              <Text style={styles.kind}>
                {ASSET_KIND_LABEL[asset.kind]}
                {txns.length > 0 && ` · ${txns.length} ${txns.length === 1 ? 'movement' : 'movements'}`}
              </Text>
            </View>
          ) : null
        }
        renderSectionHeader={renderSectionHeader}
        renderItem={renderItem}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon="trending-up"
              title="Nothing moved yet"
              // No CTA: the actions belong to the register, which is one tap back
              // and owns both halves of a movement. Offering "Add to this" here
              // would be a second door to a write this screen does not perform.
              body={asset
                ? `${asset.name} is worth ${formatRupees(asset.balance)}. Add to it or take from it in Plan → Assets, and every movement shows up here.`
                : 'This asset no longer exists.'}
              tint={colors.textSecondary}
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  // `padding`, not `paddingHorizontal` — AGENTS §2: that one word is what made the
  // same empty state sit at two different heights on two tabs of one screen.
  scroll: { padding: layout.screenPaddingH },
  hero: { alignItems: 'center', gap: space.sm, paddingVertical: space.lg },
  balance: { ...type.amountXL, color: colors.textPrimary },
  kind: { ...type.caption, color: colors.textMuted },
});
