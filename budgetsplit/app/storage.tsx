import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, radius, layout, shadow } from '../src/constants/layout';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { SecondaryButton } from '../src/components/ui/SecondaryButton';
import { getAttachmentStorage, clearAllAttachmentFiles } from '../src/lib/attachment';
import { clearAllAttachmentRefs } from '../src/db/queries/transactions';
import { loadDemoData, resetToEmpty } from '../src/db/seedDemo';
import { useDataRefresh } from '../src/components/system/DataRefreshProvider';
import { useFeatureFlags } from '../src/components/system/FeatureFlagsProvider';
import { DEFAULTS, type FeatureKey } from '../src/lib/featureFlags';
import { haptic } from '../src/lib/haptics';

function formatBytes(b: number): string {
  if (b <= 0) return '0 KB';
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export default function StorageScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { refresh } = useDataRefresh();
  const { setFlag } = useFeatureFlags();
  const [usage, setUsage] = useState({ count: 0, bytes: 0 });
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => { setUsage(getAttachmentStorage()); }, []));

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
              refresh();
              haptic.warning();
              Alert.alert('Data erased', 'The app is now empty.');
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
    if (usage.count === 0) return;
    Alert.alert(
      'Delete all attachments?',
      `This permanently removes ${usage.count} receipt ${usage.count === 1 ? 'photo' : 'photos'} (${formatBytes(usage.bytes)}). Your transactions stay; only the photos are removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all', style: 'destructive',
          onPress: async () => {
            try {
              clearAllAttachmentFiles();
              await clearAllAttachmentRefs(db);
              haptic.warning();
              setUsage({ count: 0, bytes: 0 });
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
        <View style={styles.card}>
          <View style={styles.iconCircle}><Feather name="paperclip" size={20} color={colors.accent} /></View>
          <Text style={styles.amount}>{formatBytes(usage.bytes)}</Text>
          <Text style={styles.sub}>{usage.count} receipt {usage.count === 1 ? 'photo' : 'photos'} stored on this device</Text>
        </View>

        <Text style={styles.note}>
          Receipt photos are compressed on import and never leave your device. Delete them here to free up space — your transactions are kept.
        </Text>

        <SecondaryButton label="Delete all attachments" onPress={clearAll} disabled={usage.count === 0} />

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
  iconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  amount: { ...type.title, color: colors.textPrimary },
  sub: { ...type.body, color: colors.textSecondary, textAlign: 'center' },
  note: { ...type.caption, color: colors.textMuted, lineHeight: 18, textAlign: 'center' },
  devSection: { gap: space.md, marginTop: space.lg, paddingTop: space.lg, borderTopWidth: 1, borderTopColor: colors.border },
  devTitle: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  eraseBtn: { height: 52, borderWidth: 1, borderColor: colors.expense, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: space.sm, width: '100%' },
  eraseDisabled: { opacity: 0.4 },
  eraseText: { ...type.button, color: colors.expense },
});
