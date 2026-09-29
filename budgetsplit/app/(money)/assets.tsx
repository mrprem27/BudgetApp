import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, type, space, layout, radius } from '../../src/theme';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { Card } from '../../src/components/ui/Card';
import { Divider } from '../../src/components/ui/Divider';
import { ListRow } from '../../src/components/ui/ListRow';
import { IconCircle } from '../../src/components/ui/IconCircle';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { SecondaryButton } from '../../src/components/ui/SecondaryButton';
import { AppRefreshControl } from '../../src/components/ui/AppRefreshControl';
import { AssetSheet, type AssetSheetMode } from '../../src/components/finance/plan/AssetSheet';
import { MoveMoneySheet } from '../../src/components/finance/plan/MoveMoneySheet';
import { useAssets } from '../../src/hooks/useAssets';
import { useContentInset } from '../../src/hooks/useContentInset';
import { formatRupees, formatCompact } from '../../src/lib/money';
import { backOr } from '../../src/lib/nav';
import { ASSET_KIND_ICON, ASSET_KIND_LABEL } from '../../src/constants/assets';
import type { Asset, MoveEndpoint } from '../../src/db/queries/assets';

const BANK: MoveEndpoint = { kind: 'bucket', bucket: 'bank' };

/**
 * The asset register: what you own that isn't cash.
 *
 * This is where "money left my account but I didn't spend it" finally has an
 * answer. Before it, that money went into one number called investments, so an
 * SIP, a gold purchase and a flat were the same row — and the only way to change
 * it was to retype the total, which is why buying an investment was logged as an
 * expense and dropped net worth by the amount invested.
 *
 * **What is out here is what you do often.** A row is its name and worth, tap to open
 * it, plus one shortcut — `Move`, which is Add and Take out and switching between
 * assets in a single form (`MoveMoneySheet`). What you do rarely — restate its worth,
 * rename it, stop counting it — lives inside the asset's own page. It used to be four
 * buttons under every row.
 */
