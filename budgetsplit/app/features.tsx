import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as Location from 'expo-location';
import { Feather } from '@expo/vector-icons';
import { settings } from '../src/lib/settings';
import { getAllGroups } from '../src/db/queries/groups';
import { getMe } from '../src/db/queries/persons';
import { getMyExposure } from '../src/db/queries/balances';
import { formatRupees } from '../src/lib/money';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, radius, layout, shadow } from '../src/constants/layout';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { useFeatureFlags } from '../src/components/system/FeatureFlagsProvider';
import { haptic } from '../src/lib/haptics';
import { alpha } from '../src/theme';

// The pillars are always on — the app's reason to exist. They show a "Core" badge
// instead of a toggle so users understand they can't switch off the basics.
//
// "Group Splitting" used to sit here as a third Core pillar. It moved into the
// toggleable list below: the onboarding persona can now switch it off for someone
// who only tracks their own money, and a Core badge over a switchable module was a
// promise the app no longer keeps.
const CORES: { icon: keyof typeof Feather.glyphMap; tint: string; label: string; caption: string }[] = [
  { icon: 'dollar-sign', tint: colors.accent, label: 'Personal Finance', caption: 'Budgets, categories, spending tracking' },
  { icon: 'bar-chart-2', tint: colors.healthAmber, label: 'Insights', caption: 'Trends, alerts, and patterns across both' },
];


