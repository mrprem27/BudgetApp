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

const data = (over: Partial<OnboardingData> = {}): OnboardingData => ({
  intent: 'both',
  name: 'Prem',
  incomeNum: 50000,
  payday: 5,
  budgetNum: 30000,
  people: [],
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

    // The salary is a recurring INCOME rule anchored to pay-day — the record of
    // both the amount and the date (nothing is stored as a preference).
    const rules = await getRecurringForGroup(db, 'personal');
    const salary = rules.find(r => r.kind === 'income');
    expect(salary).toBeTruthy();
    expect(salary!.recur_freq).toBe('monthly');
    expect(salary!.payments[0].amount).toBe(50000 * 100);
    expect(salary!.date).toBe(paydayAnchor(5));

    expect(await settings.budgetTarget()).toBe(30000 * 100);
    const money = await getMoneyProfile(db);
    // Lands in BANK, not cash-in-hand: "what do you have right now" is an account
    // balance for almost everyone, and INCOME_LANDING_DEFAULT is Bank for the same reason.
    expect(money.openingBank).toBe(5000000);
    expect(money.creditUsed).toBe(200000);
  });

  it('turns the people answer into contacts, with the email when one was given', async () => {
    const db = await seedFresh();
    await finalizeOnboarding(db, data({
      people: [{ name: 'Aarav', email: 'aarav@example.com' }, { name: 'Riya' }],
    }));

    const persons = await getAllPersons(db);
    expect(persons.map(p => p.name).sort()).toEqual(['Aarav', 'Prem', 'Riya']);
    // The email is the only identifier that is the same string on both phones, so
    // it is what a friend request is addressed to later.
    expect(persons.find(p => p.name === 'Aarav')?.email).toBe('aarav@example.com');
    // Optional means optional: no email must leave the column null, not ''.
    expect(persons.find(p => p.name === 'Riya')?.email ?? null).toBeNull();
  });

  /**
   * Onboarding no longer builds a group. It used to — name from three chips, icon
   * inferred from that name string, colour hard-coded — which bypassed `GroupForm`
   * and made this the one place a group could be created wrong. The step asks who
   * you split with; which groups they belong in is asked where groups are made.
   */
  it('creates no group, even when people were added', async () => {
    const db = await seedFresh();
    await finalizeOnboarding(db, data({ people: [{ name: 'Aarav' }, { name: 'Riya' }] }));

    expect((await getAllGroups(db)).filter(g => g.is_personal !== 1)).toHaveLength(0);
    // …and the contacts still exist. Dropping the group must not drop the people.
    expect((await getAllPersons(db)).map(p => p.name).sort()).toEqual(['Aarav', 'Prem', 'Riya']);
  });

  it('skips blank names and de-duplicates nothing it was not given', async () => {
    const db = await seedFresh();
    await finalizeOnboarding(db, data({ people: [{ name: '  ' }, { name: ' Riya ' }] }));
    expect((await getAllPersons(db)).map(p => p.name).sort()).toEqual(['Prem', 'Riya']);
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
