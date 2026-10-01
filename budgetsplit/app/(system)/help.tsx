import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Share, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, layout, alpha } from '../../src/theme';
import { decor } from '../../src/constants/palette';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { IconCircle } from '../../src/components/ui/IconCircle';
import { helpBullets } from '../../src/lib/helpBullets';
import { SectionCard } from '../../src/components/ui/SectionCard';
import { Divider } from '../../src/components/ui/Divider';
import { Collapse } from '../../src/components/ui/anim/Collapse';
import { backOr } from '../../src/lib/nav';
import { Card } from '../../src/components/ui/Card';
import { ListRow } from '../../src/components/ui/ListRow';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { Input } from '../../src/components/ui/Input';
import { PrimaryButton } from '../../src/components/ui/PrimaryButton';
import { AppSwitch } from '../../src/components/ui/AppSwitch';
import { buildFeedbackReport } from '../../src/lib/feedbackReport';
import { loadTimeSummary } from '../../src/lib/loadTimes';
import { apiLog } from '../../src/lib/apiLog';
import appJson from '../../app.json';

type Item = { icon: keyof typeof Feather.glyphMap; color: string; title: string; body: string };
type Section = { title: string; illustration: { icons: Array<{ name: keyof typeof Feather.glyphMap; bg: string; color: string }> }; items: Item[] };

/** One bullet per sentence; a single sentence stays a plain line. */
function HelpBody({ body }: { body: string }) {
  const bullets = helpBullets(body);
  if (bullets.length < 2) return <Text style={styles.body}>{body}</Text>;
  return (
    <View style={styles.bullets}>
      {bullets.map((b, i) => (
        <View key={i} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>{'\u2022'}</Text>
          <Text style={styles.bulletText}>{b}</Text>
        </View>
      ))}
    </View>
  );
}