export default function AssetsScreen() {
  const router = useRouter();
  const bottomPad = useContentInset();
  const a = useAssets();
  const [sheet, setSheet] = useState<{ mode: AssetSheetMode; asset?: Asset } | null>(null);
  const [move, setMove] = useState<{ from: MoveEndpoint; to: MoveEndpoint } | null>(null);
  // Money in is the common case, so a row's Move opens as bank → this asset (⇅ flips it).
  const moveInto = (asset: Asset) => setMove({ from: { kind: 'bucket', bucket: 'bank' }, to: { kind: 'asset', id: asset.id } });

  function renderAsset(asset: Asset, i: number, list: Asset[]) {
    return (
      <View key={asset.id}>
        {i > 0 && <Divider indent="text" />}
        <ListRow
          variant="stacked"
          leading={
            <IconCircle
              icon={ASSET_KIND_ICON[asset.kind]}
              size={layout.avatarSize}
              color={asset.color ?? colors.accent}
            />
          }
          title={asset.name}
          subtitle={ASSET_KIND_LABEL[asset.kind]}
          value={<Text style={styles.balance}>{formatRupees(asset.balance)}</Text>}
          // Tap opens the asset; the pencil-shaped action is Edit in the row's
          // own action strip below. Tapping a row that shows a balance and going
          // to a FORM was the register's only door, so the movements behind that
          // balance were unreachable.
          onPress={() => router.push(`/asset/${asset.id}`)}
          accessibilityLabel={`${asset.name}, ${formatRupees(asset.balance)}`}
        />
        <View style={styles.actionRow}>
          <SecondaryButton label="Move" icon="repeat" size="sm" onPress={() => moveInto(asset)} style={styles.actionBtn} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Assets"
        onBack={() => backOr(router, '/(tabs)/savings')}
        right={
          <TouchableOpacity
            onPress={() => setSheet({ mode: 'create' })}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Add an asset"
          >
            <Text style={styles.headerAction}>Add</Text>
          </TouchableOpacity>
        }
      />

      {a.error ? (
        <ErrorState onRetry={a.reload} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad }]}
          refreshControl={<AppRefreshControl refreshing={a.refreshing} onRefresh={a.onRefresh} />}
        >
          {a.loading ? (
            <>
              <SkeletonCard height={110} />
              <SkeletonCard height={160} />
            </>
          ) : (
            <>
              <Card padded style={styles.hero}>
                <Text style={styles.heroLabel}>WORTH, ACROSS YOUR ASSETS</Text>
                <Text style={styles.heroAmount}>{formatCompact(a.total)}</Text>
                <Text style={styles.heroHint}>
                  Counted in your net worth, never in what you can spend — these aren’t cash.
                </Text>
              </Card>

              {a.assets.length > 0 && (
                <SecondaryButton
                  label="Move money"
                  icon="repeat"
                  onPress={() => setMove({ from: { kind: 'bucket', bucket: 'bank' }, to: { kind: 'asset', id: a.assets[0].id } })}
                />
              )}

              {a.assets.length === 0 ? (
                <EmptyState
                  icon="package"
                  title="Nothing here yet"
                  body="Gold, a flat, an FD, a fund. Name what you own and moving money in or out becomes a transfer — your net worth stays where it is."
                  actionLabel="Add an asset"
                  onAction={() => setSheet({ mode: 'create' })}
                />
              ) : (
                <Card clip>{a.assets.map(renderAsset)}</Card>
              )}

              {a.archived.length > 0 && (
                <>
                  <SectionHeader title="No longer counted" />
                  <Card clip>
                    {a.archived.map((asset, i) => (
                      <View key={asset.id}>
                        {i > 0 && <Divider indent="text" />}
                        <ListRow
                          leading={<IconCircle icon={ASSET_KIND_ICON[asset.kind]} size={layout.avatarSize} color={colors.textMuted} />}
                          title={asset.name}
                          subtitle={`${formatRupees(asset.balance)} · not in your net worth`}
                          onPress={() => { void a.unarchive(asset.id); }}
                          accessibilityLabel={`Count ${asset.name} again`}
                        />
                      </View>
                    ))}
                  </Card>
                  <Text style={styles.foot}>Tap one to start counting it again.</Text>
                </>
              )}

            </>
          )}
        </ScrollView>
      )}

      <AssetSheet
        state={sheet}
        busy={a.busy}
        onClose={() => setSheet(null)}
        onCreate={async (input) => { if (await a.create(input)) setSheet(null); }}
        onRename={async (id, patch) => { if (await a.rename(id, patch)) setSheet(null); }}
        onRestate={async (id, paise) => { if (await a.restate(id, paise)) setSheet(null); }}
        onArchive={async (asset) => { if (await a.archive(asset)) setSheet(null); }}
        onDelete={async (asset) => { if (await a.remove(asset)) setSheet(null); }}
      />

      <MoveMoneySheet
        visible={!!move}
        onClose={() => setMove(null)}
        assets={a.assets}
        from={move?.from ?? BANK}
        to={move?.to ?? BANK}
        busy={a.busy}
        onMove={async (from, to, paise) => { if (await a.move(from, to, paise)) setMove(null); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.md },
  headerAction: { ...type.button, color: colors.accent },
  hero: { alignItems: 'center', gap: space.xs },
  heroLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  heroAmount: { fontFamily: 'SpaceMono_400Regular', fontSize: 32, letterSpacing: -1, color: colors.textPrimary },
  heroHint: { ...type.caption, color: colors.textSecondary, textAlign: 'center' },
  balance: { fontFamily: 'SpaceMono_400Regular', fontSize: 15, color: colors.textPrimary },
  actionRow: { flexDirection: 'row', paddingHorizontal: space.md, paddingBottom: space.md },
  actionBtn: { alignSelf: 'flex-start' },
  foot: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: -space.sm },
});
