/**
 * Comprehensive demo / test data seeder.
 *
 * Wipes the database and rebuilds a rich, realistic dataset that exercises every
 * surface of the app: personal + shared groups, equal/exact/shares/itemized
 * splits, settlements (partial & fully-settled), income, recurring rules
 * (active/paused/ended), category budgets (over/near/under, all cadences),
 * savings pool + goals (funded/reached/empty/with-deadline/withdrawals),
 * location-tagged & attachment rows, a soft-deleted txn, and an archived group.
 *
 * This is a developer/QA tool — triggered from Settings, not on normal launch.
 */
import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { insertGroup } from './queries/groups';
import { insertPerson } from './queries/persons';
import { getMe } from './queries/persons';
import { insertTxn, insertItemizedTxn, recordSettlement, softDeleteTxn } from './queries/transactions';
import { pauseRecurring, endRecurring } from './queries/transactions';
import { setCategoryBudgets } from './queries/categoryBudgets';
import { insertGoal, fundGoal, withdrawFromGoal } from './queries/savings';
import { insertPending } from './queries/pending';
import { seedGlobalCategories } from './seedCategories';
import { setMoneyProfile } from './queries/moneyProfile';
import type { RecurFreq, PayMethod } from '../constants/enums';

/** Rupees → integer paise. */
const R = (rupees: number) => Math.round(rupees * 100);

// NOTE: `category` is intentionally NOT here — it's the single global catalog
// (seeded in openDB / seedGlobalCategories), not per-run data. Wiping it would
// leave every transaction "uncategorized" (folded into Others). `category_budget`
// IS wiped (budgets are per-run demo data) and re-created below.
const ALL_TABLES = [
  'txn_payment', 'txn_share', 'line_item', 'recur_skip', 'txn',
  'category_budget', 'group_member', 'budget_group',
  'savings_txn', 'savings_goal', 'audit_log', 'pending_txn', 'person',
];

/** Delete every row from every data table (settings/feature-flags + the global
 *  category catalog are untouched). */
export async function wipeAllData(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys=OFF;');
  for (const t of ALL_TABLES) {
    await db.runAsync(`DELETE FROM ${t}`);
  }
  await db.execAsync('PRAGMA foreign_keys=ON;');
  // Self-heal: guarantee the global catalog exists (idempotent) so categories
  // always resolve after a wipe, even on an older DB that once wiped them.
  await seedGlobalCategories(db);
}

/** Re-seed only the base "me" + Personal group + categories (empty-state baseline). */
export async function resetToEmpty(db: SQLite.SQLiteDatabase): Promise<void> {
  const prev = await getMe(db);
  const meId = prev?.id ?? uuid();
  const meName = prev?.name ?? 'You';
  const meColor = prev?.avatar_color ?? '#4F46E5';
  const meImage = prev?.image_uri ?? null;
  await wipeAllData(db);
  await createMeAndPersonal(db, meId, meName, meColor, meImage);
}

async function createMeAndPersonal(
  db: SQLite.SQLiteDatabase, meId: string, meName: string, meColor: string, meImage: string | null,
): Promise<string> {
  const now = Date.now();
  const personalId = uuid();
  await db.runAsync(
    'INSERT INTO person (id, name, avatar_color, is_me, email, image_uri) VALUES (?, ?, ?, 1, ?, ?)',
    [meId, meName, meColor, 'hello123@vortiqal.com', meImage],
  );
  await db.runAsync(
    `INSERT INTO budget_group
       (id, name, icon, color, carry_over, is_shared, is_archived, is_personal, simplify_debt, default_split, created_at)
     VALUES (?, ?, ?, ?, 0, 0, 0, 1, 1, 'equal', ?)`,
    [personalId, 'Personal', 'credit-card', meColor, now],
  );
  await db.runAsync('INSERT INTO group_member (group_id, person_id, joined_at) VALUES (?, ?, ?)', [personalId, meId, now]);
  // Categories are a global catalog seeded in openDB — not per group.
  return personalId;
}

