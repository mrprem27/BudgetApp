import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, radius, layout, shadow } from '../src/constants/layout';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { useFeatureFlags } from '../src/components/system/FeatureFlagsProvider';
import { AUTO_SWEEP_KEY } from '../src/db/queries/savings';
import { haptic } from '../src/lib/haptics';
import type { FeatureKey } from '../src/lib/featureFlags';

type Row =
  | { kind: 'flag'; key: FeatureKey; icon: keyof typeof Feather.glyphMap; label: string; caption: string }
  | { kind: 'store'; key: string; icon: keyof typeof Feather.glyphMap; label: string; caption: string };

const SECTIONS: { title: string; rows: Row[] }[] = [
  {
    title: 'Dashboard',
    rows: [
      { kind: 'flag', key: 'dashboardCash', icon: 'dollar-sign', label: 'Cash available', caption: 'Your liquid, spendable money card' },
      { kind: 'flag', key: 'dashboardBudget', icon: 'shield', label: 'Budget summary', caption: 'Budget-used rollup on the dashboard' },
      { kind: 'flag', key: 'dashboardDonut', icon: 'pie-chart', label: 'Where it went', caption: 'Category spending donut' },
      { kind: 'flag', key: 'dashboardBalances', icon: 'users', label: 'Balances', caption: 'Who you owe / owes you, with Settle up' },
      { kind: 'flag', key: 'dashboardSavings', icon: 'target', label: 'Savings summary', caption: 'Pool · available · goals card' },
      { kind: 'flag', key: 'dashboardInsights', icon: 'bar-chart-2', label: 'Top insights', caption: 'Cross-group spending insights' },
    ],
  },
  {
    title: 'Reports',
    rows: [
      { kind: 'flag', key: 'reportsDonut', icon: 'pie-chart', label: 'Spending by category', caption: 'Interactive donut on Reports' },
      { kind: 'flag', key: 'reportsTrend', icon: 'bar-chart-2', label: '6-month trend', caption: 'Monthly spending bars (tap a wedge to filter)' },
      { kind: 'flag', key: 'forecast', icon: 'trending-up', label: 'Spending forecast', caption: 'Month-end projection line' },
    ],
  },
  {
    title: 'Insights',
    rows: [
      { kind: 'flag', key: 'budgetInsights', icon: 'pie-chart', label: 'Budget insights', caption: 'Analytics & projections on group budgets' },
      { kind: 'flag', key: 'savingsInsights', icon: 'target', label: 'Savings insights', caption: 'Opportunity-cost nudges on the Money tab' },
    ],
  },
  {
    title: 'Modules',
    rows: [
      { kind: 'flag', key: 'smartCategory', icon: 'zap', label: 'Smart categories', caption: 'Type a title (e.g. "Uber") and the category auto-fills — no picking' },
      { kind: 'flag', key: 'itemizedOcr', icon: 'list', label: 'Itemized bills', caption: 'Split a bill line by line' },
      { kind: 'flag', key: 'recurring', icon: 'refresh-cw', label: 'Recurring transactions', caption: 'Auto-repeat schedules for expenses & income' },
    ],
  },
  {
    title: 'Automation',
    rows: [
      { kind: 'store', key: AUTO_SWEEP_KEY, icon: 'download-cloud', label: 'Auto-sweep leftover budget', caption: 'Move unspent budget into savings at month end (lowers cash available)' },
    ],
  },
];

export default function FeaturesScreen() {
  const router = useRouter();
  const { flags, setFlag } = useFeatureFlags();
  const [store, setStore] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      setStore({ [AUTO_SWEEP_KEY]: (await AsyncStorage.getItem(AUTO_SWEEP_KEY)) === 'true' });
    })();
  }, []);

  async function toggleStore(key: string, v: boolean) {
    haptic.selection();
    setStore(s => ({ ...s, [key]: v }));
    await AsyncStorage.setItem(key, v ? 'true' : 'false');
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Feature management" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.intro}>Turn parts of the app on or off so it shows only what you use.</Text>
        {SECTIONS.map(section => (
          <View key={section.title}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.card}>
              {section.rows.map((r, i) => {
                const value = r.kind === 'flag' ? flags[r.key] : !!store[r.key];
                const onChange = (v: boolean) => (r.kind === 'flag' ? setFlag(r.key, v) : toggleStore(r.key, v));
                return (
                  <View key={r.label}>
                    {i > 0 && <View style={styles.divider} />}
                    <View style={styles.row}>
                      <View style={styles.iconDot}><Feather name={r.icon} size={16} color={colors.accent} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.label}>{r.label}</Text>
                        <Text style={styles.caption}>{r.caption}</Text>
                      </View>
                      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent, false: colors.bgMuted }} thumbColor={colors.textPrimary} accessibilityLabel={r.label} />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, paddingBottom: space.lg, gap: space.xs },
  intro: { ...type.body, color: colors.textSecondary, marginBottom: space.sm },
  sectionTitle: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: space.md, marginBottom: space.xs, marginLeft: space.xs },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, ...shadow.sm },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 32 + space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm + 2, minHeight: 56 },
  iconDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  label: { ...type.body, color: colors.textPrimary },
  caption: { ...type.caption, color: colors.textMuted, marginTop: 2 },
});
