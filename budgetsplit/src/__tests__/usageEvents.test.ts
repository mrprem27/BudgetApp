import { allowedProps, routeOf, track, USAGE_EVENTS } from '../lib/usageEvents';

// U-24: usage events carry only their listed keys, and nothing is sent without a token.
describe('usage events', () => {
  it('drop every key the event does not list — an amount, a name, a note cannot leave', () => {
    expect(allowedProps('Entry saved', { kind: 'expense', amount: 45000, note: 'dinner with Riya', category: 'Food' }))
      .toEqual({ kind: 'expense' });
    expect(allowedProps('Afford checked', { verdict: 'tight', frequency: 'once', amountPaise: 500000 }))
      .toEqual({ verdict: 'tight', frequency: 'once' });
  });
  it('lists no key that could carry money or a person', () => {
    const keys = Object.values(USAGE_EVENTS).flat();
    expect(keys.filter(k => /amount|paise|name|note|email|category|person|group|vpa|phone/i.test(k))).toEqual([]);
  });
  it('names a route by its shape, never its id', () => {
    expect(routeOf(['(people)', 'group', '[id]'])).toBe('/group/[id]');
    expect(routeOf(['(tabs)'])).toBe('/');
  });
  it('is a no-op without a token', () => {
    expect(() => track('Screen', { route: '/' })).not.toThrow();
  });
});
