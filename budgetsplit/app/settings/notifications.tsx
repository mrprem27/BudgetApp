import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as Notifications from 'expo-notifications';
import { useScreenData } from '../../src/hooks/useScreenData';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../src/constants/colors';
import { type } from '../../src/constants/typography';
import { space, radius, layout, shadow } from '../../src/constants/layout';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import {
  getReminderPrefs, setReminderPrefs, rescheduleReminders, formatReminderTime,
  MAX_LEAD_DAYS, type ReminderPrefs, type ReminderTime,
} from '../../src/lib/reminders';
import { sendTestReminder } from '../../src/lib/notifications';
import { TimePickerSheet } from '../../src/components/ui/TimePickerSheet';
import { haptic } from '../../src/lib/haptics';

type PermStatus = 'granted' | 'denied' | 'undetermined';

export default function NotificationsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [permStatus, setPermStatus] = useState<PermStatus>('undetermined');
  const [testSent, setTestSent] = useState(false);
  const [timeEditing, setTimeEditing] = useState<null | 'renewal' | 'daily'>(null);

  // Reminder prefs + OS permission load on focus / cross-screen write via useScreenData.
  const { data, reload } = useScreenData(async () => {
    const [prefs, perm] = await Promise.all([
      getReminderPrefs(),
      Notifications.getPermissionsAsync(),
    ]);
    const status: PermStatus = perm.granted ? 'granted' : perm.canAskAgain ? 'undetermined' : 'denied';
    return { prefs, permStatus: status };
  }, []);
  const prefs = data?.prefs ?? null;

  // Mirror the loaded OS permission into local state so toggle() can still apply its
  // optimistic 'granted'/'denied' updates; each (re)load re-syncs to OS truth.
  useEffect(() => { if (data) setPermStatus(data.permStatus); }, [data]);

  // Turning a reminder ON asks for permission first; off needs none.
  async function toggle(key: 'renewals' | 'daily') {
    if (!prefs) return;
    haptic.selection();
    if (!prefs[key] && permStatus !== 'granted') {
      const result = await Notifications.requestPermissionsAsync();
      if (!result.granted) { setPermStatus('denied'); return; }
      setPermStatus('granted');
    }
    await patchPrefs({ [key]: !prefs[key] });
  }

  // Lead-days / time changes — the reminder is already on, no permission prompt.
  async function patchPrefs(patch: Partial<ReminderPrefs>) {
    await setReminderPrefs(patch);
    await rescheduleReminders(db);
    await reload();
  }

  function onSaveTime(time: ReminderTime) {
    if (timeEditing === 'renewal') patchPrefs({ renewalTime: time });
    else if (timeEditing === 'daily') patchPrefs({ dailyTime: time });
    setTimeEditing(null);
  }

  async function runTest() {
    if (permStatus !== 'granted') return;
    haptic.light();
    try {
      await sendTestReminder();
      setTestSent(true);
      setTimeout(() => setTestSent(false), 6000);
    } catch {
      // Expo Go silently fails — local notifications need a dev build.
    }
  }

  const Toggle = ({ on, onPress }: { on: boolean; onPress: () => void }) => (
    <TouchableOpacity style={[styles.toggle, on && styles.toggleOn]} onPress={onPress} accessibilityRole="switch" accessibilityState={{ checked: on }}>
      <View style={[styles.thumb, on && styles.thumbOn]} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title="Notifications & Reminders" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {permStatus === 'denied' && (
          <View style={styles.deniedBanner}>
            <View style={styles.deniedLeft}>
              <Feather name="bell-off" size={20} color={colors.expense} />
              <View style={{ flex: 1 }}>
                <Text style={styles.deniedTitle}>Notifications are off</Text>
                <Text style={styles.deniedSub}>BudgetSplit can't send you reminders until you allow it.</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.deniedCta} onPress={() => Linking.openSettings()} accessibilityRole="button">
              <Text style={styles.deniedCtaText}>Open Settings to allow</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Reminders — every reminder setting lives here */}
        <Text style={styles.sectionLabel}>REMINDERS</Text>
        <View style={styles.card}>
          {/* Bill / renewal reminders */}
          <View style={styles.typeRow}>
            <Text style={styles.typeEmoji}>📅</Text>
            <View style={styles.typeInfo}>
              <Text style={styles.typeLabel}>Bill reminders</Text>
              <Text style={styles.typeDesc}>Alert before recurring bills and subscriptions renew</Text>
            </View>
            <Toggle on={!!prefs?.renewals} onPress={() => toggle('renewals')} />
          </View>
          {prefs?.renewals && (
            <>
              <View style={styles.configRow}>
                <Feather name="calendar" size={15} color={colors.accent} />
                <Text style={styles.configLabel}>Start {prefs.renewalLeadDays} day{prefs.renewalLeadDays === 1 ? '' : 's'} before</Text>
                <View style={styles.stepper}>
                  <TouchableOpacity style={styles.stepperBtn} onPress={() => patchPrefs({ renewalLeadDays: prefs.renewalLeadDays - 1 })} disabled={prefs.renewalLeadDays <= 1} accessibilityRole="button" accessibilityLabel="Fewer days">
                    <Feather name="minus" size={16} color={prefs.renewalLeadDays <= 1 ? colors.textMuted : colors.accent} />
                  </TouchableOpacity>
                  <Text style={styles.stepperVal}>{prefs.renewalLeadDays}</Text>
                  <TouchableOpacity style={styles.stepperBtn} onPress={() => patchPrefs({ renewalLeadDays: prefs.renewalLeadDays + 1 })} disabled={prefs.renewalLeadDays >= MAX_LEAD_DAYS} accessibilityRole="button" accessibilityLabel="More days">
                    <Feather name="plus" size={16} color={prefs.renewalLeadDays >= MAX_LEAD_DAYS ? colors.textMuted : colors.accent} />
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity style={styles.configRow} onPress={() => setTimeEditing('renewal')} accessibilityRole="button">
                <Feather name="clock" size={15} color={colors.accent} />
                <Text style={styles.configLabel}>Reminder time</Text>
                <Text style={styles.configValue}>{formatReminderTime(prefs.renewalTime)}</Text>
                <Feather name="chevron-right" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </>
          )}

          {/* Daily log reminder */}
          <View style={[styles.typeRow, styles.typeRowBorder]}>
            <Text style={styles.typeEmoji}>📓</Text>
            <View style={styles.typeInfo}>
              <Text style={styles.typeLabel}>Daily log reminder</Text>
              <Text style={styles.typeDesc}>Nudge to log your expenses at the end of the day</Text>
            </View>
            <Toggle on={!!prefs?.daily} onPress={() => toggle('daily')} />
          </View>
          {prefs?.daily && (
            <TouchableOpacity style={styles.configRow} onPress={() => setTimeEditing('daily')} accessibilityRole="button">
              <Feather name="clock" size={15} color={colors.accent} />
              <Text style={styles.configLabel}>Daily reminder time</Text>
              <Text style={styles.configValue}>{formatReminderTime(prefs.dailyTime)}</Text>
              <Feather name="chevron-right" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
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

        <Text style={styles.footer}>All notifications are local — no server, no push, always offline.</Text>
      </ScrollView>

      {prefs && (
        <TimePickerSheet
          visible={timeEditing !== null}
          title={timeEditing === 'daily' ? 'Daily reminder time' : 'Renewal reminder time'}
          value={timeEditing === 'daily' ? prefs.dailyTime : prefs.renewalTime}
          onClose={() => setTimeEditing(null)}
          onSave={onSaveTime}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.xs, paddingBottom: space.xxl },
  deniedBanner: { backgroundColor: '#1F0E0E', borderWidth: 1.5, borderColor: colors.expense, borderRadius: radius.lg, padding: space.md, gap: space.sm, marginBottom: space.xs },
  deniedLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  deniedTitle: { ...type.body, color: colors.expense, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  deniedSub: { ...type.caption, color: colors.textSecondary },
  deniedCta: { backgroundColor: colors.expense + '22', borderWidth: 1, borderColor: colors.expense, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: space.sm, alignSelf: 'flex-start' },
  deniedCtaText: { ...type.label, color: colors.expense, fontFamily: 'Inter_600SemiBold' },
  sectionLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700', marginTop: space.md, marginBottom: space.xs },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.sm },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md },
  typeRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  typeEmoji: { fontSize: 22, width: 32, textAlign: 'center', flexShrink: 0 },
  typeInfo: { flex: 1 },
  typeLabel: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  typeDesc: { ...type.caption, color: colors.textSecondary },
  // Sub-config rows under an enabled reminder.
  configRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, paddingHorizontal: space.md, minHeight: 48, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg + '55' },
  configLabel: { ...type.body, color: colors.textSecondary, flex: 1 },
  configValue: { ...type.body, color: colors.textPrimary, fontFamily: 'SpaceMono_400Regular' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepperBtn: { width: 32, height: 32, borderRadius: radius.lg, backgroundColor: colors.bgMuted, alignItems: 'center', justifyContent: 'center' },
  stepperVal: { ...type.body, color: colors.textPrimary, fontFamily: 'SpaceMono_400Regular', minWidth: 18, textAlign: 'center' },
  toggle: { width: 44, height: 26, borderRadius: 13, backgroundColor: colors.bgMuted, justifyContent: 'center', paddingHorizontal: 3, flexShrink: 0 },
  toggleOn: { backgroundColor: colors.accent },
  thumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.textMuted },
  thumbOn: { backgroundColor: colors.bg, alignSelf: 'flex-end' },
  testRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md },
  testBtn: { backgroundColor: colors.accent + '22', borderWidth: 1, borderColor: colors.accent, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: space.sm, flexShrink: 0 },
  testBtnDisabled: { backgroundColor: colors.bgMuted, borderColor: colors.border },
  testBtnText: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  footer: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.lg },
});
