import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, type, space, layout } from '../../../theme';
import { Card } from '../../ui/Card';
import { Divider } from '../../ui/Divider';
import { ListRow } from '../../ui/ListRow';
import { IconCircle } from '../../ui/IconCircle';
import { EmptyState } from '../../ui/EmptyState';
import { ErrorState } from '../../ui/ErrorState';
import { SectionHeader } from '../../ui/SectionHeader';
import { SkeletonCard } from '../../ui/Skeleton';
import { SecondaryButton } from '../../ui/SecondaryButton';
import { AssetSheet, type AssetSheetMode } from './AssetSheet';
import { MoveMoneySheet } from './MoveMoneySheet';
import { useAssets } from '../../../hooks/useAssets';
import { formatRupees, formatCompact } from '../../../lib/money';
import { ASSET_KIND_ICON, ASSET_KIND_LABEL } from '../../../constants/assets';
import type { Asset, MoveEndpoint } from '../../../db/queries/assets';

const BANK: MoveEndpoint = { kind: 'bucket', bucket: 'bank' };

/**
 * The asset register — what you own that isn't cash — as a section, so Money's Assets tab and the
 * standalone `/assets` screen are the same thing and cannot drift. Owns its data and sheets; renders
 * no scroll view of its own (the host scrolls).
 *
 * **What is out here is what you do often.** A row is its name and worth, tap to open it, plus one
 * shortcut — `Move`, which is Add, Take out and switching between assets in a single form. What you do
 * rarely — restate its worth, rename it, stop counting it — lives inside the asset's own page.
 */
export function AssetsSection() {
  const router = useRouter();
  const a = useAssets();
  const [sheet, setSheet] = useState<{ mode: AssetSheetMode; asset?: Asset } | null>(null);
  const [move, setMove] = useState<{ from: MoveEndpoint; to: MoveEndpoint } | null>(null);
  // Money in is the common case, so a row's Move opens as bank → this asset (⇅ flips it).
  const moveInto = (asset: Asset) => setMove({ from: BANK, to: { kind: 'asset', id: asset.id } });

  if (a.error) return <ErrorState onRetry={a.reload} />;
  if (a.loading) return <><SkeletonCard height={110} /><SkeletonCard height={160} /></>;

  return (
    <View style={styles.wrap}>
      <Card padded style={styles.hero}>
        <Text style={styles.heroLabel}>Worth, across your assets</Text>
        <Text style={styles.heroAmount}>{formatCompact(a.total)}</Text>
        <Text style={styles.heroHint}>Counted in your net worth, never in what you can spend — these aren’t cash.</Text>
      </Card>

      <View style={styles.actions}>
        {a.assets.length > 0 && (
          <SecondaryButton label="Move money" icon="repeat" onPress={() => setMove({ from: BANK, to: { kind: 'asset', id: a.assets[0].id } })} style={styles.flex} />
        )}
        <SecondaryButton label="Add asset" icon="plus" onPress={() => setSheet({ mode: 'create' })} style={styles.flex} />
      </View>

      {a.assets.length === 0 ? (
        <EmptyState
          icon="package"
          title="Nothing here yet"
          body="Gold, a flat, an FD, a fund. Name what you own and moving money in or out becomes a transfer — your net worth stays where it is."
          actionLabel="Add an asset"
          onAction={() => setSheet({ mode: 'create' })}
        />
      ) : (
        <Card clip>
          {a.assets.map((asset, i) => (
            <View key={asset.id}>
              {i > 0 && <Divider indent="text" />}
              <ListRow
                variant="stacked"
                leading={<IconCircle icon={ASSET_KIND_ICON[asset.kind]} size={layout.avatarSize} color={asset.color ?? colors.accent} />}
                title={asset.name}
                subtitle={ASSET_KIND_LABEL[asset.kind]}
                value={<Text style={styles.balance}>{formatRupees(asset.balance)}</Text>}
                // Tap opens the asset and the movements behind its balance.
                onPress={() => router.push(`/asset/${asset.id}`)}
                accessibilityLabel={`${asset.name}, ${formatRupees(asset.balance)}`}
              />
              <View style={styles.actionRow}>
                <SecondaryButton label="Move" icon="repeat" size="sm" onPress={() => moveInto(asset)} style={styles.actionBtn} />
              </View>
            </View>
          ))}
        </Card>
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
  wrap: { gap: space.md },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', gap: space.sm },
  hero: { alignItems: 'center', gap: space.xs },
  heroLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  heroAmount: { fontFamily: 'SpaceMono_400Regular', fontSize: 32, letterSpacing: -1, color: colors.textPrimary },
  heroHint: { ...type.caption, color: colors.textSecondary, textAlign: 'center' },
  balance: { fontFamily: 'SpaceMono_400Regular', fontSize: 15, color: colors.textPrimary },
  actionRow: { flexDirection: 'row', paddingHorizontal: space.md, paddingBottom: space.md },
  actionBtn: { alignSelf: 'flex-start' },
  foot: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: -space.sm },
});