export default function FeaturesScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { flags, setFlag } = useFeatureFlags();
  const [saveLocation, setSaveLocation] = useState(false);

  useEffect(() => {
    (async () => {
      setSaveLocation(await settings.saveLocation());
    })();
  }, []);

  /**
   * Location tagging is deliberately NOT a feature flag, even though it sits in
   * the same switch list.
   *
   * A feature flag is a display preference: `setFlag` is optimistic,
   * fire-and-forget, and cannot fail. This toggle can be *refused* by the OS, so
   * it has to await a permission result and then decline to turn on. Folding it
   * into `FeatureKey` would mean adding async validation to the flag API to serve
   * this one case, making every other flag more complicated. It lives in
   * `settings` (AsyncStorage) instead, and that split is intentional — see
   * AUDIT F-30 / DEBT-04, where it was filed as an inconsistency.
   */
  async function toggleSaveLocation(v: boolean) {
    haptic.selection();
    // Turning it ON asks for OS location permission first; if denied, leave it off.
    if (v) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location off', 'Allow location access for BudgetSplit in your phone’s Settings to tag where you spend.');
        return;
      }
    }
    setSaveLocation(v);
    await settings.setSaveLocation(v);
  }

  /**
   * Turning splitting OFF hides the Groups tab, the owe/owed strip and the Transfer
   * kind. Nothing is deleted — but a user with unsettled balances would watch money
   * they're owed vanish from every screen with no explanation, so the count and the
   * outstanding amount are named before it happens. Turning it back ON is silent.
   */
  async function toggleSplitting(v: boolean) {
    haptic.selection();
    if (v) { setFlag('splitting', true); return; }

    let shared = 0;
    let outstanding = 0;
    try {
      const [grps, me] = await Promise.all([getAllGroups(db), getMe(db)]);
      shared = grps.filter(g => g.is_personal !== 1).length;
      if (me) {
        const exp = await getMyExposure(db, me.id);
        outstanding = exp.owe + exp.owed;
      }
    } catch { /* fall through to the plain confirm */ }

    if (shared === 0 && outstanding === 0) { setFlag('splitting', false); return; }

    const parts = [
      shared > 0 ? `${shared} shared group${shared > 1 ? 's' : ''}` : null,
      outstanding > 0 ? `${formatRupees(outstanding)} still unsettled` : null,
    ].filter(Boolean).join(' and ');

    Alert.alert(
      'Hide group splitting?',
      `You have ${parts}. Hiding this removes the Groups tab and the owe/owed strip. Nothing is deleted — turn it back on any time to get everything back.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Hide', style: 'destructive', onPress: () => setFlag('splitting', false) },
      ],
    );
  }

  // Optional modules, grouped into clear sections. Each maps to the flag (or
  // store) that actually gates it. "Reports & Charts" gates donut + trend
  // together; "Location Tagging" lives in AsyncStorage, not the flag set.
  type Module = { icon: keyof typeof Feather.glyphMap; label: string; caption: string; value: boolean; onChange: (v: boolean) => void };
  const MODULE_SECTIONS: { title: string; items: Module[] }[] = [
    {
      title: 'Splitting & people',
      items: [
        { icon: 'users', label: 'Group Splitting', caption: 'Groups tab, shared bills, settle up, the owe/owed strip on Home', value: flags.splitting, onChange: toggleSplitting },
      ],
    },
    {
      title: 'Insights & reports',
      items: [
        { icon: 'activity', label: 'Financial Health Score', caption: 'A wellness score for your money habits', value: flags.healthScore, onChange: v => setFlag('healthScore', v) },
        { icon: 'trending-up', label: 'Spending Forecast', caption: 'See where your spending lands at month-end', value: flags.forecast, onChange: v => setFlag('forecast', v) },
        { icon: 'zap', label: 'Savings Insights', caption: 'Opportunity-cost & habit nudges on the Insights screen', value: flags.savingsInsights, onChange: v => setFlag('savingsInsights', v) },
        { icon: 'bar-chart-2', label: 'Spending Insights', caption: 'Category-shift nudges on Home and Insights', value: flags.dashboardInsights, onChange: v => setFlag('dashboardInsights', v) },
        { icon: 'pie-chart', label: 'Reports & Charts', caption: 'Donut and 6-month trend charts in Reports', value: flags.reportsDonut, onChange: v => { setFlag('reportsDonut', v); setFlag('reportsTrend', v); } },
      ],
    },
    {
      title: 'Money tools',
      items: [
        { icon: 'target', label: 'Savings Goals', caption: 'Track goals and fund them directly from cash', value: flags.savingsGoals, onChange: v => setFlag('savingsGoals', v) },
        { icon: 'refresh-cw', label: 'Recurring', caption: 'Track repeating bills & charges', value: flags.recurring, onChange: v => setFlag('recurring', v) },
        { icon: 'help-circle', label: 'Afford Check', caption: 'Quick "can I afford this?" before a big buy', value: flags.affordCheck, onChange: v => setFlag('affordCheck', v) },
        { icon: 'bell', label: 'Reminders', caption: 'Nudges before bills and settle-up deadlines', value: flags.reminders, onChange: v => setFlag('reminders', v) },
        { icon: 'award', label: 'Tracking Streak', caption: 'A daily-logging streak on Home (shows at 3+ days)', value: flags.streak, onChange: v => setFlag('streak', v) },
      ],
    },
    {
      title: 'Smart capture',
      items: [
        { icon: 'cpu', label: 'Smart Categories', caption: 'Auto-suggest a category as you type the note', value: flags.smartCategory, onChange: v => setFlag('smartCategory', v) },
        { icon: 'repeat', label: 'Recurring Suggestions', caption: 'Flag imported transactions that look like a recurring bill', value: flags.recurringSuggest, onChange: v => setFlag('recurringSuggest', v) },
        { icon: 'map-pin', label: 'Location Tagging', caption: 'Tag transactions with where you spent', value: saveLocation, onChange: toggleSaveLocation },
        // No "Scan Receipts" row: the OCR entry point was removed (it could read a
        // bill's total but not its line items), so the switch promised a feature
        // that no longer exists. Restore it with the feature, not before.
      ],
    },
  ];

  return (
    <View style={styles.container}>
      <ScreenHeader title="Feature Management" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.intro}>Turn on what you need. Off by default keeps the app clean.</Text>

        {/* ALWAYS ON — the three pillars, no toggle */}
        <Text style={styles.sectionTitle}>Always on</Text>
        <View style={styles.card}>
          {CORES.map((c, i) => (
            <View key={c.label}>
              {i > 0 && <View style={styles.divider} />}
              <View style={styles.row}>
                <View style={[styles.iconDot, { backgroundColor: alpha(c.tint, 13) }]}>
                  <Feather name={c.icon} size={16} color={c.tint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{c.label}</Text>
                  <Text style={styles.caption}>{c.caption}</Text>
                </View>
                <View style={[styles.coreBadge, { backgroundColor: alpha(c.tint, 10), borderColor: c.tint }]}>
                  <Text style={[styles.coreBadgeText, { color: c.tint }]}>Core</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* OPTIONAL MODULES — grouped into sections */}
        {MODULE_SECTIONS.map(section => (
          <View key={section.title}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.card}>
              {section.items.map((m, i) => (
                <View key={m.label}>
                  {i > 0 && <View style={styles.divider} />}
                  <View style={[styles.row, !m.value && styles.rowOff]}>
                    <View style={styles.iconDot}><Feather name={m.icon} size={16} color={colors.accent} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>{m.label}</Text>
                      <Text style={styles.caption}>{m.caption}</Text>
                    </View>
                    <Switch value={m.value} onValueChange={m.onChange} trackColor={{ true: colors.accent, false: colors.bgMuted }} thumbColor={colors.textPrimary} accessibilityLabel={m.label} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.footer}>Enabled sections appear in their natural home.{'\n'}Nothing is deleted when a section is off.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, paddingBottom: space.lg, gap: space.xs },
  intro: { ...type.body, color: colors.textSecondary, marginBottom: space.sm, lineHeight: 20 },
  sectionTitle: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Inter_600SemiBold', marginTop: space.md, marginBottom: space.xs, marginLeft: space.xs },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, ...shadow.sm },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: space.xl + space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm + 2, minHeight: 56 },
  rowOff: { opacity: 0.7 },
  iconDot: { width: 32, height: 32, borderRadius: radius.lg, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  label: { ...type.body, color: colors.textPrimary },
  caption: { ...type.caption, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
  coreBadge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: space.xs, borderWidth: 1 },
  coreBadgeText: { ...type.caption, fontFamily: 'Inter_600SemiBold' },
  footer: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.md, lineHeight: 18 },
});
