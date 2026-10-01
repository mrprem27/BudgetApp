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

describe('groupSpend: mine and everyone\'s, over the rows it is given (U-88)', () => {
  const at = (d: number) => new Date(2026, 9, d, 12).getTime();
  const three = [{ personId: ME, amount: 300 }, { personId: 'a', amount: 300 }, { personId: 'b', amount: 300 }];
  it('adds my share and the whole bill', () => {
    expect(groupSpend([
      { kind: 'expense', shares: three },
      { kind: 'expense', shares: [{ personId: 'a', amount: 500 }] },      // not mine at all
    ], ME)).toEqual({ mine: 300, everyone: 1400 });
  });
  it('leaves out transfers, deleted entries and entries waiting for me', () => {
    expect(groupSpend([
      { kind: 'settlement', shares: [{ personId: 'a', amount: 900 }] },
      { kind: 'expense', shares: three, is_deleted: 1 },
      { kind: 'expense', shares: three, pendingApproval: true },
    ], ME)).toEqual({ mine: 0, everyone: 0 });
  });

  /*
   * Which rows: `totalsRows`. This month while no date is chosen, exactly the chosen dates
   * otherwise, through every filter but the search text.
   */
  describe('totalsRows: what a totals row adds up', () => {
    const { totalsRows, NO_FILTERS } = jest.requireActual('../lib/txnFilter') as typeof import('../lib/txnFilter');
    const now = new Date(2026, 9, 20).getTime();
    const row = (date: number, kind = 'expense', note: string | null = null) => ({ kind, date, category: 'Food', note, tags: null, payments: [], shares: three });
    const rows = [row(at(3), 'expense', 'pizza'), row(at(5)), row(new Date(2026, 8, 30).getTime()), row(at(6), 'income')];

    it('is this month while no date is chosen', () => {
      expect(totalsRows(rows, NO_FILTERS, now).map(r => r.date)).toEqual([at(3), at(5), at(6)]);
    });
    it('is exactly the chosen dates otherwise', () => {
      const sep = { ...NO_FILTERS, from: new Date(2026, 8, 1).getTime(), to: new Date(2026, 8, 30, 23, 59).getTime() };
      expect(totalsRows(rows, sep, now)).toHaveLength(1);
    });
    it('follows the kind filter, and never the search text', () => {
      expect(totalsRows(rows, { ...NO_FILTERS, kind: 'income' }, now)).toHaveLength(1);
      expect(totalsRows(rows, { ...NO_FILTERS, query: 'pizza' }, now)).toHaveLength(3);
    });
  });
});
