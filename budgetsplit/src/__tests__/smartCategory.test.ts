import { matchCategory } from '../lib/smartCategory';

const CATS = [
  { name: 'Cab & Auto' }, { name: 'Groceries' }, { name: 'Food Delivery' },
  { name: 'Shopping' }, { name: 'Rent' }, { name: 'Eating Out' }, { name: 'Other' },
];

describe('matchCategory', () => {
  it('matches by keyword', () => {
    expect(matchCategory('uber to office', CATS)).toBe('Cab & Auto');
    expect(matchCategory('Swiggy dinner', CATS)).toBe('Food Delivery');
    expect(matchCategory('bigbasket groceries', CATS)).toBe('Groceries');
    expect(matchCategory('amazon order', CATS)).toBe('Shopping');
    expect(matchCategory('monthly rent', CATS)).toBe('Rent');
  });

  it('is case-insensitive', () => {
    expect(matchCategory('UBER', CATS)).toBe('Cab & Auto');
  });

  it('returns null when no keyword matches', () => {
    expect(matchCategory('xyz random thing', CATS)).toBeNull();
    expect(matchCategory('', CATS)).toBeNull();
  });

  it('only returns categories that exist in the list', () => {
    // "petrol" maps to Fuel, which is NOT in CATS → null
    expect(matchCategory('petrol', CATS)).toBeNull();
  });
});
