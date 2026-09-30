import { setMoneyProfile } from '../db/queries/moneyProfile';
import { moneySumLines, openingFor } from '../lib/moneySum';
import { getCashPosition, fundGoal, insertGoal } from '../db/queries/savings';
import { payCardBill } from '../db/queries/spendPower';
import { createTestDb, addPerson, addGroup, addMember, addTxn, asDb } from './helpers/testDb';

describe('moneySumLines', () => {
  it('adds the places up to Spendable, then Net worth, largest place first', () => {
    const { lines, spendable, netWorth } = moneySumLines({
      places: { bank: 50000, cash: 2000, wallet: 8000 }, investments: 100000, creditUsed: 5000,
    });
    expect(lines.map(l => `${l.op}${l.key}`)).toEqual(['bank', '+wallet', '+cash', '=spendable', '+invested', '−card', '=networth']);
    expect(spendable).toBe(60000);
    expect(netWorth).toBe(155000);
  });

  it('takes goal money off with its own line, so the places still add up', () => {
    const { lines, spendable } = moneySumLines({
      places: { bank: 50000, cash: 0, wallet: 0 }, inGoals: 10000, investments: 0, creditUsed: 0,
    });
    expect(lines.find(l => l.key === 'goals')).toEqual({ key: 'goals', op: '−', value: 10000 });
    expect(spendable).toBe(40000);
    expect(lines.some(l => l.key === 'card')).toBe(false);
  });

  it('works out the starting figure that makes a place read what was typed', () => {
    // Started at 10,000, spent 3,000 since (now 7,000); the bank app says 6,500.
    expect(openingFor(6500, 7000, 10000)).toBe(9500);
  });
});

describe('the sum matches the real Spendable', () => {
  it('with spending and money in a goal, places + unattributed − goals = available', async () => {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const g = addGroup(db, 'Personal', true);
    addMember(db, g, me);
    await setMoneyProfile(asDb(db), { openingBank: 1000000, openingCash: 50000 });
    addTxn(db, { groupId: g, kind: 'expense', date: 1, category: 'Food', payments: [{ personId: me, amount: 30000 }], shares: [{ personId: me, amount: 30000 }] });
    addTxn(db, { groupId: g, kind: 'income', date: 2, category: 'Salary', payments: [{ personId: me, amount: 200000 }] });
    const goal = await insertGoal(asDb(db), { name: 'Trip', target: 500000, priority: 'want' });
    await fundGoal(asDb(db), goal.id, 70000);
    // A card bill paid: before U-48 no place went down, and the sum stopped adding up.
    await payCardBill(asDb(db), 25000);

    const pos = await getCashPosition(asDb(db));
    const { spendable } = moneySumLines({
      places: pos.byBucket!, unattributed: pos.unattributed, inGoals: pos.savings, investments: 0, creditUsed: 0,
    });
    expect(pos.savings).toBe(70000);
    expect(spendable).toBe(pos.available);
  });
});