/**
 * Wipe and rebuild the full comprehensive demo dataset.
 * Returns a short summary string for the success toast.
 */
export async function loadDemoData(db: SQLite.SQLiteDatabase): Promise<string> {
  // Preserve the user's identity (id/name/avatar) across the wipe.
  const prev = await getMe(db);
  const meId = prev?.id ?? uuid();
  const meName = prev?.name ?? 'You';
  const meColor = prev?.avatar_color ?? '#4F46E5';
  const meImage = prev?.image_uri ?? null;

  await wipeAllData(db);
  const personalId = await createMeAndPersonal(db, meId, meName, meColor, meImage);

  // --- People ------------------------------------------------------------
  const aarav = await insertPerson(db, 'Aarav', '#F0A500');
  const priya = await insertPerson(db, 'Priya', '#3ECF8E');
  const rohan = await insertPerson(db, 'Rohan', '#8B7CF8');
  const sneha = await insertPerson(db, 'Sneha', '#FB7185');
  const vikram = await insertPerson(db, 'Vikram', '#22D3EE');

  // --- Shared groups (insertGroup seeds their categories) ----------------
  const roommates = await insertGroup(db, 'Roommates', 'home', '#7C6AF7', [meId, aarav.id, priya.id], 'equal');
  const goa = await insertGroup(db, 'Goa Trip', 'map', '#F472B6', [meId, rohan.id, sneha.id, vikram.id], 'equal');
  const office = await insertGroup(db, 'Office Lunch', 'coffee', '#FB923C', [meId, priya.id, vikram.id], 'equal');
  const family = await insertGroup(db, 'Family', 'users', '#FB7185', [meId, priya.id, aarav.id], 'equal');
  const manali = await insertGroup(db, 'Manali Trip', 'map', '#22D3EE', [meId, rohan.id, vikram.id], 'equal');
  // Intentionally empty (members, zero transactions) → exercises the empty Expenses/Budget tab states.
  await insertGroup(db, 'Weekend Plans', 'calendar', '#A78BFA', [meId, sneha.id], 'equal');
  const oldFlat = await insertGroup(db, 'Old Flat (archived)', 'home', '#94A3B8', [meId, aarav.id], 'equal');
  await db.runAsync('UPDATE budget_group SET is_archived=1 WHERE id=?', [oldFlat.id]);
  // Goa keeps every debt separate (simplify OFF) — exercises the non-netted path.
  await db.runAsync('UPDATE budget_group SET simplify_debt=0 WHERE id=?', [goa.id]);

  // --- Date helpers ------------------------------------------------------
  const today = new Date();
  const todayDate = today.getDate();
  // A date within the current month, never in the future (so forecast math is sane).
  const thisMonth = (day: number, hour = 10) => {
    const d = new Date(); d.setHours(hour, 0, 0, 0); d.setDate(Math.min(day, todayDate)); return d.getTime();
  };
  // A date `monthsBack` months ago, on `day` (clamped to 28 to avoid overflow).
  const monthsBack = (back: number, day: number, hour = 10) => {
    const d = new Date(); d.setHours(hour, 0, 0, 0); d.setDate(1); d.setMonth(d.getMonth() - back); d.setDate(Math.min(day, 28)); return d.getTime();
  };

  // --- Personal income (logged occurrences) ------------------------------
  const income = (category: string, rupees: number, date: number, note?: string) =>
    insertTxn(db, { groupId: personalId, kind: 'income', entryMode: 'quick', date, category, note, payments: [{ personId: meId, amount: R(rupees) }], shares: [{ personId: meId, amount: R(rupees) }] });
  await income('Salary', 85000, thisMonth(1), 'Monthly salary');
  await income('Salary', 85000, monthsBack(1, 1), 'Monthly salary');
  await income('Salary', 85000, monthsBack(2, 1), 'Monthly salary');
  await income('Freelance', 15000, monthsBack(1, 12), 'Logo design gig');
  await income('Interest', 1200, thisMonth(5), 'Savings interest');

  // --- Personal expenses (logged occurrences) ----------------------------
  type Opt = { note?: string; pay?: PayMethod; lat?: number; lng?: number; place?: string; attach?: string };
  const exp = (category: string, rupees: number, date: number, o: Opt = {}) =>
    insertTxn(db, { groupId: personalId, kind: 'expense', entryMode: 'quick', date, category, note: o.note, payMethod: o.pay, lat: o.lat, lng: o.lng, placeLabel: o.place, attachmentUri: o.attach, payments: [{ personId: meId, amount: R(rupees) }], shares: [{ personId: meId, amount: R(rupees) }] });

  // This month — drives forecast, budgets (over/near/under) and shift teaser.
  await exp('Rent', 22000, thisMonth(2), { note: 'Flat rent', pay: 'bank' });
  await exp('Groceries', 3500, thisMonth(3), { place: 'BigBasket', pay: 'upi' });
  await exp('Groceries', 3200, thisMonth(9), { place: 'DMart, HSR Layout', lat: 12.91, lng: 77.64 });
  await exp('Groceries', 2300, thisMonth(15), { pay: 'upi' });                         // → ₹9,000 vs ₹8,000 budget = OVER
  await exp('Eating Out', 1200, thisMonth(4), { note: 'Dinner with friends', place: 'Truffles, Koramangala', lat: 12.93, lng: 77.62 });
  await exp('Eating Out', 900, thisMonth(11), { pay: 'cash' });
  await exp('Eating Out', 600, thisMonth(18), { note: 'Brunch' });                      // → ₹2,700 vs ₹3,000 = NEAR
  await exp('Fuel', 1500, thisMonth(6), { place: 'Indian Oil', pay: 'upi' });           // → under budget
  await exp('Electricity', 2200, thisMonth(7), { note: 'BESCOM bill', attach: 'demo://receipt-bescom.pdf' });
  await exp('Shopping', 4500, thisMonth(8), { note: 'Winter clothes', place: 'Phoenix Mall' });
  await exp('Health & Pharmacy', 800, thisMonth(10), { pay: 'cash' });
  await exp('Chai & Snacks', 5, thisMonth(12));                                          // tiny-amount edge case
  await exp('Chai & Snacks', 5, thisMonth(14));
  await exp('Cab & Auto', 350, thisMonth(13), { place: 'Uber', pay: 'upi' });

  // Last month — gives shifts vs this month + reports/trend depth + a big one-off.
  await exp('Rent', 22000, monthsBack(1, 2), { pay: 'bank' });
  await exp('Groceries', 6500, monthsBack(1, 5));
  await exp('Eating Out', 1500, monthsBack(1, 8));                                       // this month 2,700 → +80% shift
  await exp('Fuel', 2000, monthsBack(1, 10));
  await exp('Electronics', 65000, monthsBack(1, 14), { note: 'New laptop', pay: 'bank' }); // large-amount edge case
  await exp('Electricity', 1900, monthsBack(1, 7));
  await exp('Shopping', 3000, monthsBack(1, 20));
  await exp('Entertainment', 1200, monthsBack(1, 22), { note: 'Concert tickets' });

  // Two months ago — lighter, for a 3-point trend.
  await exp('Rent', 22000, monthsBack(2, 2), { pay: 'bank' });
  await exp('Groceries', 5800, monthsBack(2, 6));
  await exp('Eating Out', 2100, monthsBack(2, 9));
  await exp('Fuel', 1700, monthsBack(2, 12));
  await exp('Travel', 9000, monthsBack(2, 18), { note: 'Weekend getaway' });

  // A soft-deleted entry → exercises the deleted state + audit log.
  const doomed = await exp('Other', 999, thisMonth(16), { note: 'Mistaken entry' });
  await softDeleteTxn(db, doomed);

  // --- Personal recurring rules (templates) → Recurring tab + Subscriptions
  const rule = (category: string, rupees: number, freq: RecurFreq, note: string, interval = 1) =>
    insertTxn(db, { groupId: personalId, kind: 'expense', entryMode: 'quick', date: monthsBack(3, 1), category, note, recurFreq: freq, recurInterval: interval, payments: [{ personId: meId, amount: R(rupees) }], shares: [{ personId: meId, amount: R(rupees) }] });
  await rule('Entertainment', 649, 'monthly', 'Netflix');
  await rule('Entertainment', 119, 'monthly', 'Spotify');
  await rule('Bills', 22000, 'monthly', 'Rent auto-pay');
  await rule('Insurance', 12000, 'yearly', 'Term insurance');
  await rule('Household Help', 800, 'weekly', 'House cleaning');                          // weekly frequency
  await rule('Maintenance', 2500, 'custom', 'Society dues (every 90 days)', 90);          // custom interval (days)
  const gymRule = await rule('Gym & Fitness', 1500, 'monthly', 'Gym membership');
  await pauseRecurring(db, gymRule);                                                     // paused state
  const mobileRule = await rule('Mobile Recharge', 299, 'monthly', 'Old prepaid plan');
  await endRecurring(db, mobileRule);                                                    // ended state

  // Near-due recurring rules → populate Home "Coming up" + Plan "Upcoming this month".
  // Anchored a few days ahead so their NEXT occurrence is imminent (no past occurrences materialize).
  const DAY = 86400000;
  const dueRule = (category: string, rupees: number, freq: 'weekly' | 'monthly' | 'yearly', note: string, inDays: number) =>
    insertTxn(db, { groupId: personalId, kind: 'expense', entryMode: 'quick', date: Date.now() + inDays * DAY, category, note, recurFreq: freq, recurInterval: 1, payments: [{ personId: meId, amount: R(rupees) }], shares: [{ personId: meId, amount: R(rupees) }] });
  await dueRule('Bills', 400, 'weekly', 'Newspaper', 1);            // due tomorrow
  await dueRule('WiFi & Broadband', 999, 'monthly', 'Internet bill', 2);
  await dueRule('Entertainment', 130, 'monthly', 'Cloud storage', 3);

  // Repeating un-ruled charge (same category+amount, ~monthly) → "Maybe a subscription" detection.
  await exp('Entertainment', 199, thisMonth(10), { note: 'Prime Video' });
  await exp('Entertainment', 199, monthsBack(1, 10), { note: 'Prime Video' });
  await exp('Entertainment', 199, monthsBack(2, 10), { note: 'Prime Video' });

  // No-note expenses → TransactionRow shows the CATEGORY as the primary line (note-less path).
  await exp('Metro & Bus', 60, thisMonth(2));
  await exp('Parking & Toll', 120, thisMonth(13));

  // PRIMED FLOW: an obvious row to long-press/delete so you can see the Undo toast.
  await exp('Other', 250, thisMonth(11), { note: 'Delete me — tests the Undo toast' });

  // --- Roommates: equal splits → live balances, then partial settlements --
  await insertTxn(db, { groupId: roommates.id, kind: 'expense', entryMode: 'quick', date: monthsBack(1, 1), category: 'Rent', note: 'Flat rent', payments: [{ personId: meId, amount: R(30000) }], shares: [{ personId: meId, amount: R(10000) }, { personId: aarav.id, amount: R(10000) }, { personId: priya.id, amount: R(10000) }] });
  await insertTxn(db, { groupId: roommates.id, kind: 'expense', entryMode: 'quick', date: thisMonth(4), category: 'Groceries', note: 'Weekly groceries', payments: [{ personId: aarav.id, amount: R(4500) }], shares: [{ personId: meId, amount: R(1500) }, { personId: aarav.id, amount: R(1500) }, { personId: priya.id, amount: R(1500) }] });
  await insertTxn(db, { groupId: roommates.id, kind: 'expense', entryMode: 'quick', date: thisMonth(6), category: 'WiFi & Broadband', note: 'Internet', payments: [{ personId: priya.id, amount: R(1200) }], shares: [{ personId: meId, amount: R(400) }, { personId: aarav.id, amount: R(400) }, { personId: priya.id, amount: R(400) }] });
  await insertTxn(db, { groupId: roommates.id, kind: 'expense', entryMode: 'quick', date: thisMonth(9), category: 'Electricity', note: 'Power bill', payments: [{ personId: meId, amount: R(1800) }], shares: [{ personId: meId, amount: R(600) }, { personId: aarav.id, amount: R(600) }, { personId: priya.id, amount: R(600) }] });
  await recordSettlement(db, { groupId: roommates.id, fromId: aarav.id, toId: meId, amount: R(5000), date: thisMonth(12), payMethod: 'upi', category: 'Rent', note: 'Part of rent' });
  await recordSettlement(db, { groupId: roommates.id, fromId: priya.id, toId: meId, amount: R(3000), date: thisMonth(14), payMethod: 'cash', category: 'Repayment' });
  // Shared-group recurring rule → Personal → Recurring shows a second group section (Roommates).
  await insertTxn(db, { groupId: roommates.id, kind: 'expense', entryMode: 'quick', date: monthsBack(3, 1), category: 'Household Help', note: 'Maid (shared)', recurFreq: 'monthly', recurInterval: 1, payments: [{ personId: meId, amount: R(3000) }], shares: [{ personId: meId, amount: R(1000) }, { personId: aarav.id, amount: R(1000) }, { personId: priya.id, amount: R(1000) }] });

  // --- Goa Trip: exact + shares splits + an itemized bill -----------------
  // Hotel — EXACT split (everyone a different amount).
  await insertTxn(db, { groupId: goa.id, kind: 'expense', entryMode: 'quick', date: monthsBack(1, 15), category: 'Travel', note: 'Beach resort, 2 nights', payments: [{ personId: meId, amount: R(40000) }], shares: [{ personId: meId, amount: R(10000) }, { personId: rohan.id, amount: R(12000) }, { personId: sneha.id, amount: R(10000) }, { personId: vikram.id, amount: R(8000) }] });
  // Cab — equal split.
  await insertTxn(db, { groupId: goa.id, kind: 'expense', entryMode: 'quick', date: monthsBack(1, 15), category: 'Cab & Auto', note: 'Airport transfers', payments: [{ personId: rohan.id, amount: R(6000) }], shares: [{ personId: meId, amount: R(1500) }, { personId: rohan.id, amount: R(1500) }, { personId: sneha.id, amount: R(1500) }, { personId: vikram.id, amount: R(1500) }] });
  // Activities — SHARES/weights split (me 2 · Rohan 1 · Sneha 2 · Vikram 1 of ₹8,000).
  await insertTxn(db, { groupId: goa.id, kind: 'expense', entryMode: 'quick', date: monthsBack(1, 16), category: 'Entertainment', note: 'Water sports', payments: [{ personId: sneha.id, amount: R(8000) }], shares: [{ personId: meId, amount: 266667 }, { personId: rohan.id, amount: 133333 }, { personId: sneha.id, amount: 266667 }, { personId: vikram.id, amount: 133333 }] });
  // Itemized dinner — line items + tax/tip, paid by Vikram, with per-item split
  // modes (percent/shares) to showcase itemized splitting. Wrapped so that if an
  // itemized insert ever fails on an odd DB state, the rest of the demo (budgets,
  // savings, pending inbox) still seeds instead of the whole load aborting.
  try {
    await insertItemizedTxn(db, {
      groupId: goa.id, kind: 'expense', entryMode: 'itemized', date: monthsBack(1, 16), category: 'Eating Out', note: 'Seafood dinner',
      payments: [{ personId: vikram.id, amount: R(4400) }],
      shares: [{ personId: meId, amount: R(1100) }, { personId: rohan.id, amount: R(1100) }, { personId: sneha.id, amount: R(1100) }, { personId: vikram.id, amount: R(1100) }],
      adjustments: [{ label: 'GST', type: 'tax', mode: 'percent', value: '5' }, { label: 'Tip', type: 'tip', mode: 'percent', value: '10' }, { label: 'Coupon', type: 'discount', mode: 'flat', value: '200' }],
      items: [
        // Showcases the per-item split modes: percent, single, shares, equal.
        { name: 'Grilled Prawns', qty: 2, unitPrice: R(650), assignedTo: [meId, rohan.id], splitMode: 'percent', splitValues: { [meId]: '60', [rohan.id]: '40' } },
        { name: 'Fish Curry', qty: 1, unitPrice: R(450), assignedTo: [sneha.id] },
        { name: 'Beer (x4)', qty: 4, unitPrice: R(200), assignedTo: [meId, rohan.id, sneha.id, vikram.id], splitMode: 'shares', splitValues: { [meId]: '2', [rohan.id]: '2', [sneha.id]: '1', [vikram.id]: '1' } },
        { name: 'Rice & Naan', qty: 3, unitPrice: R(150), assignedTo: [meId, rohan.id, sneha.id, vikram.id] },
      ],
    });
  } catch (e) {
    console.warn('[seedDemo] itemized bill skipped:', e);
  }

  // --- Office Lunch: fully settled (tests the "all settled up" state) ------
  await insertTxn(db, { groupId: office.id, kind: 'expense', entryMode: 'quick', date: thisMonth(5), category: 'Eating Out', note: 'Team lunch', payments: [{ personId: meId, amount: R(1500) }], shares: [{ personId: meId, amount: R(500) }, { personId: priya.id, amount: R(500) }, { personId: vikram.id, amount: R(500) }] });
  await recordSettlement(db, { groupId: office.id, fromId: priya.id, toId: meId, amount: R(500), date: thisMonth(6), payMethod: 'upi', category: 'Shared Bill' });
  await recordSettlement(db, { groupId: office.id, fromId: vikram.id, toId: meId, amount: R(500), date: thisMonth(6), payMethod: 'cash', category: 'Shared Bill' });

  // --- Family: I owe THEM (they paid) → a "you owe" balance direction --------
  await insertTxn(db, { groupId: family.id, kind: 'expense', entryMode: 'quick', date: thisMonth(3), category: 'Groceries', note: 'Monthly groceries', payments: [{ personId: priya.id, amount: R(6000) }], shares: [{ personId: meId, amount: R(2000) }, { personId: priya.id, amount: R(2000) }, { personId: aarav.id, amount: R(2000) }] });
  await insertTxn(db, { groupId: family.id, kind: 'expense', entryMode: 'quick', date: thisMonth(8), category: 'Health & Pharmacy', note: 'Medicines', payments: [{ personId: aarav.id, amount: R(2400) }], shares: [{ personId: meId, amount: R(800) }, { personId: priya.id, amount: R(800) }, { personId: aarav.id, amount: R(800) }] });

  // --- Manali Trip: single expense + a full settle-back ----------------------
  await insertTxn(db, { groupId: manali.id, kind: 'expense', entryMode: 'quick', date: monthsBack(2, 20), category: 'Travel', note: 'Cabs & stay', payments: [{ personId: meId, amount: R(15000) }], shares: [{ personId: meId, amount: R(5000) }, { personId: rohan.id, amount: R(5000) }, { personId: vikram.id, amount: R(5000) }] });
  await recordSettlement(db, { groupId: manali.id, fromId: rohan.id, toId: meId, amount: R(5000), date: monthsBack(1, 5), payMethod: 'bank', category: 'Repayment' });

  // --- Category budgets (over / near / under, every cadence) --------------
  await setCategoryBudgets(db, personalId, [
    { category: 'Groceries', cadence: 'monthly', amount: R(8000) },     // spent ₹9,000 → OVER (red)
    { category: 'Eating Out', cadence: 'monthly', amount: R(3000) },    // spent ₹2,700 → NEAR (amber)
    { category: 'Fuel', cadence: 'monthly', amount: R(4000) },          // spent ₹1,500 → UNDER (green)
    { category: 'Rent', cadence: 'monthly', amount: R(22000) },
    { category: 'Shopping', cadence: 'monthly', amount: R(5000) },
    { category: 'Electricity', cadence: 'monthly', amount: R(2500) },
    { category: 'Chai & Snacks', cadence: 'daily', amount: R(50) },     // daily cadence
    { category: 'Insurance', cadence: 'yearly', amount: R(12000) },     // yearly cadence
    { category: 'Education', cadence: 'once', amount: R(6000) },        // one-time cadence (kept small so it doesn't dwarf the monthly pace)
  ]);
  await setCategoryBudgets(db, roommates.id, [
    { category: 'Groceries', cadence: 'monthly', amount: R(6000) },
    { category: 'Electricity', cadence: 'monthly', amount: R(2000) },
  ]);
  // A second group with its own (individual) budget → per-group Budget tab has variety.
  await setCategoryBudgets(db, family.id, [
    { category: 'Groceries', cadence: 'monthly', amount: R(3000) },
    { category: 'Health & Pharmacy', cadence: 'monthly', amount: R(1500) },
  ]);

  // --- Money profile (Total Money breakdown): cash + investments + credit
  await setMoneyProfile(db, {
    openingCash: R(300000),
    investments: R(150000),
    creditLimit: R(60000),
    creditUsed: R(10000),
  });

  // --- Savings: goals funded directly from cash (funded / reached / empty / deadline / w-draw)
  const emergency = await insertGoal(db, { name: 'Emergency Fund', target: R(100000), priority: 'high', icon: 'shield', color: '#0EA5E9', allocation: R(5000), frequency: 'monthly', locked: true });
  await fundGoal(db, emergency.id, R(40000), 'manual');                           // 40% funded, locked
  const trip = await insertGoal(db, { name: 'Goa Trip Fund', target: R(30000), priority: 'medium', icon: 'map', color: '#F472B6', category: 'Travel', allocation: R(5000), frequency: 'monthly', target_date: Date.now() + 60 * 86400000 });
  await fundGoal(db, trip.id, R(30000), 'manual');                                // reached (100%) + has deadline
  const laptop = await insertGoal(db, { name: 'New Laptop', target: R(80000), priority: 'medium', icon: 'monitor', color: '#818CF8', category: 'Electronics' });
  await fundGoal(db, laptop.id, R(15000), 'manual');                              // partial
  const vacation = await insertGoal(db, { name: 'Europe Vacation', target: R(50000), priority: 'low', icon: 'globe', color: '#34D399', allocation: R(3000), frequency: 'monthly', target_date: Date.now() + 200 * 86400000 });
  await fundGoal(db, vacation.id, R(4000), 'manual');
  await fundGoal(db, vacation.id, R(1000), 'auto');                                // auto-funded slice
  await withdrawFromGoal(db, vacation.id, R(2000), 'Changed plans');                    // withdrawal history → net ₹3,000
  const gift = await insertGoal(db, { name: 'Anniversary Gift', target: R(5000), priority: 'medium', icon: 'gift', color: '#F9A8D4' });
  await fundGoal(db, gift.id, R(6000), 'manual');                                  // OVER-funded (120%) edge case
  const overdue = await insertGoal(db, { name: 'Tax Payment', target: R(40000), priority: 'high', icon: 'percent', color: '#FCD34D', target_date: Date.now() - 10 * 86400000 });
  await fundGoal(db, overdue.id, R(20000), 'manual');                              // 50% funded, deadline PAST → overdue edge case
  // PRIMED FLOW: 97.5% funded → add just ₹500 to hit 100% and fire GoalCelebration.
  const almost = await insertGoal(db, { name: 'Weekend Getaway', target: R(20000), priority: 'medium', icon: 'map', color: '#2DD4BF' });
  await fundGoal(db, almost.id, R(19500), 'manual');
  await insertGoal(db, { name: 'New Phone', target: R(60000), priority: 'low', icon: 'smartphone', color: '#38BDF8' }); // 0% funded

  // --- Uncategorized: a co-member (Aarav) used a category that ISN'T in your
  // catalog to split an expense in a shared group you're in → it shows under
  // Categories → Uncategorized (adopt-or-leave) and folds into "Others" in your
  // analytics until you adopt it. This is the real "someone else's category" case.
  await insertTxn(db, {
    groupId: roommates.id, kind: 'expense', entryMode: 'quick', date: thisMonth(9),
    category: 'Poker Night', note: "Aarav's game night",
    payments: [{ personId: aarav.id, amount: R(1200) }],
    shares: [{ personId: meId, amount: R(400) }, { personId: aarav.id, amount: R(400) }, { personId: priya.id, amount: R(400) }],
  });

  // --- Import inbox: pending transactions to exercise the GPay import → Review
  // wizard (dashboard badge, Step 1 classify, Step 2 group split). Mix of
  // expense/income, some pre-categorized, one shareable-in-a-group, one uncategorized.
  await insertPending(db, [
    { date: thisMonth(20), amount: R(950), description: 'Sandeep Malik', kind: 'expense', category: null, direction: 'debit', raw: 'UPI 651859540084 · Paid to Sandeep Malik ₹950' },
    { date: thisMonth(20), amount: R(485), description: 'Select Infrastructure', kind: 'expense', category: 'Bills', direction: 'debit', raw: null },
    { date: thisMonth(19), amount: R(70), description: 'PVR LIMITED', kind: 'expense', category: 'Entertainment', direction: 'debit', raw: null },
    { date: thisMonth(19), amount: R(420), description: 'Amazon Pay', kind: 'expense', category: 'Shopping', direction: 'debit', raw: null },
    { date: thisMonth(18), amount: R(1000), description: 'PREM PURUSHOTTAM BHATI', kind: 'income', category: null, direction: 'credit', raw: null },
    { date: thisMonth(18), amount: R(2000), description: 'Om Prakash Basnet', kind: 'expense', category: null, direction: 'debit', raw: null },
    { date: thisMonth(17), amount: R(264), description: 'GOKUL MEDICAL STORE', kind: 'expense', category: 'Health & Pharmacy', direction: 'debit', raw: null },
    { date: thisMonth(17), amount: R(73), description: 'Rapido', kind: 'expense', category: 'Cab & Auto', direction: 'debit', raw: null },
    { date: thisMonth(16), amount: R(6000), description: 'Flat rent share', kind: 'expense', category: 'Rent', direction: 'debit', raw: null },
  ]);

  // Mark everything this seeder created as demo data (loadDemoData wipes first, so
  // all rows here are demo — except the preserved real "me" person and the real
  // Personal group). A flag for future "exclude demo" needs; nothing excludes on it yet.
  await db.execAsync(`
    UPDATE txn SET is_demo = 1;
    UPDATE savings_goal SET is_demo = 1;
    UPDATE pending_txn SET is_demo = 1;
    UPDATE budget_group SET is_demo = 1 WHERE is_personal = 0;
    UPDATE person SET is_demo = 1 WHERE is_me = 0;
  `);

  // Verify the writes actually landed — turns a silent "empty app" into a clear signal.
  const counts = await db.getFirstAsync<{ txns: number; people: number; groups: number; goals: number }>(
    `SELECT (SELECT COUNT(*) FROM txn WHERE is_deleted = 0)   AS txns,
            (SELECT COUNT(*) FROM person)                     AS people,
            (SELECT COUNT(*) FROM budget_group)               AS groups,
            (SELECT COUNT(*) FROM savings_goal)               AS goals`,
  );
  if (!counts || counts.txns === 0) {
    throw new Error(`Seed wrote no transactions (txns=${counts?.txns ?? 'null'}). The DB write didn't persist — please retry; if it repeats, screenshot this.`);
  }
  return `${counts.people} people · ${counts.groups} groups · ${counts.txns} transactions · ${counts.goals} goals — all written ✓`;
}
