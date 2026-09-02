import { DEFAULTS } from '../lib/featureFlags';
import { doc } from './helpers/systemDoc';

/**
 * `featureFlags.test.ts` proves every flag gates a real surface and appears on the
 * Features screen. This proves the same keys are in the register a person reads.
 */

describe('SYSTEM.md §6 registers every feature flag', () => {
  it('names every key in DEFAULTS', () => {
    expect(Object.keys(DEFAULTS).filter(k => !new RegExp('`' + k + '`').test(doc))).toEqual([]);
  });

  it('never names a flag key that no longer exists', () => {
    const keys = new Set(Object.keys(DEFAULTS));
    // The flag table's second column is the key; the default may be emphasised —
    // `**off**` marks the one off-by-default key.
    const claimed = [...doc.matchAll(/^\| \d+ \| `(\w+)` \| \*{0,2}(?:on|off)\*{0,2} \|/gm)].map(m => m[1]);
    expect(claimed.filter(k => !keys.has(k))).toEqual([]);
    expect(claimed.length).toBe(keys.size);
  });
});
