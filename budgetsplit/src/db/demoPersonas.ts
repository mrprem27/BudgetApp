/**
 * Demo personas — whole, self-consistent ledgers for the QA screen, each chosen to put the money
 * engine in a different state. Built through the real write paths, relative to TODAY (unlike the
 * fixed-date test personas in `enginePersonas.ts`, which tests pin numbers against).
 *
 *   established — a year of salary, rent, flatmates, goals: the showcase; engine confidence high
 *   newUser     — two weeks in: the engine holds its verdict back and says how long until it won't
 *   freelancer  — lumpy payments and no salary rule: irregular income, 60-day horizon, medium confidence
 *   student     — a small allowance, owes friends, over budget: "Not right now", the 1.3× display
 */
import type * as SQLite from 'expo-sqlite';
import { insertTxn, recordSettlement } from './queries/transactions';
import { insertPerson } from './queries/persons';
import { insertGroup } from './queries/groups';
import { setCategoryBudgets } from './queries/categoryBudgets';
import { setMoneyProfile } from './queries/moneyProfile';
import { insertGoal, fundGoal } from './queries/savings';
import { loadDemoData, startFresh } from './seedDemo';
import { PayMethod } from '../constants/enums';

export type DemoPersona = 'established' | 'newUser' | 'freelancer' | 'student';

export const DEMO_PERSONAS: ReadonlyArray<{ key: DemoPersona; label: string; blurb: string }> = [
  { key: 'established', label: 'Salaried renter · 1 year', blurb: 'Full history, flatmates, trips, goals' },
  { key: 'newUser', label: 'New user · 2 weeks', blurb: 'Too little history for a verdict yet' },
  { key: 'freelancer', label: 'Freelancer', blurb: 'Irregular income, no salary' },
  { key: 'student', label: 'Student · tight month', blurb: 'Small allowance, owes friends, over budget' },
];

const DAY = 86_400_000;
const R = (rupees: number) => Math.round(rupees * 100);

/** A deterministic 0.5–1.5 wobble, so a persona looks lived-in without being random. */
const wobble = (i: number) => 0.5 + ((i * 9301 + 49297) % 233280) / 233280;

/** A day `back` days ago, at `hour`. */
const daysAgo = (back: number, hour = 12) => {
  const d = new Date(Date.now() - back * DAY); d.setHours(hour, 0, 0, 0); return d.getTime();
};

type Ctx = { db: SQLite.SQLiteDatabase; meId: string; personalId: string };

function spend(c: Ctx, category: string, rupees: number, back: number, note?: string, pay?: PayMethod) {
  return insertTxn(c.db, {
    groupId: c.personalId, kind: 'expense', entryMode: 'quick', date: daysAgo(back), category, note, payMethod: pay,
    payments: [{ personId: c.meId, amount: R(rupees) }], shares: [{ personId: c.meId, amount: R(rupees) }],
  });
}

function earn(c: Ctx, category: string, rupees: number, back: number, note?: string) {
  return insertTxn(c.db, {
    groupId: c.personalId, kind: 'income', entryMode: 'quick', date: daysAgo(back, 10), category, note,
    payments: [{ personId: c.meId, amount: R(rupees) }], shares: [],
  });
}

/** One everyday purchase a day for `days` days, rotating through `mix`. */
async function everyday(c: Ctx, days: number, dailyRupees: number, mix: string[]) {
  for (let i = 1; i <= days; i++) {
    await spend(c, mix[i % mix.length], Math.max(10, Math.round(dailyRupees * wobble(i))), i, undefined, i % 3 === 0 ? PayMethod.Cash : PayMethod.Upi);
  }
}

async function newUser(db: SQLite.SQLiteDatabase): Promise<string> {
  const c: Ctx = { db, ...(await startFresh(db)) };
  await setMoneyProfile(db, { openingBank: R(60_000), openingCash: R(3_000), openingWallet: R(1_000), creditLimit: 0, creditUsed: 0 });
  await earn(c, 'Salary', 52_000, 12, 'First salary here');
  await spend(c, 'Rent', 16_000, 11, 'Rent', PayMethod.Bank);
  await everyday(c, 13, 380, ['Groceries', 'Chai & Snacks', 'Cab & Auto', 'Eating Out']);
  return '2 weeks of entries · no rules yet';
}