const SECTIONS: Section[] = [
  {
    title: 'Getting Started',
    illustration: { icons: [
      { name: 'plus-circle', bg: alpha(colors.accent, 13), color: colors.accent },
      { name: 'dollar-sign', bg: alpha(colors.income, 13), color: colors.income },
      { name: 'check-circle', bg: alpha(colors.settle, 13), color: colors.settle },
    ] },
    items: [
      { icon: 'edit-3', color: colors.accent, title: 'Adding your first expense', body: 'Tap the + button at the bottom. Enter the amount, pick a category like Food or Transport, optionally add a note, and save. It shows on Home and in the group straight away.' },
      { icon: 'trending-up', color: colors.income, title: 'Adding income', body: 'Tap + and choose Income at the top. Enter the amount, pick a source (Salary, Freelance, Business, etc.), set the date, and save. Income is shown separately from spending.' },
      { icon: 'list', color: decor.orange, title: 'Itemized bills', body: 'For a restaurant bill or groceries with several items: tap +, then Split by items. Add each item with quantity and price, assign items to people, add tax or tip, then review each person’s share before saving.' },
      { icon: 'camera', color: decor.orange, title: 'Scan a receipt', body: 'On an itemized bill, tap “Scan receipt” to snap or pick a photo and have the line items read out of it. You always review the result and untick anything wrong before it’s added, nothing is saved from a scan you don’t confirm. Reading is done by a cloud OCR service, so the photo leaves your device for that one request; it isn’t stored there.' },
      { icon: 'arrow-right-circle', color: colors.settle, title: 'Transfers', body: 'A transfer records money moving without it counting as spending: repaying a friend, a settle-up in a group, or moving money between your own bank, cash, wallet and investments.' },
      { icon: 'edit', color: colors.settle, title: 'Notes', body: 'Add context to any transaction (e.g. "Rajesh\'s birthday dinner"). Notes are searchable from the filter bar on any transaction list.' },
      { icon: 'calendar', color: colors.healthAmber, title: 'Backdate or pre-date anything', body: 'Nothing is pinned to today. Set any past date for an expense you forgot, or a future one for a payment you already know about.' },
    ],
  },
  {
    title: 'Voice Entry',
    illustration: { icons: [
      { name: 'mic', bg: alpha(colors.accent, 13), color: colors.accent },
      { name: 'zap', bg: alpha(colors.income, 13), color: colors.income },
      { name: 'inbox', bg: alpha(colors.settle, 13), color: colors.settle },
    ] },
    items: [
      { icon: 'mic', color: colors.accent, title: 'Say it instead of typing it', body: 'On the Add screen, tap the microphone on your keyboard and say what you spent. BudgetSplit fills in the amount, the category and the date from the words, and you check it before saving. No setup.' },
      { icon: 'repeat', color: colors.accent, title: 'How it knows which kind you meant', body: 'Words like salary, refund, bonus or cashback mean money in. Naming someone you already have in the app, alongside paid, gave or sent, means a transfer, all three have to be there, so “paid 450 for groceries” stays a spend and “dinner with Riya” stays a shared one. Everything else is an expense. If it picks wrong, the kind pills sit at the top of the Add screen.' },
      { icon: 'message-circle', color: colors.accent, title: 'What to say', body: 'The amount and what it was for, in any order: “four fifty groceries”, “twelve hundred rent yesterday”, “chai dus rupaye”. Numbers work spoken or as digits, and lakh and thousand are understood, as are dus, do sau, pandrah sau and bees hazaar. You can add a relative date, today, yesterday, kal, parso, last Friday, three days ago, but not a spoken calendar date; use the date picker for those.' },
      { icon: 'edit', color: colors.accent, title: 'Where your words end up', body: 'Say only an amount and a category (“four fifty groceries”) and nothing else is stored. Say more (“450 zomato biryani”) and the extra words become the title, which is what works out the category. Hesitation is thrown away rather than filed, “ok so I paid like 1200 for dinner” is titled just “dinner”. A long phrase titles itself with the first few words and puts the rest in the note, so nothing you said is lost.' },
      { icon: 'lock', color: colors.textSecondary, title: 'Where your words go', body: 'Nowhere. Your phone turns speech into text on the device, and the parsing, pulling out the amount, the category and the date, happens inside BudgetSplit with no network call. You can put the phone in airplane mode and it still works, which is the simplest proof.' },
      { icon: 'alert-circle', color: colors.healthAmber, title: 'What it will get wrong', body: 'Hinglish is handled properly, chai, kirana, sabzi, khana, bijli, kiraya, doodh and dawai all land in the right category, but a long code-mixed sentence will still misfire sometimes, which is why the amount and category are always there to check before you save. Itemized bills need the normal screens.' },
    ],
  },
  {
    title: 'Your Home Screen',
    illustration: { icons: [
      { name: 'home', bg: alpha(colors.accent, 13), color: colors.accent },
      { name: 'trending-up', bg: alpha(colors.income, 13), color: colors.income },
      { name: 'layers', bg: alpha(colors.coral, 13), color: colors.coral },
    ] },
    items: [
      { icon: 'clock', color: colors.accent, title: 'Today / Month / Year', body: 'Three time views. "Today" is what you’ve spent since midnight, "Month" is the current month, "Year" is the full picture. Every chart and total below re-reads for the view you pick.' },
      { icon: 'pie-chart', color: colors.coral, title: 'Spending by category', body: 'The donut shows where the money went. Tap a segment to focus it; the legend gives the percentage and the rupee amount for each category.' },
      { icon: 'trending-up', color: colors.income, title: 'Spending trend', body: 'The area chart plots spending over time. Drag along it to read the exact value at any point.' },
      { icon: 'credit-card', color: colors.healthAmber, title: 'Owe / Owed', body: 'What you owe and what you’re owed, netted across every group. Tap it to open Settle Up and clear it.' },
      { icon: 'layers', color: colors.settle, title: 'Group health', body: 'Each group shows a budget bar, green on track, amber getting close, red over. Tap one to open it.' },
    ],
  },
  {
    title: 'Groups & Splitting',
    illustration: { icons: [
      { name: 'users', bg: alpha(colors.coral, 13), color: colors.coral },
      { name: 'scissors', bg: alpha(colors.accent, 13), color: colors.accent },
      { name: 'check', bg: alpha(colors.income, 13), color: colors.income },
    ] },
    items: [
      { icon: 'users', color: colors.coral, title: 'Creating a group', body: 'Go to Groups tab \u2192 tap "New Group". Give it a name (e.g. "Me & GF", "Flatmates"), pick an icon and color, then add members. Your "Personal" group is always private, just you.' },
      { icon: 'scissors', color: colors.accent, title: 'Split types', body: 'When splitting a bill, choose: Equal (everyone pays the same), Exact (you enter each person\'s amount), Percent (e.g. 60/40), or Shares (ratios like 2:1:1). A person set to 0 is simply not included. For restaurant-style bills, the separate Itemized Bill entry assigns specific items to people instead of splitting one total.' },
      { icon: 'credit-card', color: colors.healthAmber, title: 'Multiple payers', body: 'If more than one person paid for something, tap "Who paid?" and enter each person\'s contribution. The app ensures total paid equals total shared, save is blocked until balanced.' },
      { icon: 'alert-circle', color: colors.healthRed, title: 'The balance rule', body: 'Every transaction must balance: total paid = total shared. If there\'s a mismatch, you\'ll see "\u20b9X unassigned" in red and the save button stays disabled. This prevents errors.' },
      { icon: 'archive', color: colors.settle, title: 'Archiving a group', body: 'Swipe left on any group to archive it, or use the Active / Archived chips at the top. An archived group keeps all its data but disappears from your main view. Tap to restore it anytime.' },
      { icon: 'droplet', color: decor.orange, title: 'Group colours', body: 'Each group gets a header gradient in the colour you picked, and its tab underline and icon match, so you can tell at a glance which group you\u2019re looking at.' },
    ],
  },
  {
    title: 'Settling Up & Paying',
    illustration: { icons: [
      { name: 'refresh-cw', bg: alpha(colors.settle, 13), color: colors.settle },
      { name: 'smartphone', bg: alpha(colors.accent, 13), color: colors.accent },
      { name: 'maximize', bg: alpha(colors.income, 13), color: colors.income },
    ] },
    items: [
      { icon: 'refresh-cw', color: colors.settle, title: 'Who pays whom', body: 'Open a group\u2019s Members tab, or the global Settle screen. BudgetSplit works out the fewest payments that clear everyone, then you record each one. Balances update the moment you save.' },
      { icon: 'toggle-left', color: colors.accent, title: 'Simplify debts', body: 'On a group\u2019s Members tab, the Simplify switch collapses a tangle of debts into the smallest number of payments, so A pays C once instead of A\u2192B\u2192C. Turn it off to see every individual who-owes-whom debt exactly as it arose.' },
      { icon: 'smartphone', color: colors.accent, title: 'Paying from your UPI app', body: 'If the person you\u2019re paying has a UPI ID saved, you\u2019ll see "Pay \u20b9X via UPI". It opens your own UPI app with the payee and amount already filled in, the money moves straight between your two bank accounts. BudgetSplit never touches it.' },
      { icon: 'alert-circle', color: colors.healthAmber, title: 'Apps that only open', body: 'PhonePe, Paytm, Amazon Pay and WhatsApp refuse payments started by another app, so we don\u2019t send them one, they just open and you enter the payment there. The row says "enter it there" so you know before you tap. CRED and Airtel arrive filled in. Nothing is wasted either way: the expense is saved first.' },
      { icon: 'camera', color: colors.coral, title: 'Scan & Pay', body: 'Long-press the + button to scan any UPI QR, a shop\u2019s or a friend\u2019s. It reads the payee, the amount if the code carries one, and the shop\u2019s category, then hands the payment to your UPI app and saves the expense to your review inbox.' },
      { icon: 'credit-card', color: colors.income, title: 'Your own UPI ID', body: 'Settings \u2192 Getting paid \u2192 Your UPI ID. Needed only so others can pay you, it goes into your QR code. If you are signed in, it is kept on your account with the rest of your profile.' },
      { icon: 'maximize', color: colors.income, title: 'Getting paid with a QR', body: 'When someone owes you, tap "Show QR to get \u20b9X" and they scan it with any UPI app, including the four above, because their own camera starts the payment. You can also show a plain code with no amount from Settings \u2192 Show my UPI QR.' },
      { icon: 'check-circle', color: colors.textSecondary, title: 'Why you still tap Save', body: 'BudgetSplit never learns whether a payment actually went through, it only opens someone else\u2019s app. So it asks rather than assumes. That\u2019s why nothing is recorded until you say it happened.' },
    ],
  },
  {
    title: 'Budgets & Limits',
    illustration: { icons: [
      { name: 'target', bg: alpha(colors.income, 13), color: colors.income },
      { name: 'bar-chart-2', bg: alpha(colors.healthAmber, 13), color: colors.healthAmber },
      { name: 'zap', bg: alpha(colors.healthRed, 13), color: colors.healthRed },
    ] },
    items: [
      { icon: 'target', color: colors.income, title: 'Setting budgets', body: 'Open any group \u2192 Budget tab \u2192 add a budget for a category. Set a limit amount and cadence (Daily, Monthly or Yearly). Monthly budgets reset each month automatically.' },
      { icon: 'activity', color: colors.healthAmber, title: 'Budget health', body: 'Each budget shows a colored progress bar: Green (under 80%), Amber (80\u2013100%), Red (over budget). The dashboard shows all groups\' budget health at a glance.' },
      { icon: 'refresh-cw', color: colors.accent, title: 'Resets each period', body: 'Budgets repeat on their cadence, your limit resets at the start of each period and unused amount does not carry over. A \u20b95000 monthly food budget is \u20b95000 again next month, whether you underspent or not.' },
      { icon: 'zap', color: colors.settle, title: 'Recommendations', body: 'The app spots patterns: categories exceeding budget, big month-over-month jumps, and projected overruns. You\'ll see actionable tips like "Food is 40% above last month".' },
    ],
  },
  {
    title: 'Savings & Goals',
    illustration: { icons: [
      { name: 'target', bg: alpha(colors.accent, 13), color: colors.accent },
      { name: 'dollar-sign', bg: alpha(colors.income, 13), color: colors.income },
      { name: 'trending-up', bg: alpha(colors.settle, 13), color: colors.settle },
    ] },
    items: [
      { icon: 'dollar-sign', color: colors.income, title: 'Cash available', body: 'The Money tab shows what you can actually spend right now: income received, minus expenses you’ve paid, minus what you’ve set aside in savings. One honest number at the top.' },
      { icon: 'credit-card', color: colors.accent, title: 'Total Money', body: 'The Money tab leads with what you can spend right now, cash only. Below it: your assets (gold, a flat, an FD, a fund), which count towards net worth but are not spendable, and Credit available (limit − used), which is borrowing, not money. Tap the card to edit your cash and credit, or open Assets to add one. Credit is never spent automatically.' },
      { icon: 'help-circle', color: colors.textSecondary, title: 'Paid from not set', body: 'Entries saved without a Paid from add up to their own line on Money. Tap it to move any part of that amount to Bank, Cash or Wallet, the same way you move money between them.' },
      { icon: 'target', color: colors.settle, title: 'Goals', body: 'Create goals with a target amount, an Emergency / Need / Want priority and an icon. Goals are grouped into those three sections; drag within a section to set which goal in it fills up first. Fund a goal directly from your Cash available (swipe or enter an amount). Each shows a progress bar, what’s left, and, if you set an auto-save amount, an estimated “done by” date. Withdrawing returns money to your cash.' },
      { icon: 'refresh-cw', color: colors.healthAmber, title: 'Auto-save', body: 'Give a goal a fixed amount and cadence (e.g. ₹5,000 monthly) and the app funds it from your Cash available on schedule, Emergency goals first, then Need, then Want, in your drag order within each.' },
      { icon: 'alert-triangle', color: colors.expense, title: 'Overspending', body: 'If Cash available goes negative, the app asks before touching your goals. It names which Want goals, then Need goals, could cover the shortfall, and nothing moves unless you choose Use savings. Undo is there afterwards. Emergency and Locked goals, and your assets, are never touched.' },
      { icon: 'zap', color: colors.income, title: 'Savings insights', body: 'The Ways to save tile on Insights compares your own habits with your goals (how a recurring expense measures against one, say). Switch Insights off in Settings → Feature management if you would rather not see them.' },
    ],
  },
  {
    title: 'Recurring Transactions',
    illustration: { icons: [
      { name: 'repeat', bg: alpha(colors.accent, 13), color: colors.accent },
      { name: 'calendar', bg: alpha(colors.settle, 13), color: colors.settle },
      { name: 'pause-circle', bg: alpha(colors.healthAmber, 13), color: colors.healthAmber },
    ] },
    items: [
      { icon: 'repeat', color: colors.accent, title: 'Setting up', body: 'When adding an expense or income, flip the "Repeat this" switch. Choose a frequency (Daily, Weekly, Monthly or a custom interval) and an optional end date. It then repeats automatically, no need to re-enter each time.' },
      { icon: 'calendar', color: colors.settle, title: 'Where they show up', body: 'A recurring entry appears in your transaction list and counts towards budgets for every period it falls in, without you doing anything. It is worked out as needed rather than stored, so a long-running schedule never clutters your history.' },
      { icon: 'pause-circle', color: colors.healthAmber, title: 'Pause, resume & end', body: 'Open a group \u2192 Recurring tab to manage every schedule. Pause to temporarily stop generating new ones, Resume to continue, or End to stop for good. Past occurrences always stay in your history.' },
      { icon: 'skip-forward', color: colors.settle, title: 'Skip one occurrence', body: 'Need to skip just the next instance (a month you didn\u2019t pay rent, say)? Tap Skip on the Recurring tab. Only that single occurrence is dropped, the schedule continues normally afterwards.' },
      { icon: 'edit-2', color: colors.income, title: 'Edit going forward', body: 'Tap Edit to change the amount, category or frequency from the next occurrence onward. Past entries are never rewritten, the app keeps the old run intact and starts a new one with your changes.' },
    ],
  },
  {
    title: 'Reports & Export',
    illustration: { icons: [
      { name: 'pie-chart', bg: alpha(colors.coral, 13), color: colors.coral },
      { name: 'download', bg: alpha(colors.accent, 13), color: colors.accent },
      { name: 'file-text', bg: alpha(colors.settle, 13), color: colors.settle },
    ] },
    items: [
      { icon: 'grid', color: colors.accent, title: 'Insights', body: 'Each tile is one question about this month: what is safe to spend, what needs attention, where the month is heading. Tap a tile to see what is behind its figure, and the (i) inside for how it is worked out.' },
      { icon: 'bar-chart-2', color: colors.accent, title: 'Monthly reports', body: 'Reports, opened from Insights, shows income, spending and net per group for any month. Move between months with the arrows. Each group card shows its top categories and how much of its budget is used.' },
      { icon: 'pie-chart', color: colors.coral, title: 'Charts', body: 'See spending by category (donut chart) and 6-month spending trend (bar chart). On the dashboard, tap chart points to see exact values at that moment.' },
      { icon: 'hash', color: decor.orange, title: 'Tags', body: 'Add #tags to any transaction (e.g. #trip, #wedding). Tags cut across groups, filter by one in Reports to see everything related, wherever you logged it.' },
      { icon: 'trending-up', color: colors.settle, title: 'Spending forecast', body: 'On Insights, the Month-end forecast tile shows your spending so far this month and a projected line to month-end, once there is enough of the month to project from.' },
      { icon: 'award', color: colors.healthAmber, title: 'Year in review', body: 'At the bottom of Reports: total income, total spent, the net for the year, plus your top category and biggest single expense. A quick yearly health check.' },
      { icon: 'download', color: colors.income, title: 'CSV export', body: 'Tap the CSV button in Reports to export all transactions for the current month as a spreadsheet. Opens the share sheet so you can AirDrop, email, or save to Files.' },
      { icon: 'file-text', color: colors.settle, title: 'PDF export', body: 'Tap the PDF button for a printable statement: what you spent, what came in, the net and what you moved, each against the month before; where it went and when; each group; then every entry.' },
    ],
  },
  {
    title: 'Categories',
    illustration: { icons: [
      { name: 'tag', bg: alpha(colors.income, 13), color: colors.income },
      { name: 'grid', bg: alpha(decor.orange, 13), color: decor.orange },
      { name: 'plus', bg: alpha(colors.accent, 13), color: colors.accent },
    ] },
    items: [
      { icon: 'grid', color: decor.orange, title: 'Expense categories', body: 'Grouped into sections: Home & Living, Food, Transport, Bills & Utilities, Lifestyle, Health, Money & Growth, and Other. Each has a unique icon and color.' },
      { icon: 'briefcase', color: colors.income, title: 'Income sources', body: 'Income has its own categories: Salary, Freelance, Business, Interest, Dividends, Rent Received, Bonus, Cashback, Refunds, Gifts Received, and Other Income.' },
      { icon: 'plus-circle', color: colors.accent, title: 'Custom categories', body: 'Settings \u2192 Categories lets you add new categories to any section, or delete ones you don\'t use. Custom categories appear in the picker when adding transactions.' },
      { icon: 'folder', color: colors.settle, title: 'How the picker is organised', body: 'Categories sit inside sections so the picker never shows you everything at once. Tap a section to open it; the badge tells you how many are inside.' },
    ],
  },
  {
    title: 'Account, backup and sync',
    illustration: { icons: [
      { name: 'user', bg: alpha(colors.accent, 13), color: colors.accent },
      { name: 'download', bg: alpha(colors.income, 13), color: colors.income },
      { name: 'refresh-cw', bg: alpha(colors.settle, 13), color: colors.settle },
    ] },
    items: [
      { icon: 'help-circle', color: colors.accent, title: 'Three different things, and they are easy to mix up', body: 'An ACCOUNT keeps a copy of everything you do in the app, and lets another person\u2019s phone know that a name in their app is you. SYNC is what keeps that copy, and your shared groups, up to date; it runs whenever you are signed in. A BACKUP is a file you make by hand and keep yourself, separate from the account. You can use the app with none of the three.' },
      { icon: 'mail', color: colors.accent, title: 'Signing in, no password', body: 'Settings \u2192 your profile card, enter your email, and we send you a link. Tapping it signs you in; the email also prints the code in case you opened the mail on a computer. There is no password to forget and none to steal. Signing out ends the session on the server, not just on this phone.' },
      { icon: 'search', color: colors.textSecondary, title: 'Nobody can look you up', body: 'There is no directory and no username search anywhere in BudgetSplit. The only way to reach another account is a link its owner generated, and then the owner approves the specific person who used it, so a link forwarded round a group chat cannot connect you to a stranger.' },
      { icon: 'download', color: colors.income, title: 'Backups, a file you keep', body: 'Settings \u2192 your profile \u2192 Backup & restore makes one encrypted file of everything and hands it to you, to keep in Files, iCloud Drive or wherever you like. It is yours, separate from your account. It is encrypted on this phone with a passphrase that is never sent anywhere, which also means a forgotten passphrase cannot be reset by anyone, including us. Restoring replaces everything on this phone with the file, so it asks first.' },
      { icon: 'refresh-cw', color: colors.settle, title: 'Sync, nothing to switch on', body: 'Signing in is what turns it on. Everything goes to your account, your own spending, goals, budgets and net worth, and your groups, so a new phone gets it all back when you sign in. It works offline and catches up when there is a connection. Signing out sends anything not yet sent, then empties this phone; signing in again brings it all back.' },
      { icon: 'lock', color: colors.accent, title: 'The server can read what you sync', body: 'Your account\u2019s copy is stored as it is, not encrypted end to end. That is what lets the server check who may change what in a shared group, and bring everything back on a new phone. Receipt photos never leave the phone, and a backup file is encrypted with a passphrase only you know.' },
      { icon: 'user-plus', color: colors.accent, title: 'Sharing a group with someone', body: 'Open the group \u2192 Members \u2192 Invite someone, and pick a person linked to your account, link them first under Settings \u2192 your profile \u2192 Linked people. They get an invitation and nothing is shared until they accept it, being added to a group should not be something that happens to you.' },
      { icon: 'check-circle', color: colors.income, title: 'Accepting an invitation', body: 'An invitation waiting for you appears at the top of Sync, which the sync line on your profile opens. Accept it and that group starts arriving on the next sync. Until you accept, nothing about it reaches your phone.' },
      { icon: 'shield', color: colors.healthAmber, title: 'Nothing lands without your say-so', body: 'An entry someone else adds shows up in the group straight away, the group agrees on what happened, but it moves none of your own numbers until you accept it. If you mark someone trusted, their entries count immediately in every group you share with them. Money arriving as a transfer always waits for you to confirm it, however much you trust the sender.' },
      { icon: 'alert-triangle', color: colors.expense, title: 'What sync does not do', body: 'It does not show someone typing. It does not carry receipt photos, only the entries. There is no switch to pause it: signing out is how a phone stops. And you cannot restore a backup file while signed in, because that would replace what your account, and everyone you share a group with, has, from a copy they were never part of; sign out first.' },
    ],
  },
  {
    title: 'Privacy & Security',
    illustration: { icons: [
      { name: 'lock', bg: alpha(colors.accent, 13), color: colors.accent },
      { name: 'eye-off', bg: alpha(colors.settle, 13), color: colors.settle },
      { name: 'shield', bg: alpha(colors.income, 13), color: colors.income },
    ] },
    items: [
      { icon: 'wifi-off', color: colors.income, title: 'Local by default', body: 'No account is needed to use the app, and nothing tracks you across apps. Anonymous usage (which screens you open, never amounts or names) is shared unless you switch it off in Settings. Without an account, your money lives only on this device. Two things can leave it: receipt scanning sends that one photo to a cloud text-reader (you can switch that off), and signing in keeps a copy of everything on your account, readable by our server, so a new phone gets it back. See \u201cAccount, backup and sync\u201d above for what each one does.' },
      { icon: 'lock', color: colors.accent, title: 'Face ID / Touch ID', body: 'Enable biometric lock in Settings \u2192 Security. The app requires Face ID every time you open it, preventing others from seeing your finances.' },
      { icon: 'eye-off', color: colors.settle, title: 'Privacy screen', body: 'When you switch apps, your financial data is hidden with a blur overlay. On by default, toggle in Settings \u2192 Security.' },
      { icon: 'map-pin', color: colors.healthAmber, title: 'Location tagging', body: 'Optionally tag transactions with where you made them. OFF by default, switch it on in Settings → Feature management. Location data never leaves your device.' },
      { icon: 'map', color: colors.coral, title: 'See where you spent it', body: 'With location tagging on, a transaction records where you were. Open it and tap the location row to jump to that exact spot in Maps.' },
      { icon: 'clock', color: colors.accent, title: 'Every change is kept', body: 'Open any transaction to see its full history, created, edited, deleted, each with a timestamp. Nothing changes silently.' },
    ],
  },
  {
    title: 'Tips & Tricks',
    illustration: { icons: [
      { name: 'star', bg: alpha(colors.healthAmber, 13), color: colors.healthAmber },
      { name: 'sliders', bg: alpha(colors.accent, 13), color: colors.accent },
      { name: 'dollar-sign', bg: alpha(colors.income, 13), color: colors.income },
    ] },
    items: [
      { icon: 'check-circle', color: colors.income, title: 'Budget what matters', body: 'Set limits on only 3\u20135 categories that tend to overrun (food, cabs, eating out). You\'ll get sharper alerts instead of noise.' },
      { icon: 'sliders', color: colors.accent, title: 'Turn features on/off', body: 'Settings → Feature management switches off what you do not use: group splitting, itemized bills, insights, reports, goals, recurring and more, so the app shows only what you use.' },
      { icon: 'dollar-sign', color: colors.accent, title: 'Currency', body: 'Amounts are in Indian Rupees (₹). Multi-currency support is coming in a future update.' },
    ],
  },
];

