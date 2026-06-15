import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, radius, layout, shadow } from '../src/constants/layout';
import { ScreenHeader } from '../src/components/ScreenHeader';

type Item = { icon: keyof typeof Feather.glyphMap; title: string; body: string };
type Section = { title: string; items: Item[] };

const SECTIONS: Section[] = [
  {
    title: 'Getting started',
    items: [
      { icon: 'edit-3', title: 'Track an expense', body: 'Tap + → Expense. Enter the amount, pick a category and date, add a note, and save. It shows up instantly in your dashboard and group.' },
      { icon: 'target', title: 'Create a budget', body: 'Open a group → Budget tab → Create budget. Give a category a limit and a cadence (one-time, daily, monthly or yearly). Monthly and yearly budgets roll forward automatically.' },
      { icon: 'users', title: 'Create a group', body: 'Groups tab → + → New Group. Add people, then split any bill. Your "Personal" space is always just you.' },
      { icon: 'repeat', title: 'Transfers & settlements', body: 'A transfer moves money between two people. Settle up records a repayment — the outstanding amount is pre-filled and you can pay it partially.' },
    ],
  },
  {
    title: 'Understanding analytics',
    items: [
      { icon: 'bar-chart-2', title: 'Charts', body: 'The dashboard shows spending by category (donut) and over time (bars). Tap a bar to see its exact value, and switch Today / Month / Year to compare periods.' },
      { icon: 'pie-chart', title: 'Budget insights', body: 'Each group\'s Budget tab shows how much of every budget is used, which are near their limit, and which are over — with a clear health bar.' },
      { icon: 'alert-triangle', title: 'Recommendations', body: 'BudgetSplit calls out real patterns: categories over budget, ones about to exceed, big increases vs last month, and a month-end projection.' },
    ],
  },
  {
    title: 'Money tips',
    items: [
      { icon: 'check-circle', title: 'Budget what matters', body: 'Don\'t budget every category — set limits on the few that tend to overrun (food, eating out, cab). You\'ll get sharper, more useful alerts.' },
      { icon: 'trending-down', title: 'Watch the trend', body: 'The "vs last month" figure matters more than any single number. A steady downward trend in a category is real progress.' },
    ],
  },
];

export default function HelpScreen() {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>('Track an expense');

  return (
    <View style={styles.container}>
      <ScreenHeader title="Help & Guide" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {SECTIONS.map(section => (
          <View key={section.title} style={{ gap: space.sm }}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.card}>
              {section.items.map((item, i) => {
                const isOpen = open === item.title;
                return (
                  <View key={item.title} style={[i < section.items.length - 1 && styles.rowBorder]}>
                    <TouchableOpacity
                      style={styles.row}
                      onPress={() => setOpen(isOpen ? null : item.title)}
                      accessibilityRole="button"
                    >
                      <View style={styles.iconDot}>
                        <Feather name={item.icon} size={16} color={colors.accent} />
                      </View>
                      <Text style={styles.rowTitle}>{item.title}</Text>
                      <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                    {isOpen && <Text style={styles.body}>{item.body}</Text>}
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
  scroll: { padding: layout.screenPaddingH, gap: space.lg, paddingBottom: 60 },
  sectionTitle: { ...type.label, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, ...shadow.sm },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  iconDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { ...type.body, color: colors.textPrimary, flex: 1, fontFamily: 'Inter_600SemiBold' },
  body: { ...type.body, color: colors.textSecondary, lineHeight: 20, paddingBottom: space.md, paddingLeft: 0 },
});
