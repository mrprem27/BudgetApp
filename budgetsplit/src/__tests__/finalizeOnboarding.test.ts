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
  groupName: null,
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

  // The people step used to insert contacts and stop, so the Groups tab still
  // said "No groups yet" to the user who had just listed their flatmates.
  it('turns the people answer into a real group with those members', async () => {
    const db = await seedFresh();
    await finalizeOnboarding(db, data({ people: ['Aarav', 'Riya'], groupName: 'Home' }));

    const groups = await getAllGroups(db);
    const created = groups.find(g => g.is_personal !== 1);
    expect(created?.name).toBe('Home');

    const members = await db.getAllAsync<{ person_id: string }>(
      'SELECT person_id FROM group_member WHERE group_id = ?', [created!.id],
    );
    expect(members).toHaveLength(3); // me + two contacts
    const persons = await getAllPersons(db);
    expect(persons.map(p => p.name).sort()).toEqual(['Aarav', 'Prem', 'Riya']);
  });

  it('creates no group when nobody was added', async () => {
    const db = await seedFresh();
    await finalizeOnboarding(db, data({ people: [], groupName: 'Home' }));
    expect((await getAllGroups(db)).filter(g => g.is_personal !== 1)).toHaveLength(0);
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
