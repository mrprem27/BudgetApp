import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, layout, shadow, alpha } from '../src/theme';
import { decor } from '../src/constants/palette';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';

type Item = { icon: keyof typeof Feather.glyphMap; color: string; title: string; body: string };
type Section = { title: string; illustration: { icons: Array<{ name: keyof typeof Feather.glyphMap; bg: string; color: string }> }; items: Item[] };

const SECTIONS: Section[] = [
  {
    title: 'Getting Started',
    illustration: { icons: [
      { name: 'plus-circle', bg: alpha(colors.accent, 13), color: colors.accent },
      { name: 'dollar-sign', bg: alpha(colors.income, 13), color: colors.income },
      { name: 'check-circle', bg: alpha(colors.settle, 13), color: colors.settle },
    ] },
    items: [
      { icon: 'edit-3', color: colors.accent, title: 'Adding your first expense', body: 'Tap the + button at the bottom \u2192 Quick Expense. Enter the amount (in rupees), pick a category like Food or Transport, optionally add a note, and save. It appears instantly on your dashboard and in the group.' },
      { icon: 'trending-up', color: colors.income, title: 'Adding income', body: 'Tap + \u2192 Income. Enter the amount, pick a source (Salary, Freelance, Business, etc.), set the date, and save. Income counts towards your net savings and is shown separately from expenses.' },
      { icon: 'list', color: decor.orange, title: 'Itemized bills', body: 'For restaurant bills or groceries with multiple items: Tap + \u2192 Itemized Bill. Add each item with quantity and price, assign items to people, add tax/tip, then review the per-person breakdown before saving.' },
      { icon: 'camera', color: decor.orange, title: 'Scan a receipt', body: 'On an itemized bill, tap “Scan receipt” to snap or pick a photo and have the line items read out of it. You always review the result and untick anything wrong before it’s added — nothing is saved from a scan you don’t confirm. Reading is done by a cloud OCR service, so the photo leaves your device for that one request; it isn’t stored there.' },
      { icon: 'arrow-right-circle', color: colors.settle, title: 'Transfers', body: 'A transfer records money moving from one person to another without it counting as spending. Useful for repaying a friend or recording a settlement between group members.' },
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
      { icon: 'mic', color: colors.accent, title: 'One command, nothing to configure', body: '“Hey Siri, Please log” covers spending, money in and paying someone back. Siri asks how much and what for, and BudgetSplit works out which of the three you meant from the words. Install it once from Settings → Voice entry — tapping Add Shortcut is the whole setup, with nothing to configure afterwards. There is also the microphone on your keyboard on the Add screen, which needs no setup at all.' },
      { icon: 'check-circle', color: colors.income, title: 'A clear phrase saves itself', body: 'Say “four fifty groceries” and it is saved straight away — the transaction opens so you can see exactly what was written, with Undo right there if Siri misheard. That happens only when there is nothing left to decide: an amount was heard, no group or person was named, and it is not a transfer.' },
      { icon: 'edit-3', color: colors.accent, title: 'Anything with a decision in it opens the form', body: 'A shared cost needs shares chosen, a transfer needs a direction, and a phrase with no amount needs the amount — none of those is worth guessing, so the Add screen opens with whatever was understood already filled in. Say “twelve hundred dinner with Rohan” and the group picker is up before you look at it.' },
      { icon: 'repeat', color: colors.accent, title: 'How it knows which kind you meant', body: 'Words like salary, refund, bonus or cashback mean money in. Naming someone you already have in the app, alongside paid, gave or sent, means a transfer — all three have to be there, so “paid 450 for groceries” stays a spend and “dinner with Riya” stays a shared one. Everything else is an expense. If it picks wrong, the kind pills sit at the top of the Add screen.' },
      { icon: 'message-circle', color: colors.accent, title: 'What to say', body: 'The amount and what it was for, in any order: “four fifty groceries”, “twelve hundred rent yesterday”, “chai dus rupaye”. Numbers work spoken or as digits, and lakh and thousand are understood — as are dus, do sau, pandrah sau and bees hazaar. You can add a relative date — today, yesterday, kal, parso, last Friday, three days ago — but not a spoken calendar date; use the date picker for those.' },
      { icon: 'mic-off', color: colors.healthAmber, title: 'If it hears nothing', body: 'It says “Sorry, I didn’t catch that” and asks again, up to three times. That only covers silence, though: a phrase Siri misheard is still perfectly good text as far as the shortcut can tell, which is why what it understood is always shown on screen before or straight after it saves.' },
      { icon: 'edit', color: colors.accent, title: 'Where your words end up', body: 'Say only an amount and a category (“four fifty groceries”) and nothing else is stored. Say more (“450 zomato biryani”) and the extra words become the title, which is what works out the category. Hesitation is thrown away rather than filed — “ok so I paid like 1200 for dinner” is titled just “dinner”. A long phrase titles itself with the first few words and puts the rest in the note, so nothing you said is lost.' },
      { icon: 'lock', color: colors.textSecondary, title: 'Where your words go', body: 'Nowhere. Your phone turns speech into text on the device, and the parsing — pulling out the amount, the category and the date — happens inside BudgetSplit with no network call. You can put the phone in airplane mode and it still works, which is the simplest proof.' },
      { icon: 'alert-circle', color: colors.healthAmber, title: 'What it will get wrong', body: 'Hinglish is handled properly — chai, kirana, sabzi, khana, bijli, kiraya, doodh and dawai all land in the right category — but a long code-mixed sentence will still misfire sometimes, which is why the amount and category are always visible before or immediately after saving. Itemized bills need the normal screens.' },
      { icon: 'smartphone', color: colors.textSecondary, title: 'iPhone only, for now', body: 'The hands-free shortcut uses Apple’s Shortcuts app, so it is iPhone-only. On Android the in-app keyboard microphone works exactly the same way.' },
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
      { icon: 'layers', color: colors.settle, title: 'Group health', body: 'Each group shows a budget bar — green on track, amber getting close, red over. Tap one to open it.' },
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
      { icon: 'users', color: colors.coral, title: 'Creating a group', body: 'Go to Groups tab \u2192 tap "New Group". Give it a name (e.g. "Me & GF", "Flatmates"), pick an icon and color, then add members. Your "Personal" group is always private \u2014 just you.' },
      { icon: 'scissors', color: colors.accent, title: 'Split types', body: 'When splitting a bill, choose: Equal (everyone pays the same), Exact (you enter each person\'s amount), Percent (e.g. 60/40), or Shares (ratios like 2:1:1). A person set to 0 is simply not included. For restaurant-style bills, the separate Itemized Bill entry assigns specific items to people instead of splitting one total.' },
      { icon: 'credit-card', color: colors.healthAmber, title: 'Multiple payers', body: 'If more than one person paid for something, tap "Who paid?" and enter each person\'s contribution. The app ensures total paid equals total shared \u2014 save is blocked until balanced.' },
      { icon: 'alert-circle', color: colors.healthRed, title: 'The balance rule', body: 'Every transaction must balance: total paid = total shared. If there\'s a mismatch, you\'ll see "\u20b9X unassigned" in red and the save button stays disabled. This prevents errors.' },
      { icon: 'archive', color: colors.settle, title: 'Archiving a group', body: 'Swipe left on any group to archive it, or use the Active / Archived chips at the top. An archived group keeps all its data but disappears from your main view. Tap to restore it anytime.' },
      { icon: 'droplet', color: decor.orange, title: 'Group colours', body: 'Each group gets a header gradient in the colour you picked, and its tab underline and icon match \u2014 so you can tell at a glance which group you\u2019re looking at.' },
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
      { icon: 'toggle-left', color: colors.accent, title: 'Simplify debts', body: 'On a group\u2019s Members tab, "Simplify" collapses a tangle of debts into the smallest number of payments \u2014 so A pays C once instead of A\u2192B\u2192C. Turn it off to see every individual who-owes-whom debt exactly as it arose.' },
      { icon: 'smartphone', color: colors.accent, title: 'Paying from your UPI app', body: 'If the person you\u2019re paying has a UPI ID saved, you\u2019ll see "Pay \u20b9X via UPI". It opens your own UPI app with the payee and amount already filled in \u2014 the money moves straight between your two bank accounts. BudgetSplit never touches it.' },
      { icon: 'alert-circle', color: colors.healthAmber, title: 'Apps that only open', body: 'PhonePe, Paytm, Amazon Pay and WhatsApp refuse payments started by another app, so we don\u2019t send them one \u2014 they just open and you enter the payment there. The row says "enter it there" so you know before you tap. CRED and Airtel arrive filled in. Nothing is wasted either way: the expense is saved first.' },
      { icon: 'camera', color: colors.coral, title: 'Scan & Pay', body: 'Long-press the + button to scan any UPI QR \u2014 a shop\u2019s or a friend\u2019s. It reads the payee, the amount if the code carries one, and the shop\u2019s category, then hands the payment to your UPI app and saves the expense to your review inbox.' },
      { icon: 'credit-card', color: colors.income, title: 'Your own UPI ID', body: 'Settings \u2192 Getting paid \u2192 Your UPI ID. Needed only so others can pay you \u2014 it goes into your QR code and nowhere else. It stays on this phone.' },
      { icon: 'maximize', color: colors.income, title: 'Getting paid with a QR', body: 'When someone owes you, tap "Show QR to get \u20b9X" and they scan it with any UPI app \u2014 including the four above, because their own camera starts the payment. You can also show a plain code with no amount from Settings \u2192 Show my UPI QR.' },
      { icon: 'check-circle', color: colors.textSecondary, title: 'Why you still tap Save', body: 'BudgetSplit never learns whether a payment actually went through \u2014 it only opens someone else\u2019s app. So it asks rather than assumes. That\u2019s why nothing is recorded until you say it happened.' },
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
      { icon: 'target', color: colors.income, title: 'Setting budgets', body: 'Open any group \u2192 Budget tab \u2192 add a budget for a category. Set a limit amount and cadence (Daily, Monthly, Yearly, or One-time). Monthly budgets reset each month automatically.' },
      { icon: 'activity', color: colors.healthAmber, title: 'Budget health', body: 'Each budget shows a colored progress bar: Green (under 80%), Amber (80\u2013100%), Red (over budget). The dashboard shows all groups\' budget health at a glance.' },
      { icon: 'refresh-cw', color: colors.accent, title: 'Resets each period', body: 'Budgets repeat on their cadence \u2014 your limit resets at the start of each period and unused amount does not carry over. A \u20b95000 monthly food budget is \u20b95000 again next month, whether you underspent or not.' },
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
      { icon: 'credit-card', color: colors.accent, title: 'Total Money', body: 'The Plan screen shows one Total Money figure with a breakdown: your money (Cash available + Investments) plus Credit available (limit − used). Tap the card to edit your cash, investments and credit. Credit is shown for context but is never spent automatically.' },
      { icon: 'target', color: colors.settle, title: 'Goals', body: 'Create goals with a target amount, an Emergency / Need / Want priority and an icon. Goals are grouped into those three sections; drag within a section to set which goal in it fills up first. Fund a goal directly from your Cash available (swipe or enter an amount). Each shows a progress bar, what’s left, and — if you set an auto-save amount — an estimated “done by” date. Withdrawing returns money to your cash.' },
      { icon: 'refresh-cw', color: colors.healthAmber, title: 'Auto-save', body: 'Give a goal a fixed amount and cadence (e.g. ₹5,000 monthly) and the app funds it from your Cash available on schedule — Emergency goals first, then Need, then Want, in your drag order within each.' },
      { icon: 'alert-triangle', color: colors.expense, title: 'Overspending', body: 'If Cash available goes negative, the app automatically pulls from Want goals first, then Need, to cover it, and shows a notice with Undo. Emergency and Locked goals — and investments — are never touched.' },
      { icon: 'zap', color: colors.income, title: 'Savings insights', body: 'Gentle opportunity-cost nudges on the Money tab (e.g. how a recurring expense compares to a goal). Toggle them off anytime in Settings → Features → Savings insights.' },
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
      { icon: 'repeat', color: colors.accent, title: 'Setting up', body: 'When adding an expense or income, flip the "Repeat this" switch. Choose a frequency (Daily, Weekly, Monthly or a custom interval) and an optional end date. It then repeats automatically \u2014 no need to re-enter each time.' },
      { icon: 'calendar', color: colors.settle, title: 'Where they show up', body: 'A recurring entry appears in your transaction list and counts towards budgets for every period it falls in, without you doing anything. It is worked out as needed rather than stored, so a long-running schedule never clutters your history.' },
      { icon: 'pause-circle', color: colors.healthAmber, title: 'Pause, resume & end', body: 'Open a group \u2192 Recurring tab to manage every schedule. Pause to temporarily stop generating new ones, Resume to continue, or End to stop for good. Past occurrences always stay in your history.' },
      { icon: 'skip-forward', color: colors.settle, title: 'Skip one occurrence', body: 'Need to skip just the next instance (a month you didn\u2019t pay rent, say)? Tap Skip on the Recurring tab. Only that single occurrence is dropped \u2014 the schedule continues normally afterwards.' },
      { icon: 'edit-2', color: colors.income, title: 'Edit going forward', body: 'Tap Edit to change the amount, category or frequency from the next occurrence onward. Past entries are never rewritten \u2014 the app keeps the old run intact and starts a new one with your changes.' },
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
      { icon: 'bar-chart-2', color: colors.accent, title: 'Monthly reports', body: 'Reports tab shows income, expense, and net savings per group for any month. Navigate between months with arrows. Each group card shows top spending categories and budget utilization.' },
      { icon: 'pie-chart', color: colors.coral, title: 'Charts', body: 'See spending by category (donut chart) and 6-month spending trend (bar chart). On the dashboard, tap chart points to see exact values at that moment.' },
      { icon: 'hash', color: decor.orange, title: 'Tags', body: 'Add #tags to any transaction (e.g. #trip, #wedding). Tags cut across groups — filter by one in Reports to see everything related, wherever you logged it.' },
      { icon: 'trending-up', color: colors.settle, title: 'Spending forecast', body: 'For the current month, a line chart shows your daily cumulative spending plus a projected trend line to month-end. The forecast badge shows estimated total spend if you maintain this pace.' },
      { icon: 'award', color: colors.healthAmber, title: 'Year in review', body: 'At the bottom of Reports: total income, total spent, total saved for the year \u2014 plus your top category and biggest single expense. A quick yearly health check.' },
      { icon: 'download', color: colors.income, title: 'CSV export', body: 'Tap the CSV button in Reports to export all transactions for the current month as a spreadsheet. Opens the share sheet so you can AirDrop, email, or save to Files.' },
      { icon: 'file-text', color: colors.settle, title: 'PDF export', body: 'Tap the PDF button for a dark-themed formatted report with transactions table, summary cards, and color-coded amounts. Matches the app\'s visual style.' },
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
      { icon: 'grid', color: decor.orange, title: 'Expense categories', body: '33 categories across 8 sections: Home & Living, Food, Transport, Bills & Utilities, Lifestyle, Health, Money & Growth, and Other. Each has a unique icon and color.' },
      { icon: 'briefcase', color: colors.income, title: 'Income sources', body: '11 income categories: Salary, Freelance, Business, Interest, Dividends, Rent Received, Bonus, Cashback, Refunds, Gifts Received, and Other Income.' },
      { icon: 'plus-circle', color: colors.accent, title: 'Custom categories', body: 'Settings \u2192 Categories lets you add new categories to any section, or delete ones you don\'t use. Custom categories appear in the picker when adding transactions.' },
      { icon: 'folder', color: colors.settle, title: 'How the picker is organised', body: 'Categories sit inside sections so the picker never shows you 44 things at once. Tap a section to open it; the badge tells you how many are inside.' },
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
      { icon: 'help-circle', color: colors.accent, title: 'Three different things, and they are easy to mix up', body: 'An ACCOUNT is just who you are \u2014 it lets another person\u2019s phone know that a name in their app is you. A BACKUP is a snapshot you take by hand, so you can get your data back if this phone is lost. SYNC keeps a shared group up to date between the people in it. You can have an account and never back up. You can back up without ever syncing. Sync is the only one of the three that involves anyone else.' },
      { icon: 'mail', color: colors.accent, title: 'Signing in \u2014 no password', body: 'Settings \u2192 Account, enter your email, and we send you a link. Tapping it signs you in; the email also prints the code in case you opened the mail on a computer. There is no password to forget and none to steal. Signing out ends the session on the server, not just on this phone.' },
      { icon: 'search', color: colors.textSecondary, title: 'Nobody can look you up', body: 'There is no directory and no username search anywhere in BudgetSplit. The only way to reach another account is a link its owner generated, and then the owner approves the specific person who used it \u2014 so a link forwarded round a group chat cannot connect you to a stranger.' },
      { icon: 'download', color: colors.income, title: 'Backups \u2014 a snapshot you take', body: 'Settings \u2192 Backup makes one encrypted file of everything and hands it to you, or stores it on your account if you are signed in. It is encrypted on this phone with a passphrase that is never sent anywhere \u2014 which also means a forgotten passphrase cannot be reset by anyone, including us. Restoring replaces everything on this phone with the snapshot, so it asks first.' },
      { icon: 'refresh-cw', color: colors.settle, title: 'Sync \u2014 two different switches', body: 'Settings \u2192 Sync has two. The first keeps SHARED GROUPS current between the people in them, entry by entry \u2014 nothing else travels. The second, \u201cKeep a copy of everything\u201d, also sends an encrypted copy of your whole app so a fresh phone can become this one: sign in, enter your passphrase, and it is all back. They fail differently, which is why they are separate switches \u2014 the copy is newest-wins, so it is for getting a phone back, not for working on two at once. Either way changes travel when you open the app, not the second someone types them.' },
      { icon: 'lock', color: colors.accent, title: 'The server cannot read your groups', body: 'Everything is encrypted on this phone before it is sent, with a key made here and shared only with the people in the group. What the server holds is sealed data it has no key for \u2014 not amounts, not who paid, not what it was for. It knows who is in which group and when something changed, and nothing else.' },
      { icon: 'user-plus', color: colors.accent, title: 'Sharing a group with someone', body: 'Open the group \u2192 Members \u2192 Share with a member. You can share with someone who is both a member of that group and linked to your account, so link them first under Settings \u2192 Linked people. They get an invitation and nothing is shared until they accept it \u2014 being added to a group should not be something that happens to you.' },
      { icon: 'check-circle', color: colors.income, title: 'Accepting an invitation', body: 'An invitation waiting for you appears at the top of Settings \u2192 Sync. Accept it and that group starts arriving on the next sync. Until you accept, nothing about it reaches your phone.' },
      { icon: 'shield', color: colors.healthAmber, title: 'Nothing lands without your say-so', body: 'An entry someone else adds shows up in the group straight away \u2014 the group agrees on what happened \u2014 but it moves none of your own numbers until you accept it. If you mark someone trusted, their entries count immediately in every group you share with them. Money arriving as a transfer always waits for you to confirm it, however much you trust the sender.' },
      { icon: 'alert-triangle', color: colors.expense, title: 'What sync does not do', body: 'It is not live, so it will not show someone typing. It does not carry receipt photos, only the entries. Turning it off pauses it \u2014 what is already on the server stays there and nothing is removed from anyone else\u2019s phone. And you cannot restore a backup while sync is on, because that would replace what everyone else sees with a snapshot they were never part of; turn sync off first.' },
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
      { icon: 'wifi-off', color: colors.income, title: 'Local by default', body: 'Your money lives on this device. No account is needed to use the app, and there is no tracking and no analytics \u2014 nothing is uploaded as you use it. By default your personal spending, income, savings goals, budgets and net worth never leave this phone. Four things can leave, each only when you switch it on: receipt scanning sends that one photo to a cloud text-reader, signing in lets you keep an encrypted backup off the phone, turning on sync sends your shared groups, and \u201cKeep a copy of everything\u201d sends an encrypted copy of the whole app so a new phone can become this one \u2014 all sealed here first, to a server with no key for any of it. See \u201cAccount, backup and sync\u201d above for what each one actually does.' },
      { icon: 'lock', color: colors.accent, title: 'Face ID / Touch ID', body: 'Enable biometric lock in Settings \u2192 Privacy. The app requires Face ID every time you open it, preventing others from seeing your finances.' },
      { icon: 'eye-off', color: colors.settle, title: 'Privacy screen', body: 'When you switch apps, your financial data is hidden with a blur overlay. On by default \u2014 toggle in Settings \u2192 Privacy & Security.' },
      { icon: 'map-pin', color: colors.healthAmber, title: 'Location tagging', body: 'Optionally tag transactions with where you made them. OFF by default, explicitly enable in Settings. Location data never leaves your device.' },
      { icon: 'map', color: colors.coral, title: 'See where you spent it', body: 'With location tagging on, a transaction records where you were. Open it and tap the location row to jump to that exact spot in Maps.' },
      { icon: 'clock', color: colors.accent, title: 'Every change is kept', body: 'Open any transaction to see its full history — created, edited, deleted, each with a timestamp. Nothing changes silently.' },
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
      { icon: 'sliders', color: colors.accent, title: 'Turn features on/off', body: 'Settings → Features lets you toggle Dashboard / Budget / Savings insights, the spending forecast, itemized bills, and recurring transactions — so the app shows only what you use.' },
      { icon: 'dollar-sign', color: colors.accent, title: 'Currency', body: 'Amounts are in Indian Rupees (₹). Multi-currency support is coming in a future update.' },
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
                accessibilityLabel={section.title}
                accessibilityState={{ expanded: isExpanded }}
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
                          accessibilityLabel={item.title}
                          accessibilityState={{ expanded: isItemOpen }}
                        >
                          <View style={[styles.iconDot, { backgroundColor: alpha(item.color, 13) }]}>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.smd },
  iconDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { ...type.body, color: colors.textPrimary, flex: 1 },
  body: { ...type.body, color: colors.textSecondary, lineHeight: 22, paddingBottom: space.md, paddingLeft: 30 + space.sm },
});
