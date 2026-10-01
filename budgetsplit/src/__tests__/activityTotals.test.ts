import { activityTotals, groupSpend, type TotalsRow } from '../lib/activityTotals';

const ME = 'me';
const row = (r: Partial<TotalsRow> & Pick<TotalsRow, 'kind'>): TotalsRow =>
  ({ isPersonal: false, payments: [], shares: [], ...r });

describe('activityTotals (U-52)', () => {
  it('counts my share as spent, not the whole bill I paid', () => {
    // I paid ₹900 for three; my share is ₹300.
    const t = activityTotals([row({ kind: 'expense', payments: [{ personId: ME, amount: 900 }],
      shares: [{ personId: ME, amount: 300 }, { personId: 'a', amount: 300 }, { personId: 'b', amount: 300 }] })], ME);
    expect(t).toEqual({ spent: 300, income: 0 });
  });

  it('counts a share someone else paid for as spent', () => {
    const t = activityTotals([row({ kind: 'expense', payments: [{ personId: 'a', amount: 400 }],
      shares: [{ personId: ME, amount: 200 }, { personId: 'a', amount: 200 }] })], ME);
    expect(t).toEqual({ spent: 200, income: 0 });
  });

  it('never counts a transfer as spending or income', () => {
    // I pay Asha back ₹200.
    const t = activityTotals([row({ kind: 'settlement', payments: [{ personId: ME, amount: 200 }],
      shares: [{ personId: 'a', amount: 200 }] })], ME);
    expect(t).toEqual({ spent: 0, income: 0 });
  });

  it('counts a card bill and an asset move as neither', () => {
    const t = activityTotals([
      row({ kind: 'expense', isPersonal: true, payments: [{ personId: ME, amount: 500 }], shares: [{ personId: ME, amount: 500 }] }),
      row({ kind: 'settlement', isPersonal: true, payments: [{ personId: ME, amount: 3000 }] }),           // card bill
      row({ kind: 'settlement', isPersonal: false, asset_id: 'gold', payments: [{ personId: ME, amount: 1000 }] }),
      row({ kind: 'income', isPersonal: true, payments: [{ personId: ME, amount: 50000 }] }),
    ], ME);
    expect(t).toEqual({ spent: 500, income: 50000 });
  });

  it('adds nothing for an entry still waiting for my approval', () => {
    const t = activityTotals([row({ kind: 'expense', pendingApproval: true, payments: [{ personId: 'a', amount: 400 }],
      shares: [{ personId: ME, amount: 400 }] })], ME);
    expect(t).toEqual({ spent: 0, income: 0 });
  });
});

describe('groupSpend: a group\'s month, mine and everyone\'s (U-88)', () => {
  const at = (d: number) => new Date(2026, 9, d, 12).getTime();
  const from = new Date(2026, 9, 1).getTime();
  const three = [{ personId: ME, amount: 300 }, { personId: 'a', amount: 300 }, { personId: 'b', amount: 300 }];
  it('adds my share and the whole bill, this month only', () => {
    expect(groupSpend([
      { kind: 'expense', date: at(3), shares: three },
      { kind: 'expense', date: at(5), shares: [{ personId: 'a', amount: 500 }] },      // not mine at all
      { kind: 'expense', date: new Date(2026, 8, 30).getTime(), shares: three },        // last month
    ], ME, from)).toEqual({ mine: 300, everyone: 1400 });
  });
  it('leaves out transfers, deleted entries and entries waiting for me', () => {
    expect(groupSpend([
      { kind: 'settlement', date: at(3), shares: [{ personId: 'a', amount: 900 }] },
      { kind: 'expense', date: at(3), shares: three, is_deleted: 1 },
      { kind: 'expense', date: at(3), shares: three, pendingApproval: true },
    ], ME, from)).toEqual({ mine: 0, everyone: 0 });
  });
});

