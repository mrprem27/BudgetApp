import AsyncStorage from '@react-native-async-storage/async-storage';
import { openTestDb, seedGroupAndMe } from './dbHarness';
import { finalizeOnboarding, paydayAnchor, type OnboardingData } from '../lib/onboarding';
import { getAllGroups } from '../db/queries/groups';
import { getAllPersons } from '../db/queries/persons';
import { getRecurringForGroup } from '../db/queries/recurring';
import { getMoneyProfile } from '../db/queries/moneyProfile';
import { getReminderPrefs } from '../lib/reminderPrefsStore';
import { settings } from '../lib/settings';
import { PayMethod } from '../constants/enums';

const store = AsyncStorage as unknown as { __reset: () => void };
beforeEach(() => store.__reset());

// Deliberately not local midnight — 3:30pm — so the salary-rule assertion below
// can prove `paydayAnchor` floors it (`SPEC-2026-09-FEEDBACK.md` §2 O4: "Default time to 12:00
// AM"), rather than merely echoing back whatever `firstPayDate` already was.
const NEXT_PAY = new Date(2026, 9, 5, 15, 30).getTime();

const data = (over: Partial<OnboardingData> = {}): OnboardingData => ({
  intent: 'both',
  name: 'Prem',
  incomeNum: 50000,
  firstPayDate: NEXT_PAY,
  budgetNum: 30000,
  addFirst: false,
  payMethod: PayMethod.Upi,
  money: { openingBank: 5000000, investments: 0, creditLimit: 10000000, creditUsed: 200000 },
  ...over,
});

/** Personal group + me, matching what `seedIfNeeded` produces before onboarding. */
async function seedFresh() {
  const db = await openTestDb();
  await seedGroupAndMe(db, { groupId: 'personal', meId: 'me', isPersonal: 1 });
  return db;
}