export default function HelpScreen() {
  const router = useRouter();
  const [openSection, setOpenSection] = useState<string | null>('Getting Started');
  const [openItem, setOpenItem] = useState<string | null>('Adding your first expense');
  // Feedback (`U-104`): what you write, shared through whatever app you choose. There is no
  // address to send it to from here on purpose; the pilot is people who know each other.
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [withDetails, setWithDetails] = useState(true);
  const sendFeedback = () => {
    const message = buildFeedbackReport({
      text: feedback, includeDetails: withDetails,
      appVersion: appJson.expo.version, platform: Platform.OS,
      loads: loadTimeSummary(), calls: apiLog(),
    });
    Share.share({ message }).then(() => { setShowFeedback(false); setFeedback(''); }).catch(() => {});
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Help & Feedback" onBack={() => backOr(router, '/(tabs)')} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card clip style={styles.feedbackCard}>
          <ListRow
            icon="message-square"
            title="Send feedback"
            subtitle="What broke, what confused you, what you wanted"
            onPress={() => setShowFeedback(true)}
          />
        </Card>
        {/* The app's one collapsible (`SectionCard`, `DQ-17`), not a third pattern of its own. */}
        {SECTIONS.map(section => {
          const lead = section.illustration.icons[0];
          const isExpanded = openSection === section.title;
          return (
            <SectionCard
              key={section.title}
              title={section.title}
              icon={lead.name}
              iconColor={lead.color}
              expanded={isExpanded}
              onToggle={() => setOpenSection(isExpanded ? null : section.title)}
            >
              <View style={styles.items}>
                {section.items.map((item, i) => {
                  const isItemOpen = openItem === item.title;
                  return (
                    <View key={item.title}>
                      {i > 0 && <Divider indent="text" />}
                      <TouchableOpacity
                        style={styles.row}
                        onPress={() => setOpenItem(isItemOpen ? null : item.title)}
                        accessibilityRole="button"
                        accessibilityLabel={item.title}
                        accessibilityState={{ expanded: isItemOpen }}
                      >
                        <IconCircle icon={item.icon} size={layout.iconCircle} color={item.color} />
                        <Text style={styles.rowTitle}>{item.title}</Text>
                        <Feather name={isItemOpen ? 'minus' : 'plus'} size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                      <Collapse visible={isItemOpen}><HelpBody body={item.body} /></Collapse>
                    </View>
                  );
                })}
              </View>
            </SectionCard>
          );
        })}
      </ScrollView>

      <SheetModal visible={showFeedback} onClose={() => setShowFeedback(false)} title="Send feedback">
        <Input
          value={feedback}
          onChangeText={setFeedback}
          placeholder="What happened, and what did you expect?"
          multiline
          autoFocus
          accessibilityLabel="Your feedback"
          style={styles.feedbackInput}
        />
        <View style={styles.detailsRow}>
          <View style={styles.detailsText}>
            <Text style={styles.detailsLabel}>Include technical details</Text>
            <Text style={styles.detailsHint}>The build, slow screens and failed calls. No amounts or names.</Text>
          </View>
          <AppSwitch value={withDetails} onValueChange={setWithDetails} accessibilityLabel="Include technical details" />
        </View>
        <PrimaryButton label="Share" onPress={sendFeedback} disabled={!feedback.trim()} />
      </SheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  feedbackCard: { marginBottom: space.md },
  feedbackInput: { marginBottom: space.md },
  detailsRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  detailsText: { flex: 1 },
  detailsLabel: { ...type.body, color: colors.textPrimary },
  detailsHint: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, paddingBottom: space.lg },
  items: { paddingHorizontal: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.smd, minHeight: layout.rowMinHeight },
  rowTitle: { ...type.body, color: colors.textPrimary, flex: 1 },
  body: { ...type.body, color: colors.textSecondary, lineHeight: 22, paddingBottom: space.md, paddingLeft: layout.iconCircle + space.smd },
  bullets: { paddingBottom: space.md, paddingLeft: layout.iconCircle + space.smd, gap: space.xs },
  bulletRow: { flexDirection: 'row', gap: space.sm },
  bulletDot: { ...type.body, color: colors.textMuted, lineHeight: 22 },
  bulletText: { ...type.body, color: colors.textSecondary, lineHeight: 22, flex: 1 },
});
