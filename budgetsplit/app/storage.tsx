import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter, useFocusEffect } from 'expo-router';
import { useScreenData } from '../src/hooks/useScreenData';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, layout, shadow } from '../src/theme';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { ErrorState } from '../src/components/ui/ErrorState';
import { SecondaryButton } from '../src/components/ui/SecondaryButton';
import { getAttachmentStorage, clearAllAttachmentFiles } from '../src/lib/attachment';
import { clearAllAttachmentRefs } from '../src/db/queries/transactions';
import { loadDemoData, resetToEmpty } from '../src/db/seedDemo';
import { useDataRefresh } from '../src/components/system/DataRefreshProvider';
import { useFeatureFlags } from '../src/components/system/FeatureFlagsProvider';
import { DEFAULTS, FEATURE_KEYS, type FeatureKey } from '../src/lib/featureFlags';
import { applyPersona, asIntent } from '../src/lib/personaDefaults';
import { settings } from '../src/lib/settings';
import { haptic } from '../src/lib/haptics';
import { IconCircle } from '../src/components/ui/IconCircle';

function formatBytes(b: number): string {
  if (b <= 0) return '0 KB';
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export default function StorageScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { refresh } = useDataRefresh();
  const { setFlag, reload: reloadFlags } = useFeatureFlags();
  const [busy, setBusy] = useState(false);

  // Defense in depth: the only entry point (the 7-tap gesture in Settings → About)
  // is already __DEV__-gated, but this screen can replace or erase a user's entire
  // dataset (loadDemoData/resetToEmpty below), so a stray deep link or old muscle
  // memory must not reach it in a release/TestFlight build either.
  useFocusEffect(useCallback(() => {
    if (!__DEV__) router.back();
  }, [router]));

  // Refetch on focus (via useScreenData) so the stored-attachment stats reflect
  // imports/deletes made elsewhere. getAttachmentStorage is sync; db is unused here.
  const { data, error: loadError, reload } = useScreenData(async () => getAttachmentStorage(), []);
  const count = data?.count ?? 0;
  const bytes = data?.bytes ?? 0;

  function confirmLoadDemo() {
    Alert.alert(
      'Load demo data?',
      'This REPLACES all current data with a comprehensive test dataset (people, groups, splits, settlements, budgets, recurring rules, savings goals). Your name & avatar are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Load demo', style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              const summary = await loadDemoData(db);
              // Turn every feature flag ON so all gated surfaces are visible for testing.
              (Object.keys(DEFAULTS) as FeatureKey[]).forEach(k => setFlag(k, true));
              refresh();
              haptic.success();
              Alert.alert('Demo data loaded', `${summary}\n\nAll feature flags enabled.`);
            } catch (e) {
              haptic.error();
              Alert.alert('Couldn’t load demo data', String(e instanceof Error ? e.message : e));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  function confirmReset() {
    Alert.alert(
      'Erase all data?',
      'This permanently deletes ALL transactions, groups, people, budgets and savings, leaving an empty app. Your name & avatar are kept. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Erase everything', style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await resetToEmpty(db);
              // Loading demo data flips every flag ON for testing, and nothing put
              // them back — so an "erase" left the tester's persona permanently
              // overwritten. There is no snapshot and no `clearFlag`, so the stored
              // onboarding intent is the only thing that can rebuild the setup.
              await applyPersona(asIntent(await settings.onboardingIntent()) ?? 'both', FEATURE_KEYS);
              // `applyPersona` writes through the module-level `setFlag`, not the
              // provider's, so the in-memory flags need an explicit re-read.
              await reloadFlags();
              refresh();
              haptic.warning();
              Alert.alert('Data erased', 'The app is now empty, and feature flags are back to your setup.');
            } catch (e) {
              haptic.error();
              Alert.alert('Couldn’t erase data', String(e instanceof Error ? e.message : e));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  function clearAll() {
    if (count === 0) return;
    Alert.alert(
      'Delete all attachments?',
      `This permanently removes ${count} receipt ${count === 1 ? 'photo' : 'photos'} (${formatBytes(bytes)}). Your transactions stay; only the photos are removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all', style: 'destructive',
          onPress: async () => {
            try {
              clearAllAttachmentFiles();
              await clearAllAttachmentRefs(db);
              haptic.warning();
              reload();
            } catch { haptic.error(); Alert.alert('Something went wrong', 'Please try again.'); }
          },
        },
      ],
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Storage" onBack={() => router.back()} />
      <View style={styles.content}>
        {/* Only the storage *stats* come from the loader. If that read fails we
            surface it here rather than blanking the screen — the reset/erase
            actions below are exactly what a user needs when storage misbehaves. */}
        {loadError ? (
          <ErrorState
            title="Couldn't read storage"
            body="The attachment size couldn't be calculated. The actions below still work."
            onRetry={reload}
          />
        ) : (
          <>
            <View style={styles.card}>
              <IconCircle icon="paperclip" size={56} iconSize={20} color={colors.accent} bg={colors.accentMuted} style={styles.iconCircle} />
              <Text style={styles.amount}>{formatBytes(bytes)}</Text>
              <Text style={styles.sub}>{count} receipt {count === 1 ? 'photo' : 'photos'} stored on this device</Text>
            </View>

            <Text style={styles.note}>
              Receipt photos are compressed on import and stored only on this device. (Scanning a
              receipt sends that one photo to a cloud OCR service to read it; the stored copy stays
              here.) Delete them here to free up space — your transactions are kept.
            </Text>

            <SecondaryButton label="Delete all attachments" onPress={clearAll} disabled={count === 0} />
          </>
        )}

        {/* Developer / QA — populate or wipe the whole app for testing. */}
        <View style={styles.devSection}>
          <Text style={styles.devTitle}>TESTING</Text>
          <Text style={styles.note}>
            Load a full demo dataset to explore every screen, or wipe everything back to an empty app.
          </Text>
          <SecondaryButton label={busy ? 'Working…' : 'Load demo data'} onPress={confirmLoadDemo} disabled={busy} icon="database" />
          <TouchableOpacity
            style={[styles.eraseBtn, busy && styles.eraseDisabled]}
            onPress={confirmReset}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Erase all data"
          >
            <Feather name="trash-2" size={16} color={colors.expense} />
            <Text style={styles.eraseText}>Erase all data</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: layout.screenPaddingH, gap: space.lg },
  card: { alignItems: 'center', gap: space.xs, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.xl, ...shadow.sm },
  iconCircle: { marginBottom: space.xs  },
  amount: { ...type.title, color: colors.textPrimary },
  sub: { ...type.body, color: colors.textSecondary, textAlign: 'center' },
  note: { ...type.caption, color: colors.textMuted, lineHeight: 18, textAlign: 'center' },
  devSection: { gap: space.md, marginTop: space.lg, paddingTop: space.lg, borderTopWidth: 1, borderTopColor: colors.border },
  devTitle: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  eraseBtn: { height: 52, borderWidth: 1, borderColor: colors.expense, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: space.sm, width: '100%' },
  eraseDisabled: { opacity: 0.4 },
  eraseText: { ...type.button, color: colors.expense },
});
