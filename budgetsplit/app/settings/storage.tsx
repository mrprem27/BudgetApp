import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { colors, type, space, layout } from '../../src/components/tokens';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { Card } from '../../src/components/ui/Card';
import { ListRow } from '../../src/components/ui/ListRow';
import { Divider } from '../../src/components/ui/Divider';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { SecondaryButton } from '../../src/components/ui/SecondaryButton';
import { IconCircle } from '../../src/components/ui/IconCircle';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { useScreenData } from '../../src/hooks/useScreenData';
import { haptic } from '../../src/lib/haptics';
import { getAttachmentStorage, clearAllAttachmentFiles } from '../../src/lib/attachment';
import { clearAllAttachmentRefs } from '../../src/db/queries/transactions';
import {
  freeBytes, totalBytes, getCacheStorage, getAvatarStorage, clearExportCache,
} from '../../src/lib/deviceStorage';
import { StorageVerdict, storageVerdict, storageAdvice, formatBytes, allowsAttachments } from '../../src/lib/storage';
import { AppRefreshControl } from '../../src/components/ui/AppRefreshControl';

/**
 * What this device has left, what BudgetSplit is using, and how to get some back.
 *
 * Split from `app/storage.tsx`, which stays a hidden QA screen behind the 7-tap version
 * easter egg — it holds "Load demo data" and "Erase all data", and those must not become
 * one tap from Settings. This screen only ever *frees* space; nothing here can lose a
 * transaction.
 */
export default function StorageSettingsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // All four probes are synchronous filesystem walks, so they run in the loader rather than
  // on render, and `useScreenData` re-runs them on focus — the receipts figure has to move
  // after you delete a photo, or the button looks broken.
  const { data, error, refreshing, onRefresh, reload } = useScreenData(async () => ({
    free: freeBytes(),
    total: totalBytes(),
    receipts: getAttachmentStorage(),
    cache: getCacheStorage(),
    avatars: getAvatarStorage(),
  }), []);

  const free = data?.free ?? null;
  const total = data?.total ?? null;
  const verdict = storageVerdict(free);
  const advice = storageAdvice(verdict);
  const receipts = data?.receipts ?? { count: 0, bytes: 0 };
  const cache = data?.cache ?? { count: 0, bytes: 0 };
  const avatars = data?.avatars ?? { count: 0, bytes: 0 };
  const appTotal = receipts.bytes + cache.bytes + avatars.bytes;

  const tint = verdict === StorageVerdict.Ample ? colors.accent
    : verdict === StorageVerdict.Low ? colors.textSecondary
    : verdict === StorageVerdict.Critical ? colors.healthAmber
    : colors.expense;

  function confirmClearReceipts() {
    if (receipts.count === 0) return;
    Alert.alert(
      'Delete all receipt photos?',
      `This permanently removes ${receipts.count} photo${receipts.count === 1 ? '' : 's'} (${formatBytes(receipts.bytes)}). Every transaction stays exactly as it is — only the pictures go.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete photos', style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              clearAllAttachmentFiles();
              await clearAllAttachmentRefs(db);
              haptic.warning();
              reload();
            } catch {
              haptic.error();
              Alert.alert('Something went wrong', 'The photos could not be removed. Please try again.');
            } finally { setBusy(false); }
          },
        },
      ],
    );
  }

  function doClearCache() {
    setBusy(true);
    try {
      const removed = clearExportCache();
      haptic.success();
      reload();
      // Says what actually happened rather than a generic "Done" — on a second tap the
      // honest answer is "nothing left to clear".
      Alert.alert(
        removed > 0 ? 'Cache cleared' : 'Nothing to clear',
        removed > 0
          ? `Removed ${removed} temporary file${removed === 1 ? '' : 's'}. Your data is untouched — these were copies made for sharing and importing.`
          : 'There were no leftover export or import files.',
      );
    } catch {
      haptic.error();
      Alert.alert('Something went wrong', 'The cache could not be cleared.');
    } finally { setBusy(false); }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Storage" onBack={() => router.back()} />
      {error ? (
        <ErrorState
          title="Couldn't read storage"
          body="The sizes on this device couldn't be calculated. Nothing is wrong with your data."
          onRetry={reload}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* The device figure is the hero: it's the number that decides what the app is
              allowed to do, and everything below is a way of changing it. */}
          <Card padded style={styles.hero}>
            <IconCircle icon="hard-drive" size={56} iconSize={20} color={tint} bg={colors.accentMuted} />
            <Text style={[styles.heroAmount, { color: tint }]}>
              {free === null ? 'Unknown' : formatBytes(free)}
            </Text>
            <Text style={styles.heroSub}>
              {free === null
                ? 'Free space could not be read on this device.'
                : total ? `free of ${formatBytes(total)} on this device` : 'free on this device'}
            </Text>
          </Card>

          {advice && <Text style={[styles.advice, { color: tint }]}>{advice.body}</Text>}

          {/* The degrade order, stated. A user denied a photo needs to know the app is
              choosing that on purpose, not failing. */}
          {!allowsAttachments(verdict) && (
            <Text style={styles.note}>
              Recording transactions always comes first — that costs a few bytes. Receipt
              photos need megabytes each, so they are the first thing paused and the last
              thing to come back.
            </Text>
          )}

          <SectionHeader title={`BudgetSplit is using ${formatBytes(appTotal)}`} />
          <Card clip>
            <ListRow
              icon="paperclip" iconColor={colors.accent}
              title="Receipt photos"
              subtitle={receipts.count === 0 ? 'None saved' : `${receipts.count} photo${receipts.count === 1 ? '' : 's'}`}
              value={formatBytes(receipts.bytes)}
            />
            <Divider indent="text" />
            <ListRow
              icon="refresh-cw" iconColor={colors.textSecondary}
              title="Cached exports"
              subtitle="Copies made for sharing and importing"
              value={formatBytes(cache.bytes)}
            />
            <Divider indent="text" />
            <ListRow
              icon="user" iconColor={colors.textSecondary}
              title="Profile photos"
              subtitle={avatars.count === 0 ? 'None saved' : `${avatars.count} image${avatars.count === 1 ? '' : 's'}`}
              value={formatBytes(avatars.bytes)}
            />
          </Card>

          <SectionHeader title="Free up space" />
          <View style={styles.actions}>
            <SecondaryButton
              label="Clear cached exports"
              icon="refresh-cw"
              onPress={doClearCache}
              disabled={busy}
            />
            <Text style={styles.note}>
              Safe to do any time — these are temporary copies of things you shared or
              imported, not your data.
            </Text>

            <SecondaryButton
              label="Delete all receipt photos"
              icon="paperclip"
              onPress={confirmClearReceipts}
              disabled={busy || receipts.count === 0}
              danger
            />
            <Text style={styles.note}>
              Your transactions and their amounts are kept. Only the photos are removed, and
              that cannot be undone.
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, paddingBottom: space.xxl },
  hero: { alignItems: 'center', gap: space.xs },
  heroAmount: { ...type.amountXL },
  heroSub: { ...type.body, color: colors.textSecondary, textAlign: 'center' },
  advice: { ...type.label, lineHeight: 18, marginTop: space.md },
  note: { ...type.caption, color: colors.textMuted, lineHeight: 16 },
  actions: { gap: space.sm },
});
