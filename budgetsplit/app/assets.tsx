import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, type, space, layout, radius } from '../src/theme';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { Card } from '../src/components/ui/Card';
import { Divider } from '../src/components/ui/Divider';
import { ListRow } from '../src/components/ui/ListRow';
import { IconCircle } from '../src/components/ui/IconCircle';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ErrorState } from '../src/components/ui/ErrorState';
import { SectionHeader } from '../src/components/ui/SectionHeader';
import { SkeletonCard } from '../src/components/ui/Skeleton';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { SecondaryButton } from '../src/components/ui/SecondaryButton';
import { AppRefreshControl } from '../src/components/ui/AppRefreshControl';
import { AssetSheet, type AssetSheetMode } from '../src/components/finance/plan/AssetSheet';
import { useAssets } from '../src/hooks/useAssets';
import { useContentInset } from '../src/hooks/useContentInset';
import { formatRupees, formatCompact } from '../src/lib/money';
import { backOr } from '../src/lib/nav';
import { ASSET_KIND_ICON, ASSET_KIND_LABEL } from '../src/constants/assets';
import type { Asset } from '../src/db/queries/assets';

/**
 * The asset register: what you own that isn't cash.
 *
 * This is where "money left my account but I didn't spend it" finally has an
 * answer. Before it, that money went into one number called investments, so an
 * SIP, a gold purchase and a flat were the same row — and the only way to change
 * it was to retype the total, which is why buying an investment was logged as an
 * expense and dropped net worth by the amount invested.
 *
 * Three actions per asset, and they are three different things on purpose:
 * **Add** and **Take out** are transfers (cash moves, net worth does not), while
 * **worth now** is a market move (net worth changes, no cash moves). Collapsing
 * them would mean either inventing cash movement for a price change or losing the
 * record of an actual purchase.
 */
export default function AssetsScreen() {
  const router = useRouter();
  const bottomPad = useContentInset();
  const a = useAssets();
  const [sheet, setSheet] = useState<{ mode: AssetSheetMode; asset?: Asset } | null>(null);

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
          onPress={() => setSheet({ mode: 'edit', asset })}
          accessibilityLabel={`${asset.name}, ${formatRupees(asset.balance)}`}
        />
        <View style={styles.actionRow}>
          <SecondaryButton label="Add" size="sm" onPress={() => setSheet({ mode: 'in', asset })} style={styles.actionBtn} />
          <SecondaryButton
            label="Take out"
            size="sm"
            onPress={() => setSheet({ mode: 'out', asset })}
            style={styles.actionBtn}
            // Nothing to take out of an empty asset, and offering it only produces
            // a refusal the user has to read.
            disabled={asset.balance <= 0}
          />
          <SecondaryButton label="Worth now" size="sm" onPress={() => setSheet({ mode: 'restate', asset })} style={styles.actionBtn} />
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

              {a.assets.length > 0 && (
                <PrimaryButton label="Add an asset" onPress={() => setSheet({ mode: 'create' })} />
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
        onAddMoney={async (id, paise, from) => { if (await a.addMoney(id, paise, from)) setSheet(null); }}
        onTakeMoney={async (id, paise, to) => { if (await a.takeMoney(id, paise, to)) setSheet(null); }}
        onArchive={async (asset) => { if (await a.archive(asset)) setSheet(null); }}
        onDelete={async (asset) => { if (await a.remove(asset)) setSheet(null); }}
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
  actionRow: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.md },
  actionBtn: { flex: 1 },
  foot: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: -space.sm },
});
