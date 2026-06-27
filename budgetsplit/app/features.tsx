import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Feather } from '@expo/vector-icons';
import { settings } from '../src/lib/settings';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, radius, layout, shadow } from '../src/constants/layout';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { useFeatureFlags } from '../src/components/system/FeatureFlagsProvider';
import { haptic } from '../src/lib/haptics';

// The three pillars are always on — the app's reason to exist. They show a "Core"
// badge instead of a toggle so users understand they can't switch off the basics.
const CORES: { icon: keyof typeof Feather.glyphMap; tint: string; label: string; caption: string }[] = [
  { icon: 'dollar-sign', tint: colors.accent, label: 'Personal Finance', caption: 'Budgets, categories, spending tracking' },
  { icon: 'users', tint: colors.settle, label: 'Group Splitting', caption: 'Shared expenses, itemized splits, settle up' },
  { icon: 'bar-chart-2', tint: colors.healthAmber, label: 'Insights', caption: 'Trends, alerts, and patterns across both' },
];


export default function FeaturesScreen() {
  const router = useRouter();
  const { flags, setFlag } = useFeatureFlags();
  const [saveLocation, setSaveLocation] = useState(false);

  useEffect(() => {
    (async () => {
      setSaveLocation(await settings.saveLocation());
    })();
  }, []);

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

  // Optional modules, grouped into clear sections. Each maps to the flag (or
  // store) that actually gates it. "Reports & Charts" gates donut + trend
  // together; "Location Tagging" lives in AsyncStorage, not the flag set.
  type Module = { icon: keyof typeof Feather.glyphMap; label: string; caption: string; value: boolean; onChange: (v: boolean) => void };
  const MODULE_SECTIONS: { title: string; items: Module[] }[] = [
    {
      title: 'Insights & reports',
      items: [
        { icon: 'activity', label: 'Financial Health Score', caption: 'A wellness score for your money habits', value: flags.healthScore, onChange: v => setFlag('healthScore', v) },
        { icon: 'trending-up', label: 'Spending Forecast', caption: 'See where your spending lands at month-end', value: flags.forecast, onChange: v => setFlag('forecast', v) },
        { icon: 'zap', label: 'Savings Insights', caption: 'Opportunity-cost & habit nudges on the Plan tab', value: flags.savingsInsights, onChange: v => setFlag('savingsInsights', v) },
        { icon: 'pie-chart', label: 'Reports & Charts', caption: 'Deep-dive charts and PDF export', value: flags.reportsDonut, onChange: v => { setFlag('reportsDonut', v); setFlag('reportsTrend', v); } },
      ],
    },
    {
      title: 'Money tools',
      items: [
        { icon: 'target', label: 'Savings Goals', caption: 'Track goals, auto-sweep surplus each month', value: flags.savingsGoals, onChange: v => setFlag('savingsGoals', v) },
        { icon: 'refresh-cw', label: 'Recurring Tracker', caption: 'Track repeating bills & charges', value: flags.subscriptions, onChange: v => setFlag('subscriptions', v) },
        { icon: 'help-circle', label: 'Afford Check', caption: 'Quick "can I afford this?" before a big buy', value: flags.affordCheck, onChange: v => setFlag('affordCheck', v) },
        { icon: 'bell', label: 'Reminders', caption: 'Nudges before bills and settle-up deadlines', value: flags.reminders, onChange: v => setFlag('reminders', v) },
        { icon: 'award', label: 'Tracking Streak', caption: 'A daily-logging streak on Home (shows at 3+ days)', value: flags.streak, onChange: v => setFlag('streak', v) },
      ],
    },
    {
      title: 'Smart capture',
      items: [
        { icon: 'cpu', label: 'Smart Categories', caption: 'Auto-suggest a category as you type the note', value: flags.smartCategory, onChange: v => setFlag('smartCategory', v) },
        { icon: 'map-pin', label: 'Location Tagging', caption: 'Tag transactions with where you spent', value: saveLocation, onChange: toggleSaveLocation },
        { icon: 'camera', label: 'Scan Receipts', caption: 'Snap a receipt to prefill the total automatically', value: flags.itemizedOcr, onChange: v => setFlag('itemizedOcr', v) },
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
                <View style={[styles.iconDot, { backgroundColor: c.tint + '22' }]}>
                  <Feather name={c.icon} size={16} color={c.tint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{c.label}</Text>
                  <Text style={styles.caption}>{c.caption}</Text>
                </View>
                <View style={[styles.coreBadge, { backgroundColor: c.tint + '1A', borderColor: c.tint }]}>
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
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 32 + space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm + 2, minHeight: 56 },
  rowOff: { opacity: 0.7 },
  iconDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  label: { ...type.body, color: colors.textPrimary },
  caption: { ...type.caption, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
  coreBadge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  coreBadgeText: { ...type.caption, fontFamily: 'Inter_600SemiBold' },
  footer: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.md, lineHeight: 18 },
});
