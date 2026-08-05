import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  setPendingPayment, getPendingPayment, shouldAskAbout,
  PENDING_PAYMENT_TTL_MS, PENDING_PAYMENT_MIN_AWAY_MS,
} from '../lib/pendingPayment';

const store = AsyncStorage as unknown as { __reset: () => void };
beforeEach(() => store.__reset());

const payment = (over = {}) => ({
  vpa: 'chaistop@okhdfcbank', name: 'Chai Stop', amountPaise: 4500, startedAt: 1_000_000, ...over,
});

describe('pending payment survives the app switch', () => {
  it('round-trips everything the return prompt needs', async () => {
    await setPendingPayment(payment());
    await expect(getPendingPayment()).resolves.toEqual(payment());
  });

  it('is absent before anything is handed off', async () => {
    await expect(getPendingPayment()).resolves.toBeNull();
  });

  it('clears on null', async () => {
    await setPendingPayment(payment());
    await setPendingPayment(null);
    await expect(getPendingPayment()).resolves.toBeNull();
  });

  it('treats a corrupt record as no record', async () => {
    await AsyncStorage.setItem('pending_upi_payment_v1', '{not json');
    await expect(getPendingPayment()).resolves.toBeNull();
  });

  it('rejects a record missing what it needs, rather than filing a broken row', async () => {
    for (const bad of [{ vpa: '', amountPaise: 100 }, { vpa: 'a@b' }, { vpa: 'a@b', amountPaise: 0 }, { vpa: 'a@b', amountPaise: -5 }]) {
      await AsyncStorage.setItem('pending_upi_payment_v1', JSON.stringify({ ...bad, startedAt: 1 }));
      await expect(getPendingPayment()).resolves.toBeNull();
    }
  });
});

describe('shouldAskAbout — when it is fair to ask', () => {
  const p = payment();

  it('asks after a plausible trip to the UPI app', () => {
    expect(shouldAskAbout(p, p.startedAt + 30_000)).toBe(true);
  });

  it('stays quiet on an instant bounce-back — they cannot have paid', () => {
    // Asking here would train people to dismiss the prompt.
    expect(shouldAskAbout(p, p.startedAt + 1000)).toBe(false);
    expect(shouldAskAbout(p, p.startedAt + PENDING_PAYMENT_MIN_AWAY_MS - 1)).toBe(false);
  });

  it('gives up on a stale hand-off rather than asking about yesterday', () => {
    // A wrongly-confirmed expense is worse than a missed one: it can still be added
    // by hand, but a phantom row silently corrupts the month.
    expect(shouldAskAbout(p, p.startedAt + PENDING_PAYMENT_TTL_MS + 1)).toBe(false);
  });

  it('includes both boundaries exactly', () => {
    expect(shouldAskAbout(p, p.startedAt + PENDING_PAYMENT_MIN_AWAY_MS)).toBe(true);
    expect(shouldAskAbout(p, p.startedAt + PENDING_PAYMENT_TTL_MS)).toBe(true);
  });

  it('ignores a clock that went backwards', () => {
    expect(shouldAskAbout(p, p.startedAt - 60_000)).toBe(false);
  });
});
