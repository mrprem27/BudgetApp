/**
 * Fixture personas for the money engine (`SPEC-ENGINE.md` §7): full ledgers built
 * through the real write paths, the same way `seedDemo.ts` builds the demo
 * ledger — never hand-inserted rows that skip the invariants those write paths
 * enforce.
 *
 * Every persona is built relative to `PERSONA_NOW`, a fixed instant, not
 * `Date.now()` — a test run a year from now must see the same ledger a test run
 * today does (§7 "determinism").
 */
import type * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { insertTxn } from './queries/transactions';
import { setCategoryBudgets } from './queries/categoryBudgets';
import { insertGoal } from './queries/savings';
import { setMoneyProfile } from './queries/moneyProfile';
import { seedGlobalCategories } from './seedCategories';

const DAY_MS = 86_400_000;
const R = (rupees: number) => Math.round(rupees * 100);

export type PersonaKind = 'salariedRenter' | 'freelancer' | 'student' | 'thinData' | 'diwaliSpike';

/** 26 Sep 2026, UTC midnight — every persona's "today". */
export const PERSONA_NOW = Date.UTC(2026, 8, 26);

export const ME_ID = 'persona-me';

/** A cheap deterministic wobble in `[lo, hi]`, keyed on an integer — no `Math.random()`. */
function wobble(seed: number, lo: number, hi: number): number {
  const frac = ((seed * 9301 + 49297) % 233280) / 233280;
  return lo + frac * (hi - lo);
}

/**
 * `insertGroup` never sets `is_personal` — that flag is reserved for the ONE
 * Personal group every phone gets at first run, written by hand exactly like
 * `seedDemo.ts`'s `createMeAndPersonal` writes it, or none of `getCashPosition`,
 * `getMyGlobalBudgetRows` or `getGoalFundingStatus` (all gated on it) would see
 * a persona's spend at all.
 */
async function base(db: SQLite.SQLiteDatabase): Promise<{ personalId: string }> {
  const personalId = uuid();
  const now = Date.now();
  await db.runAsync("INSERT INTO person (id, name, avatar_color, is_me) VALUES (?, 'Me', '#20C4B8', 1)", [ME_ID]);
  await seedGlobalCategories(db);
  await db.runAsync(
    `INSERT INTO budget_group
       (id, name, icon, color, carry_over, is_shared, is_archived, is_personal, simplify_debt, default_split, created_at, created_by)
     VALUES (?, 'Personal', 'credit-card', '#20C4B8', 0, 0, 0, 1, 1, 'equal', ?, ?)`,
    [personalId, now, ME_ID],
  );
  await db.runAsync(
    'INSERT INTO group_member (group_id, person_id, joined_at, role) VALUES (?, ?, ?, ?)',
    [personalId, ME_ID, now, 'admin'],
  );
  return { personalId };
}

/** Daily expenses from `fromMs` to `toMs` (exclusive), one per day, around `dailyAvgPaise`. */
async function everydaySpend(
  db: SQLite.SQLiteDatabase, groupId: string, fromMs: number, toMs: number,
  dailyAvgPaise: number, category: string,
): Promise<void> {
  let i = 0;
  for (let d = fromMs; d < toMs; d += DAY_MS, i++) {
    const amount = Math.round(dailyAvgPaise * wobble(i, 0.5, 1.5));
    if (amount <= 0) continue;
    await insertTxn(db, {
      groupId, kind: 'expense', entryMode: 'quick', date: d + 12 * 3_600_000, category,
      payments: [{ personId: ME_ID, amount }], shares: [{ personId: ME_ID, amount }],
    });
  }
}

/**
 * Salaried Bengaluru renter (`SPEC-ENGINE.md` §7): paid on the 1st, rent due on
 * the 5th, an annual school fee, 120 days of everyday spend, a Food budget.
 */
async function salariedRenter(db: SQLite.SQLiteDatabase) {
  const { personalId: g } = await base(db);
  await setMoneyProfile(db, {
    openingCash: R(40_000), openingBank: R(120_000), openingWallet: R(5_000),
    creditLimit: R(150_000), creditUsed: R(20_000),
  });
  await insertTxn(db, {
    groupId: g, kind: 'income', entryMode: 'quick', date: PERSONA_NOW - 3 * DAY_MS, category: 'Salary',
    recurFreq: 'monthly', payments: [{ personId: ME_ID, amount: R(80_000) }], shares: [],
  });
  await insertTxn(db, {
    groupId: g, kind: 'expense', entryMode: 'quick', date: PERSONA_NOW + 1 * DAY_MS, category: 'Rent',
    recurFreq: 'monthly', payments: [{ personId: ME_ID, amount: R(25_000) }], shares: [{ personId: ME_ID, amount: R(25_000) }],
  });
  // The ₹60k annual school fee the spec's worked example is built around (§3, §4 E4).
  await insertTxn(db, {
    groupId: g, kind: 'expense', entryMode: 'quick', date: Date.UTC(2027, 2, 15), category: 'Education',
    recurFreq: 'yearly', payments: [{ personId: ME_ID, amount: R(60_000) }], shares: [{ personId: ME_ID, amount: R(60_000) }],
  });
  await everydaySpend(db, g, PERSONA_NOW - 120 * DAY_MS, PERSONA_NOW, R(550), 'Food');
  await setCategoryBudgets(db, g, [{ category: 'Food', cadence: 'monthly', amount: R(18_000) }], { level: 'personal', actorId: ME_ID });
  await insertGoal(db, { name: 'Emergency fund', target: R(300_000), priority: 'emergency', allocation: R(5_000), frequency: 'monthly' });
}