async function freelancer(db: SQLite.SQLiteDatabase): Promise<string> {
  const c: Ctx = { db, ...(await startFresh(db)) };
  await setMoneyProfile(db, { openingBank: R(45_000), openingCash: R(4_000), openingWallet: R(2_000), creditLimit: R(80_000), creditUsed: R(12_000) });
  // Uneven clients, uneven gaps: the engine reads this as irregular and widens its horizon.
  const jobs: Array<[number, number, string]> = [[95_000, 150, 'Brand identity'], [28_000, 118, 'Logo refresh'],
    [140_000, 84, 'Website build'], [16_000, 55, 'Pitch deck'], [72_000, 21, 'App UI']];
  for (const [amt, back, note] of jobs) await earn(c, 'Freelance', amt, back, note);
  for (let m = 0; m < 5; m++) await spend(c, 'Rent', 18_000, 3 + m * 30, 'Studio flat', PayMethod.Bank);
  await insertTxn(db, {
    groupId: c.personalId, kind: 'expense', entryMode: 'quick', date: daysAgo(-9), category: 'Bills',
    note: 'Design tools', recurFreq: 'monthly', recurInterval: 1,
    payments: [{ personId: c.meId, amount: R(1_800) }], shares: [{ personId: c.meId, amount: R(1_800) }],
  });
  await everyday(c, 120, 620, ['Groceries', 'Eating Out', 'Cab & Auto', 'Chai & Snacks', 'Shopping']);
  await setCategoryBudgets(db, c.personalId, [{ category: 'Eating Out', cadence: 'monthly', amount: R(5_000) }], { level: 'group', actorId: c.meId });
  const buffer = await insertGoal(db, { name: 'Three-month buffer', target: R(150_000), priority: 'emergency', icon: 'shield', color: '#0EA5E9' });
  await fundGoal(db, buffer.id, R(40_000), 'manual');
  return '5 months · 5 client payments · no salary rule';
}

async function student(db: SQLite.SQLiteDatabase): Promise<string> {
  const c: Ctx = { db, ...(await startFresh(db)) };
  await setMoneyProfile(db, { openingBank: R(3_500), openingCash: R(600), openingWallet: R(250), creditLimit: 0, creditUsed: 0 });
  // The allowance lands on the 1st; logged for the past three months, the rule carries it on.
  for (let m = 1; m <= 3; m++) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - m + 1); d.setHours(10, 0, 0, 0);
    if (d.getTime() <= Date.now()) {
      await insertTxn(db, { groupId: c.personalId, kind: 'income', entryMode: 'quick', date: d.getTime(), category: 'Other Income', note: 'From home', payments: [{ personId: c.meId, amount: R(9_000) }], shares: [] });
    }
  }
  const next = new Date(); next.setDate(1); next.setMonth(next.getMonth() + 1); next.setHours(10, 0, 0, 0);
  await insertTxn(db, { groupId: c.personalId, kind: 'income', entryMode: 'quick', date: next.getTime(), category: 'Other Income', note: 'From home', recurFreq: 'monthly', recurInterval: 1, payments: [{ personId: c.meId, amount: R(9_000) }], shares: [] });
  await everyday(c, 75, 105, ['Chai & Snacks', 'Metro & Bus', 'Education']);
  // Eating out this month is well past its budget — the over-budget multiple shows on Home.
  const today = new Date().getDate();
  for (let i = 0; i < Math.min(6, today); i++) await spend(c, 'Eating Out', 330, i, i === 0 ? 'Birthday treat' : undefined, PayMethod.Upi);
  await setCategoryBudgets(db, c.personalId, [{ category: 'Eating Out', cadence: 'monthly', amount: R(1_500) }], { level: 'group', actorId: c.meId });

  // Hostel friends: they fronted the trip and the food, so I owe them.
  const kabir = await insertPerson(db, 'Kabir', '#F0A500');
  const ananya = await insertPerson(db, 'Ananya', '#3ECF8E');
  const hostel = await insertGroup(db, 'Hostel 4B', 'home', '#7C6AF7', [c.meId, kabir.id, ananya.id], 'equal', c.meId);
  const split3 = (payer: string, rupees: number, back: number, category: string, note: string) => insertTxn(db, {
    groupId: hostel.id, kind: 'expense', entryMode: 'quick', date: daysAgo(back), category, note,
    payments: [{ personId: payer, amount: R(rupees) }],
    shares: [c.meId, kabir.id, ananya.id].map(p => ({ personId: p, amount: R(rupees / 3) })),
  });
  await split3(kabir.id, 2_400, 20, 'Travel', 'Weekend trip, bus tickets');
  await split3(ananya.id, 1_200, 9, 'Groceries', 'Maggi & snacks run');
  await split3(c.meId, 900, 5, 'WiFi & Broadband', 'Room WiFi');
  await recordSettlement(db, { groupId: hostel.id, fromId: c.meId, toId: kabir.id, amount: R(300), date: daysAgo(3), payMethod: PayMethod.Upi, category: 'Repayment' });
  const laptop = await insertGoal(db, { name: 'Laptop for college', target: R(45_000), priority: 'need', icon: 'monitor', color: '#818CF8' });
  await fundGoal(db, laptop.id, R(6_000), 'manual');
  return '3 months · allowance · owes 2 friends · over budget';
}

const BUILDERS: Record<DemoPersona, (db: SQLite.SQLiteDatabase) => Promise<string>> = {
  established: loadDemoData, newUser, freelancer, student,
};

/** Replace everything with one persona. Returns a one-line summary for the toast. */
export function loadDemoPersona(db: SQLite.SQLiteDatabase, persona: DemoPersona): Promise<string> {
  return BUILDERS[persona](db);
}
