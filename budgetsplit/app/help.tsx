import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors } from '../src/constants/colors';
import { decor } from '../src/constants/palette';
import { type } from '../src/constants/typography';
import { space, radius, layout, shadow } from '../src/constants/layout';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';

type Item = { icon: keyof typeof Feather.glyphMap; color: string; title: string; body: string };
type Section = { title: string; illustration: { icons: Array<{ name: keyof typeof Feather.glyphMap; bg: string; color: string }> }; items: Item[] };

const SECTIONS: Section[] = [
  {
    title: 'Getting Started',
    illustration: { icons: [
      { name: 'plus-circle', bg: colors.accent + '22', color: colors.accent },
      { name: 'dollar-sign', bg: colors.income + '22', color: colors.income },
      { name: 'check-circle', bg: colors.settle + '22', color: colors.settle },
    ] },
    items: [
      { icon: 'edit-3', color: colors.accent, title: 'Adding your first expense', body: 'Tap the + button at the bottom \u2192 Quick Expense. Enter the amount (in rupees), pick a category like Food or Transport, optionally add a note, and save. It appears instantly on your dashboard and in the group.' },
      { icon: 'trending-up', color: colors.income, title: 'Adding income', body: 'Tap + \u2192 Income. Enter the amount, pick a source (Salary, Freelance, Business, etc.), set the date, and save. Income counts towards your net savings and is shown separately from expenses.' },
      { icon: 'list', color: decor.orange, title: 'Itemized bills', body: 'For restaurant bills or groceries with multiple items: Tap + \u2192 Itemized Bill. Add each item with quantity and price, assign items to people, add tax/tip, then review the per-person breakdown before saving.' },
      { icon: 'arrow-right-circle', color: colors.settle, title: 'Transfers', body: 'A transfer records money moving from one person to another without it counting as spending. Useful for repaying a friend or recording a settlement between group members.' },
    ],
  },
  {
    title: 'Groups & Splitting',
    illustration: { icons: [
      { name: 'users', bg: colors.coral + '22', color: colors.coral },
      { name: 'scissors', bg: colors.accent + '22', color: colors.accent },
      { name: 'check', bg: colors.income + '22', color: colors.income },
    ] },
    items: [
      { icon: 'users', color: colors.coral, title: 'Creating a group', body: 'Go to Groups tab \u2192 tap "New Group". Give it a name (e.g. "Me & GF", "Flatmates"), pick an icon and color, then add members. Your "Personal" group is always private \u2014 just you.' },
      { icon: 'scissors', color: colors.accent, title: 'Split types', body: 'When splitting a bill, choose: Equal (everyone pays the same), Exact (you enter each person\'s amount), Percentage (e.g. 60/40), Shares (ratios like 2:1:1), or Itemized (assign specific items to people).' },
      { icon: 'credit-card', color: colors.healthAmber, title: 'Multiple payers', body: 'If more than one person paid for something, tap "Who paid?" and enter each person\'s contribution. The app ensures total paid equals total shared \u2014 save is blocked until balanced.' },
      { icon: 'alert-circle', color: colors.healthRed, title: 'The balance rule', body: 'Every transaction must balance: total paid = total shared. If there\'s a mismatch, you\'ll see "\u20b9X unassigned" in red and the save button stays disabled. This prevents errors.' },
      { icon: 'refresh-cw', color: colors.settle, title: 'Settling up', body: 'Go to a group\'s Balances tab or the global Settle screen. BudgetSplit calculates the fewest payments needed. Tap "Mark as Paid" to record a settlement \u2014 balances update instantly.' },
      { icon: 'toggle-left', color: colors.accent, title: 'Simplify debts', body: 'The "Simplify" toggle (in group Balances) reduces multiple debts into minimum payments. Turn it off to see every individual who-owes-whom debt from each transaction.' },
      { icon: 'archive', color: colors.settle, title: 'Archiving groups', body: 'Swipe left on any group to archive it, or use the filter chips (Active/Archived) at the top. Archived groups keep all data but are hidden from your main view. Tap to restore anytime.' },
      { icon: 'droplet', color: decor.orange, title: 'Group theming', body: 'Each group gets a subtle color gradient header matching its chosen color. The tab underline and icon also reflect the group\'s identity for quick visual recognition.' },
    ],
  },
  {
    title: 'Budgets & Limits',
    illustration: { icons: [
      { name: 'target', bg: colors.income + '22', color: colors.income },
      { name: 'bar-chart-2', bg: colors.healthAmber + '22', color: colors.healthAmber },
      { name: 'zap', bg: colors.healthRed + '22', color: colors.healthRed },
    ] },
    items: [
      { icon: 'target', color: colors.income, title: 'Setting budgets', body: 'Open any group \u2192 Budget tab \u2192 add a budget for a category. Set a limit amount and cadence (Daily, Monthly, Yearly, or One-time). Monthly budgets reset each month automatically.' },
      { icon: 'activity', color: colors.healthAmber, title: 'Budget health', body: 'Each budget shows a colored progress bar: Green (under 80%), Amber (80\u2013100%), Red (over budget). The dashboard shows all groups\' budget health at a glance.' },
      { icon: 'refresh-cw', color: colors.accent, title: 'Resets each period', body: 'Budgets repeat on their cadence \u2014 your limit resets at the start of each period and unused amount does not carry over. A \u20b95000 monthly food budget is \u20b95000 again next month, whether you underspent or not.' },
      { icon: 'zap', color: colors.settle, title: 'Recommendations', body: 'The app spots patterns: categories exceeding budget, big month-over-month jumps, and projected overruns. You\'ll see actionable tips like "Food is 40% above last month".' },
    ],
  },
  {
    title: 'Recurring Transactions',
    illustration: { icons: [
      { name: 'repeat', bg: colors.accent + '22', color: colors.accent },
      { name: 'calendar', bg: colors.settle + '22', color: colors.settle },
      { name: 'pause-circle', bg: colors.healthAmber + '22', color: colors.healthAmber },
    ] },
    items: [
      { icon: 'repeat', color: colors.accent, title: 'Setting up', body: 'When adding an expense or income, tap "Set schedule". Choose a frequency (Daily, Weekly, Monthly) and set an end date. The transaction will repeat automatically \u2014 no need to re-enter each time.' },
      { icon: 'pause-circle', color: colors.healthAmber, title: 'Pause, resume & end', body: 'Go to a group \u2192 Recurring tab to see all active schedules. You can Pause (temporarily stop), Resume, or End any recurring rule. Past instances remain in your history.' },
      { icon: 'calendar', color: colors.settle, title: 'How they appear', body: 'Recurring transactions show up automatically in your transaction list and budget calculations for the relevant period. They\'re computed on-the-fly \u2014 nothing clutters your database.' },
    ],
  },
  {
    title: 'Reports & Export',
    illustration: { icons: [
      { name: 'pie-chart', bg: colors.coral + '22', color: colors.coral },
      { name: 'download', bg: colors.accent + '22', color: colors.accent },
      { name: 'file-text', bg: colors.settle + '22', color: colors.settle },
    ] },
    items: [
      { icon: 'bar-chart-2', color: colors.accent, title: 'Monthly reports', body: 'Reports tab shows income, expense, and net savings per group for any month. Navigate between months with arrows. Each group card shows top spending categories and budget utilization.' },
      { icon: 'pie-chart', color: colors.coral, title: 'Charts', body: 'See spending by category (donut chart) and 6-month spending trend (bar chart). On the dashboard, tap chart points to see exact values at that moment.' },
      { icon: 'trending-up', color: colors.settle, title: 'Spending forecast', body: 'For the current month, a line chart shows your daily cumulative spending plus a projected trend line to month-end. The forecast badge shows estimated total spend if you maintain this pace.' },
      { icon: 'award', color: colors.healthAmber, title: 'Year in review', body: 'At the bottom of Reports: total income, total spent, total saved for the year \u2014 plus your top category and biggest single expense. A quick yearly health check.' },
      { icon: 'download', color: colors.income, title: 'CSV export', body: 'Tap the CSV button in Reports to export all transactions for the current month as a spreadsheet. Opens the share sheet so you can AirDrop, email, or save to Files.' },
      { icon: 'file-text', color: colors.settle, title: 'PDF export', body: 'Tap the PDF button for a dark-themed formatted report with transactions table, summary cards, and color-coded amounts. Matches the app\'s visual style.' },
    ],
  },
  {
    title: 'Categories',
    illustration: { icons: [
      { name: 'tag', bg: colors.income + '22', color: colors.income },
      { name: 'grid', bg: decor.orange + '22', color: decor.orange },
      { name: 'plus', bg: colors.accent + '22', color: colors.accent },
    ] },
    items: [
      { icon: 'grid', color: decor.orange, title: 'Expense categories', body: '33 categories across 8 sections: Home & Living, Food, Transport, Bills & Utilities, Lifestyle, Health, Money & Growth, and Other. Each has a unique icon and color.' },
      { icon: 'briefcase', color: colors.income, title: 'Income sources', body: '11 income categories: Salary, Freelance, Business, Interest, Dividends, Rent Received, Bonus, Cashback, Refunds, Gifts Received, and Other Income.' },
      { icon: 'plus-circle', color: colors.accent, title: 'Custom categories', body: 'Settings \u2192 Categories lets you add new categories to any section, or delete ones you don\'t use. Custom categories appear in the picker when adding transactions.' },
      { icon: 'folder', color: colors.settle, title: 'Section organization', body: 'Categories are organized by section so the picker never feels overwhelming. Tap a section to expand it. Count badges show how many exist per section.' },
    ],
  },
  {
    title: 'Privacy & Security',
    illustration: { icons: [
      { name: 'lock', bg: colors.accent + '22', color: colors.accent },
      { name: 'eye-off', bg: colors.settle + '22', color: colors.settle },
      { name: 'shield', bg: colors.income + '22', color: colors.income },
    ] },
    items: [
      { icon: 'lock', color: colors.accent, title: 'Face ID / Touch ID', body: 'Enable biometric lock in Settings \u2192 Privacy. The app requires Face ID every time you open it, preventing others from seeing your finances.' },
      { icon: 'eye-off', color: colors.settle, title: 'Privacy screen', body: 'When you switch apps, your financial data is hidden with a blur overlay. On by default \u2014 toggle in Settings \u2192 Privacy & Security.' },
      { icon: 'map-pin', color: colors.healthAmber, title: 'Location tagging', body: 'Optionally tag transactions with where you made them. OFF by default, explicitly enable in Settings. Location data never leaves your device.' },
      { icon: 'wifi-off', color: colors.income, title: 'Fully offline', body: 'BudgetSplit makes zero network calls. All data lives only on your device. No accounts, no cloud, no tracking. Your money data is truly private.' },
    ],
  },
  {
    title: 'Dashboard',
    illustration: { icons: [
      { name: 'home', bg: colors.accent + '22', color: colors.accent },
      { name: 'trending-up', bg: colors.income + '22', color: colors.income },
      { name: 'layers', bg: colors.coral + '22', color: colors.coral },
    ] },
    items: [
      { icon: 'clock', color: colors.accent, title: 'Today / Month / Year', body: 'Three time views on the dashboard. "Today" shows daily spend, "Month" is the current month summary, "Year" gives the full picture. Charts and totals update per view.' },
      { icon: 'pie-chart', color: colors.coral, title: 'Spending by category', body: 'The donut chart breaks down spending visually. Tap a segment to focus. The legend shows percentage and rupee amount for each category.' },
      { icon: 'trending-up', color: colors.income, title: 'Spending trend', body: 'The area chart shows spending over time. Drag along the chart to see values at any point. Compare against previous periods.' },
      { icon: 'credit-card', color: colors.healthAmber, title: 'Owe / Owed', body: 'Total balance across all groups at a glance. Tap to go to global Settle Up where you can see and record payments.' },
      { icon: 'layers', color: colors.settle, title: 'Group health', body: 'Each group shows a budget progress bar. Green = on track, amber = getting close, red = over budget. Tap any group to open its detail.' },
    ],
  },
  {
    title: 'Tips & Tricks',
    illustration: { icons: [
      { name: 'star', bg: colors.healthAmber + '22', color: colors.healthAmber },
      { name: 'hash', bg: decor.orange + '22', color: decor.orange },
      { name: 'clock', bg: colors.settle + '22', color: colors.settle },
    ] },
    items: [
      { icon: 'camera', color: decor.orange, title: 'Scan receipts', body: 'Tap the camera icon in the top-right when adding an expense. Take a photo of your receipt \u2014 the app will try to extract the total amount automatically. Works offline with on-device processing.' },
      { icon: 'dollar-sign', color: colors.accent, title: 'Currency', body: 'Amounts are in Indian Rupees (₹). Multi-currency support is coming in a future update.' },
      { icon: 'map-pin', color: colors.coral, title: 'Map link', body: 'If location tagging is on, transactions show their location. Tap the location row in transaction detail to open Apple Maps at that exact spot.' },
      { icon: 'hash', color: colors.settle, title: 'Tags', body: 'Add #tags to any transaction (e.g. #trip, #wedding). Tags work across groups \u2014 filter by tag in Reports to see all related spending regardless of group.' },
      { icon: 'paperclip', color: colors.income, title: 'Receipt photos', body: 'Attach a photo to any transaction. Tap the camera icon when adding an expense to snap or pick a receipt image for your records.' },
      { icon: 'edit', color: colors.settle, title: 'Notes', body: 'Add context to any transaction (e.g. "Rajesh\'s birthday dinner"). Notes are searchable in the transaction filter bar.' },
      { icon: 'calendar', color: colors.healthAmber, title: 'Any date', body: 'Transactions aren\'t limited to today. Set any past or future date. Backdate a forgotten expense or pre-record a known payment.' },
      { icon: 'clock', color: colors.accent, title: 'Audit history', body: 'Every change is recorded. Open any transaction to see its complete edit history: created, modified, deleted \u2014 with timestamps.' },
      { icon: 'check-circle', color: colors.income, title: 'Budget what matters', body: 'Set limits on only 3\u20135 categories that tend to overrun (food, cabs, eating out). You\'ll get sharper alerts instead of noise.' },
    ],
  },
];