/**
 * Freelancer, irregular income (§7: coefficient of variation ~0.6). No recurring
 * income rule — a handful of one-off payments at uneven amounts and intervals,
 * which is exactly what makes E2's income model classify it `irregular`.
 */
async function freelancer(db: SQLite.SQLiteDatabase) {
  const { personalId: g } = await base(db);
  await setMoneyProfile(db, {
    openingCash: R(15_000), openingBank: R(35_000), openingWallet: R(2_000),
    creditLimit: R(50_000), creditUsed: R(5_000),
  });
  const amounts = [R(90_000), R(30_000), R(120_000), R(15_000), R(60_000)]; // CV ≈ 0.6
  const gaps = [0, 22, 51, 68, 100]; // days back from PERSONA_NOW, uneven
  for (let i = 0; i < amounts.length; i++) {
    await insertTxn(db, {
      groupId: g, kind: 'income', entryMode: 'quick', date: PERSONA_NOW - gaps[i] * DAY_MS, category: 'Freelance',
      payments: [{ personId: ME_ID, amount: amounts[i] }], shares: [],
    });
  }
  await everydaySpend(db, g, PERSONA_NOW - 90 * DAY_MS, PERSONA_NOW, R(700), 'Shopping');
}

/** Student on a monthly allowance — small numbers throughout, light spend. */
async function student(db: SQLite.SQLiteDatabase) {
  const { personalId: g } = await base(db);
  await setMoneyProfile(db, { openingCash: R(2_000), openingBank: R(8_000), openingWallet: R(500), creditLimit: 0, creditUsed: 0 });
  await insertTxn(db, {
    groupId: g, kind: 'income', entryMode: 'quick', date: PERSONA_NOW - 2 * DAY_MS, category: 'Allowance',
    recurFreq: 'monthly', payments: [{ personId: ME_ID, amount: R(8_000) }], shares: [],
  });
  await everydaySpend(db, g, PERSONA_NOW - 60 * DAY_MS, PERSONA_NOW, R(150), 'Food');
}

/** Two months of history only (§7: "thin data") — below E2's 30/45/90-day minimums for most models. */
async function thinData(db: SQLite.SQLiteDatabase) {
  const { personalId: g } = await base(db);
  await setMoneyProfile(db, { openingCash: R(5_000), openingBank: R(10_000), openingWallet: 0, creditLimit: 0, creditUsed: 0 });
  await insertTxn(db, {
    groupId: g, kind: 'income', entryMode: 'quick', date: PERSONA_NOW - 20 * DAY_MS, category: 'Salary',
    payments: [{ personId: ME_ID, amount: R(40_000) }], shares: [],
  });
  await everydaySpend(db, g, PERSONA_NOW - 55 * DAY_MS, PERSONA_NOW, R(400), 'Food');
}

/** 14 months of history with one Diwali-month spending spike (§7). */
async function diwaliSpike(db: SQLite.SQLiteDatabase) {
  const { personalId: g } = await base(db);
  await setMoneyProfile(db, {
    openingCash: R(30_000), openingBank: R(90_000), openingWallet: R(3_000),
    creditLimit: R(100_000), creditUsed: R(10_000),
  });
  await insertTxn(db, {
    groupId: g, kind: 'income', entryMode: 'quick', date: PERSONA_NOW - 3 * DAY_MS, category: 'Salary',
    recurFreq: 'monthly', payments: [{ personId: ME_ID, amount: R(60_000) }], shares: [],
  });
  const months = 14;
  for (let m = 0; m < months; m++) {
    const monthStart = PERSONA_NOW - (m + 1) * 30 * DAY_MS;
    const monthEnd = monthStart + 30 * DAY_MS;
    await everydaySpend(db, g, monthStart, monthEnd, R(500), 'Food');
    // Diwali, one year back from "now" — a real one-time spike, not everyday spend.
    if (m === 11) {
      await insertTxn(db, {
        groupId: g, kind: 'expense', entryMode: 'quick', date: monthStart + 15 * DAY_MS, category: 'Shopping',
        payments: [{ personId: ME_ID, amount: R(40_000) }], shares: [{ personId: ME_ID, amount: R(40_000) }],
      });
    }
  }
}

const BUILDERS: Record<PersonaKind, (db: SQLite.SQLiteDatabase) => Promise<void>> = {
  salariedRenter, freelancer, student, thinData, diwaliSpike,
};

/** Build one persona's ledger, through the real write paths, on a fresh `db`. */
export async function buildPersona(db: SQLite.SQLiteDatabase, kind: PersonaKind): Promise<void> {
  await BUILDERS[kind](db);
}

export const PERSONA_KINDS: readonly PersonaKind[] = ['salariedRenter', 'freelancer', 'student', 'thinData', 'diwaliSpike'];
