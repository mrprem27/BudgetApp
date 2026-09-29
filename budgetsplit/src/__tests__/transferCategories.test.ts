import { TRANSFER_HIDDEN_FROM_PICKER, TRANSFER_SECTIONS, INVESTMENT_CATEGORY } from '../constants/categories';

/** A transfer is money moved, not spending: Rent and Investment are not reasons to settle up. */
describe('transfer reasons', () => {
  it('hides Rent and Investment from every picker', () => {
    expect([...TRANSFER_HIDDEN_FROM_PICKER].sort()).toEqual([INVESTMENT_CATEGORY, 'Rent'].sort());
  });

  it('lists neither Rent nor a hidden name under the Transfers section', () => {
    const transfers = TRANSFER_SECTIONS.find(s => s.title === 'Transfers')!.names;
    for (const n of TRANSFER_HIDDEN_FROM_PICKER) expect(transfers).not.toContain(n);
  });
});