export default function HelpScreen() {
  const router = useRouter();
  const [openSection, setOpenSection] = useState<string | null>('Getting Started');
  const [openItem, setOpenItem] = useState<string | null>('Adding your first expense');

  return (
    <View style={styles.container}>
      <ScreenHeader title="Help & Guide" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {SECTIONS.map(section => {
          const isExpanded = openSection === section.title;
          return (
            <View key={section.title}>
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => setOpenSection(isExpanded ? null : section.title)}
                accessibilityRole="button"
              >
                <View style={styles.illustrationRow}>
                  {section.illustration.icons.map((ic, i) => (
                    <View key={i} style={[styles.illustrationDot, { backgroundColor: ic.bg }]}>
                      <Feather name={ic.name} size={14} color={ic.color} />
                    </View>
                  ))}
                </View>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.card}>
                  {section.items.map((item, i) => {
                    const isItemOpen = openItem === item.title;
                    return (
                      <View key={item.title} style={[i < section.items.length - 1 && styles.rowBorder]}>
                        <TouchableOpacity
                          style={styles.row}
                          onPress={() => setOpenItem(isItemOpen ? null : item.title)}
                          accessibilityRole="button"
                        >
                          <View style={[styles.iconDot, { backgroundColor: item.color + '22' }]}>
                            <Feather name={item.icon} size={15} color={item.color} />
                          </View>
                          <Text style={styles.rowTitle}>{item.title}</Text>
                          <Feather name={isItemOpen ? 'minus' : 'plus'} size={16} color={colors.textMuted} />
                        </TouchableOpacity>
                        {isItemOpen && <Text style={styles.body}>{item.body}</Text>}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.md, paddingBottom: space.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md, paddingHorizontal: space.xs },
  illustrationRow: { flexDirection: 'row', marginRight: space.xs },
  illustrationDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: -6 },
  sectionTitle: { ...type.subheading, color: colors.textPrimary, flex: 1 },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, ...shadow.sm },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm + 2 },
  iconDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { ...type.body, color: colors.textPrimary, flex: 1 },
  body: { ...type.body, color: colors.textSecondary, lineHeight: 22, paddingBottom: space.md, paddingLeft: 30 + space.sm },
});
