import AsyncStorage from '@react-native-async-storage/async-storage';
import { finalizeOnboarding } from '../lib/onboarding';
import { settings } from '../lib/settings';

const store = AsyncStorage as unknown as { __reset: () => void };
beforeEach(() => store.__reset());

/**
 * Onboarding arms the Scan & Pay coach mark, and nothing else does.
 *
 * The alternative — showing it whenever a "seen" flag is absent — put the bubble on
 * Home for every *existing* user, where it would sit until they happened to
 * long-press a gesture they may already have been using. That is what this asserts
 * against.
 *
 * `finalizeOnboarding` needs a real database for the rest of its work and doesn't get
 * one here; the flag is written before any DB call and in its own try, so the later
 * failure is expected and irrelevant to what's under test.
 */
const data = {
  intent: 'both' as const,
  name: 'Asha', incomeNum: 0, payday: 1, budgetNum: 0,
  people: [], addFirst: false,
  money: { openingCash: 0, investments: 0, creditLimit: 0, creditUsed: 0 },
};

describe('the coach mark is onboarding-only', () => {
  it('is not armed before onboarding runs', async () => {
    await expect(settings.scanPayHintPending()).resolves.toBe(false);
  });

  it('is armed by finishing onboarding', async () => {
    await finalizeOnboarding({} as never, data);
    await expect(settings.scanPayHintPending()).resolves.toBe(true);
  });

  it('is still armed even though the rest of onboarding failed without a database', async () => {
    // Its own try block: a persona or DB write failing has nothing to do with
    // whether a new user should be shown the hint.
    await expect(finalizeOnboarding({} as never, data)).resolves.toBe(false);
    await expect(settings.scanPayHintPending()).resolves.toBe(true);
  });
});