describe('finalizeOnboarding — every answer lands somewhere', () => {
  it('writes the name, the salary rule, the budget target and the money profile', async () => {
    const db = await seedFresh();
    expect(await finalizeOnboarding(db, data())).toBe(true);

    const persons = await getAllPersons(db);
    expect(persons.find(p => p.is_me === 1)?.name).toBe('Prem');

    // The salary is a recurring INCOME rule dated to the exact next-payment
    // date picked — the record of both the amount and the date (nothing is
    // stored as a preference).
    const rules = await getRecurringForGroup(db, 'personal');
    const salary = rules.find(r => r.kind === 'income');
    expect(salary).toBeTruthy();
    expect(salary!.recur_freq).toBe('monthly');
    expect(salary!.payments[0].amount).toBe(50000 * 100);
    // Floored to local midnight, not the 3:30pm `NEXT_PAY` was given as —
    // proves `paydayAnchor` normalizes rather than only being called.
    expect(salary!.date).toBe(new Date(2026, 9, 5, 0, 0, 0, 0).getTime());

    expect(await settings.budgetTarget()).toBe(30000 * 100);
    const money = await getMoneyProfile(db);
    // Lands in BANK, not cash-in-hand: "what do you have right now" is an account
    // balance for almost everyone, and INCOME_LANDING_DEFAULT is Bank for the same reason.
    expect(money.openingBank).toBe(5000000);
    expect(money.creditUsed).toBe(200000);
  });

  /**
   * Onboarding no longer collects people at all (`SPEC-2026-09-FEEDBACK.md` §2 O6 — the question
   * moved to Friends). The five tests this replaces covered the person-insertion
   * loop that used to live in `finalizeOnboarding`; that loop is gone with the
   * step that fed it, so what's left to prove is only that a group is still
   * never created here — the reasoning that used to sit beside those tests.
   */
  it('creates no group', async () => {
    const db = await seedFresh();
    await finalizeOnboarding(db, data());

    expect((await getAllGroups(db)).filter(g => g.is_personal !== 1)).toHaveLength(0);
  });

  /**
   * `SPEC-2026-09-FEEDBACK.md` §2 O5 — nothing is WRITTEN for a chip the user never ticked, not
   * a zero standing in for it. `getMoneyProfile`'s read side always defaults a
   * missing figure to 0 (`money.openingBank` etc. below), so the only place
   * the difference is visible is `updatedAt`/`cardBaselineAt`: a write with
   * every field `undefined` is `setMoneyProfileRows`' `entries.length === 0`
   * early-return, so it never stamps them at all.
   */
  it('writes nothing when no money figure was ticked, not zeros', async () => {
    const db = await seedFresh();
    await finalizeOnboarding(db, data({ money: { investments: 0 } }));

    const money = await getMoneyProfile(db);
    expect(money.openingBank).toBe(0);   // the read side still defaults, as always
    expect(money.updatedAt).toBeNull();  // but no write happened to produce that 0
    expect(money.cardBaselineAt).toBeNull();
  });

  it('a partial pick writes only what was ticked', async () => {
    const db = await seedFresh();
    // Bank ticked, nothing else — the common case (only one bucket of five).
    await finalizeOnboarding(db, data({ money: { investments: 0, openingBank: 500000 } }));

    const money = await getMoneyProfile(db);
    expect(money.openingBank).toBe(500000);
    expect(money.updatedAt).not.toBeNull(); // a write did happen
    // Everything else stayed untouched — reads at its default, same as if
    // this were a brand-new profile nobody had written to at all.
    expect(money.openingCash).toBe(0);
    expect(money.openingWallet).toBe(0);
    expect(money.creditLimit).toBe(0);
    expect(money.creditUsed).toBe(0);
  });

  // V2-02: with no sync, a lost phone is total data loss and the backup nudge is
  // the only mitigation — it must not depend on the user having accepted the
  // notification prompt during onboarding.
  it('turns the backup reminder on by default', async () => {
    const db = await seedFresh();
    await finalizeOnboarding(db, data());
    expect((await getReminderPrefs()).backup).toBe(true);
  });

  it('applies the persona flags (a persona that trims is not cosmetic)', async () => {
    const db = await seedFresh();
    await finalizeOnboarding(db, data({ intent: 'personal' }));
    expect(await settings.onboardingIntent()).toBe('personal');
  });

  /**
   * Preservation: each piece is best-effort, so a later failure must not undo an
   * earlier write. Skipping an answer must leave *that* artifact absent and
   * every other one intact.
   */
  it('a skipped answer removes only its own artifact', async () => {
    const db = await seedFresh();
    await finalizeOnboarding(db, data({ incomeNum: 0, budgetNum: 0 }));

    // Skipped: no salary rule, no budget target.
    expect((await getRecurringForGroup(db, 'personal')).filter(r => r.kind === 'income')).toHaveLength(0);
    expect(await settings.budgetTarget()).toBeNull();
    // Preserved: name and money profile still written.
    expect((await getAllPersons(db)).find(p => p.is_me === 1)?.name).toBe('Prem');
    expect((await getMoneyProfile(db)).openingBank).toBe(5000000);
  });
});

describe('default pay method', () => {
  it('persists the pay method chosen on the money step', async () => {
    const db = await openTestDb();
    await seedGroupAndMe(db);
    await finalizeOnboarding(db, data({ payMethod: PayMethod.Cash }));
    expect(await settings.defaultPayMethod()).toBe('cash');
  });
});

describe('paydayAnchor', () => {
  it('floors a date to local midnight, whatever time it was given', () => {
    const evening = new Date(2026, 2, 14, 23, 59, 59, 999).getTime();
    expect(paydayAnchor(evening)).toBe(new Date(2026, 2, 14, 0, 0, 0, 0).getTime());
  });

  it('leaves a date already at midnight unchanged', () => {
    const midnight = new Date(2026, 2, 14, 0, 0, 0, 0).getTime();
    expect(paydayAnchor(midnight)).toBe(midnight);
  });

  it('never moves the calendar date, only the time — no month/day drift', () => {
    // A defensive check against the DST-adjacent off-by-one this kind of
    // flooring is prone to: 1 Jan, floored, must still read as 1 Jan.
    const newYearMorning = new Date(2026, 0, 1, 6, 0, 0, 0).getTime();
    const floored = new Date(paydayAnchor(newYearMorning));
    expect(floored.getFullYear()).toBe(2026);
    expect(floored.getMonth()).toBe(0);
    expect(floored.getDate()).toBe(1);
  });
});
