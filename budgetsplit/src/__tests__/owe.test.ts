import { oweView } from '../lib/owe';
import { colors } from '../constants/colors';
import { summarizeExposure } from '../db/queries/balances';
import type { FriendBalance } from '../db/queries/balances';

describe('oweView', () => {
  it('treats a negative net as "you owe" (coral, − sign)', () => {
    const ov = oweView(-50000);
    expect(ov.direction).toBe('owe');
    expect(ov.amount).toBe(50000);
    expect(ov.color).toBe(colors.expense);
    expect(ov.sign).toBe('−');
    expect(ov.label).toBe('You owe');
    expect(ov.withName('Rohan')).toBe('You owe Rohan');
    expect(ov.thirdPerson).toBe('Owes');
  });

  it('treats a positive net as "owes you" (green, + sign)', () => {
    const ov = oweView(80000);
    expect(ov.direction).toBe('owed');
    expect(ov.amount).toBe(80000);
    expect(ov.color).toBe(colors.income);
    expect(ov.sign).toBe('+');
    expect(ov.label).toBe('Owes you');
    expect(ov.withName('Rohan')).toBe('Rohan owes you');
    expect(ov.thirdPerson).toBe('Owed');
  });

  it('treats a zero net as settled (muted, no sign)', () => {
    const ov = oweView(0);
    expect(ov.direction).toBe('settled');
    expect(ov.amount).toBe(0);
    expect(ov.color).toBe(colors.textMuted);
    expect(ov.sign).toBe('');
    expect(ov.label).toBe('Settled up');
    expect(ov.withName('Rohan')).toBe('Settled up');
  });
});

describe('summarizeExposure', () => {
  const fb = (personId: string, net: number): FriendBalance => ({
    personId, name: personId, avatarColor: '#000', imageUri: null, net, groupCount: 1,
  });

  it('splits into owe / owed totals and counts, counting each person once', () => {
    // Alice owes me, I owe Bob, Carol is settled.
    const exp = summarizeExposure([fb('alice', 30000), fb('bob', -50000), fb('carol', 0)]);
    expect(exp.owed).toBe(30000);
    expect(exp.owe).toBe(50000);
    expect(exp.owedPeople).toBe(1);
    expect(exp.owePeople).toBe(1);
    expect(exp.net).toBe(30000 - 50000);
  });

  it('uses the per-person net (a credit and debt across groups already netted by getFriendBalances)', () => {
    // One person nets to a single figure — never double-counted in both buckets.
    const exp = summarizeExposure([fb('dan', -20000)]);
    expect(exp.owe).toBe(20000);
    expect(exp.owed).toBe(0);
    expect(exp.owePeople).toBe(1);
    expect(exp.owedPeople).toBe(0);
  });

  it('is all-zero when everyone is settled', () => {
    const exp = summarizeExposure([fb('a', 0), fb('b', 0)]);
    expect(exp).toMatchObject({ owe: 0, owed: 0, net: 0, owePeople: 0, owedPeople: 0 });
  });
});
