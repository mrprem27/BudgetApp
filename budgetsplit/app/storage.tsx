import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
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
import { haptic } from '../src/lib/haptics';

function formatBytes(b: number): string {
  if (b <= 0) return '0 KB';
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export default function StorageScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [usage, setUsage] = useState({ count: 0, bytes: 0 });

  useFocusEffect(useCallback(() => { setUsage(getAttachmentStorage()); }, []));

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
});
