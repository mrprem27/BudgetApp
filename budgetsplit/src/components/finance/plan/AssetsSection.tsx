import { useState } from 'react';
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
import { PrimaryButton } from '../../ui/PrimaryButton';
import { SumLine } from '../../ui/SumLine';
import { AssetSheet, type AssetSheetMode } from './AssetSheet';
import { MoveMoneySheet } from './MoveMoneySheet';
import type { useAssets } from '../../../hooks/useAssets';
import { formatRupees } from '../../../lib/money';
import { ASSET_KIND_ICON, ASSET_KIND_LABEL } from '../../../constants/assets';
import type { Asset, MoveEndpoint } from '../../../db/queries/assets';

const BANK: MoveEndpoint = { kind: 'bucket', bucket: 'bank' };

/**
 * The asset register — what you own that isn't cash — as a section, so Money's Assets tab and the
 * standalone `/assets` screen are the same thing and cannot drift. Owns its sheets; the host owns the
 * scroll view and the data (`useAssets`), so pulling to refresh reloads the list.
 *
 * A sum card (`U-45`): each asset a line, `= Worth` under them, tap a line to open the asset. The two
 * actions — Add asset and Move money — sit together at the end. What you do rarely (restate its worth,
 * rename it, stop counting it) lives inside the asset's own page.
 */
/** `assets` comes from the host, so the host's pull-to-refresh can reload it (`a.onRefresh`). */
export function AssetsSection({ assets: a }: { assets: ReturnType<typeof useAssets> }) {
  const router = useRouter();
  const [sheet, setSheet] = useState<{ mode: AssetSheetMode; asset?: Asset } | null>(null);
  const [move, setMove] = useState<{ from: MoveEndpoint; to: MoveEndpoint } | null>(null);

  if (a.error) return <ErrorState onRetry={a.reload} />;
  if (a.loading) return <><SkeletonCard height={110} /><SkeletonCard height={160} /></>;

  return (
    <View style={styles.wrap}>
      {a.assets.length === 0 ? (
        <EmptyState
          icon="package"
          title="Nothing here yet"
          body="Gold, a flat, an FD, a fund. Name what you own and moving money in or out becomes a transfer, your net worth stays where it is."
          actionLabel="Add an asset"
          onAction={() => setSheet({ mode: 'create' })}
        />
      ) : (
        // A sum you could check by hand (`U-45`), the same shape as Money's card and Friends:
        // each asset a line in its own colour, `= Worth` under them. Tap a line to open it.
        <Card padded style={styles.sum}>
          {a.assets.map((asset, i) => (
            <SumLine
              key={asset.id}
              op={i === 0 ? '' : '+'}
              dot={asset.color ?? colors.accent}
              label={asset.name}
              hint={ASSET_KIND_LABEL[asset.kind]}
              value={asset.balance}
              onPress={() => router.push(`/asset/${asset.id}`)}
            />
          ))}
          <SumLine op="=" label="Worth" value={a.total} total />
          <Text style={styles.hint}>In your net worth, never in what you can spend.</Text>
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

      {a.assets.length > 0 && (
        <View style={styles.actions}>
          <SecondaryButton label="Add asset" icon="plus" onPress={() => setSheet({ mode: 'create' })} style={styles.flex} />
          <PrimaryButton label="Move money" onPress={() => setMove({ from: BANK, to: { kind: 'asset', id: a.assets[0].id } })} style={styles.flex} />
        </View>
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
        bucketBalances={a.bucketBalances}
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
  sum: { gap: 6 },
  hint: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
  actions: { flexDirection: 'row', gap: space.sm },
  foot: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: -space.sm },
});
