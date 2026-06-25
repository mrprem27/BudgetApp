import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as Notifications from 'expo-notifications';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../src/constants/colors';
import { type } from '../../src/constants/typography';
import { space, radius, layout, shadow } from '../../src/constants/layout';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { getReminderPrefs, setReminderPrefs, rescheduleReminders } from '../../src/lib/reminders';
import { sendTestReminder } from '../../src/lib/notifications';
import { haptic } from '../../src/lib/haptics';
import type { ReminderPrefs } from '../../src/lib/reminderPlan';

type PermStatus = 'granted' | 'denied' | 'undetermined';

const NOTIFICATION_TYPES = [
  {
    key: 'renewals' as keyof ReminderPrefs,
    emoji: '📅',
    label: 'Bill reminders',
    desc: 'Alert before recurring bills and subscriptions renew',
  },
  {
    key: 'daily' as keyof ReminderPrefs,
    emoji: '📓',
    label: 'Daily log reminder',
    desc: 'Nudge to log your expenses at the end of the day',
  },
];

export default function NotificationsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [prefs, setPrefs] = useState<ReminderPrefs | null>(null);
  const [permStatus, setPermStatus] = useState<PermStatus>('undetermined');
  const [testSent, setTestSent] = useState(false);

  async function load() {
    const [p, perm] = await Promise.all([
      getReminderPrefs(),
      Notifications.getPermissionsAsync(),
    ]);
    setPrefs(p);
    setPermStatus(perm.granted ? 'granted' : perm.canAskAgain ? 'undetermined' : 'denied');
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  async function toggle(key: keyof ReminderPrefs) {
    if (!prefs) return;
    haptic.selection();
    if (permStatus !== 'granted') {
      const result = await Notifications.requestPermissionsAsync();
      if (!result.granted) {
        setPermStatus('denied');
        return;
      }
      setPermStatus('granted');
    }
    const next = await setReminderPrefs({ [key]: !prefs[key] });
    setPrefs(next);
    await rescheduleReminders(db);
  }

  async function openSettings() {
    await Linking.openSettings();
  }

  async function runTest() {
    if (permStatus !== 'granted') return;
    haptic.light();
    try {
      await sendTestReminder();
      setTestSent(true);
      setTimeout(() => setTestSent(false), 6000);
    } catch {
      // expo-go silently fails — that's fine
    }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Notifications" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Permission denied banner */}
        {permStatus === 'denied' && (
          <View style={styles.deniedBanner}>
            <View style={styles.deniedLeft}>
              <Feather name="bell-off" size={20} color={colors.expense} />
              <View style={{ flex: 1 }}>
                <Text style={styles.deniedTitle}>Notifications are off</Text>
                <Text style={styles.deniedSub}>BudgetSplit can't send you reminders until you allow it.</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.deniedCta} onPress={openSettings} accessibilityRole="button">
              <Text style={styles.deniedCtaText}>Open Settings to allow</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Notification types */}
        <Text style={styles.sectionLabel}>WHAT YOU'LL RECEIVE</Text>
        <View style={styles.card}>
          {NOTIFICATION_TYPES.map((t, i) => {
            const isOn = !!prefs?.[t.key as 'renewals' | 'daily'];
            return (
              <View key={t.key} style={[styles.typeRow, i > 0 && styles.typeRowBorder]}>
                <Text style={styles.typeEmoji}>{t.emoji}</Text>
                <View style={styles.typeInfo}>
                  <Text style={styles.typeLabel}>{t.label}</Text>
                  <Text style={styles.typeDesc}>{t.desc}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.toggle, isOn && styles.toggleOn]}
                  onPress={() => toggle(t.key as 'renewals' | 'daily')}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: isOn }}
                >
                  <View style={[styles.thumb, isOn && styles.thumbOn]} />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {/* Test notification */}
        <Text style={styles.sectionLabel}>TEST</Text>
        <View style={styles.card}>
          <View style={styles.testRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.typeLabel}>Send a test notification</Text>
              <Text style={styles.typeDesc}>{testSent ? 'Fires in ~5 seconds…' : 'Check that notifications are working'}</Text>
            </View>
            <TouchableOpacity
              style={[styles.testBtn, permStatus !== 'granted' && styles.testBtnDisabled]}
              onPress={runTest}
              disabled={permStatus !== 'granted'}
              accessibilityRole="button"
            >
              <Text style={[styles.testBtnText, permStatus !== 'granted' && { color: colors.textMuted }]}>
                {testSent ? 'Sent!' : 'Test'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>All notifications are local — no server, no push, always offline.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.xs, paddingBottom: 48 },
  deniedBanner: {
    backgroundColor: '#1F0E0E',
    borderWidth: 1.5,
    borderColor: colors.expense,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
    marginBottom: space.xs,
  },
  deniedLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  deniedTitle: { ...type.body, color: colors.expense, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  deniedSub: { ...type.caption, color: colors.textSecondary },
  deniedCta: {
    backgroundColor: colors.expense + '22',
    borderWidth: 1,
    borderColor: colors.expense,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    alignSelf: 'flex-start',
  },
  deniedCtaText: { ...type.label, color: colors.expense, fontFamily: 'Inter_600SemiBold' },
  sectionLabel: {
    ...type.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '700',
    marginTop: space.md,
    marginBottom: space.xs,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.sm,
  },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md },
  typeRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  typeEmoji: { fontSize: 22, width: 32, textAlign: 'center', flexShrink: 0 },
  typeInfo: { flex: 1 },
  typeLabel: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  typeDesc: { ...type.caption, color: colors.textSecondary },
  toggle: {
    width: 44, height: 26, borderRadius: 13,
    backgroundColor: colors.bgMuted,
    justifyContent: 'center',
    paddingHorizontal: 3,
    flexShrink: 0,
  },
  toggleOn: { backgroundColor: colors.accent },
  thumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.textMuted },
  thumbOn: { backgroundColor: colors.bg, alignSelf: 'flex-end' },
  testRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md },
  testBtn: {
    backgroundColor: colors.accent + '22',
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    flexShrink: 0,
  },
  testBtnDisabled: { backgroundColor: colors.bgMuted, borderColor: colors.border },
  testBtnText: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  footer: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.lg },
});
