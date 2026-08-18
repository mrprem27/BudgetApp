import {
  getPendingSettlement, setPendingSettlement, shouldAskAboutSettlement,
  PENDING_PAYMENT_MIN_AWAY_MS, PENDING_PAYMENT_TTL_MS,
  type PendingSettlement,
} from '../lib/pendingSettlement';

/**
 * The settle-up half of the "did that payment go through?" flow.
 *
 * Money moves off the back of this record, so the tests care about two things the
 * expense path can afford to be looser about: a malformed record must read as *no*
 * record rather than as a settlement with a missing end, and the stored plan must
 * survive the round trip byte-for-byte, because it is deliberately not recomputed
 * at confirm time.
 */

const NOW = 1_700_000_000_000;

const plan = (over: Partial<PendingSettlement> = {}): PendingSettlement => ({
  plans: [{ groupId: 'g1', from: 'me', to: 'aarav', amount: 50000 }],
  amountPaise: 50000,
  payeeName: 'Aarav',
  category: 'Repayment',
  date: NOW,
  startedAt: NOW,
  ...over,
});

describe('pendingSettlement round trip', () => {
  beforeEach(async () => { await setPendingSettlement(null); });

  it('stores and returns a settlement', async () => {
    await setPendingSettlement(plan());
    expect(await getPendingSettlement()).toEqual(plan());
  });

  it('returns the plan exactly as stored — it is never recomputed', async () => {
    const multi = plan({
      plans: [
        { groupId: 'g1', from: 'me', to: 'aarav', amount: 30000 },
        { groupId: 'g2', from: 'me', to: 'aarav', amount: 20000 },
      ],
    });
    await setPendingSettlement(multi);
    const back = await getPendingSettlement();
    // Balances can move while the user is in their UPI app; re-planning on return
    // could settle a different group than the prompt named.
    expect(back?.plans).toEqual(multi.plans);
  });

  it('clears', async () => {
    await setPendingSettlement(plan());
    await setPendingSettlement(null);
    expect(await getPendingSettlement()).toBeNull();
  });

  it('reads nothing when there is nothing', async () => {
    expect(await getPendingSettlement()).toBeNull();
  });
});

describe('a malformed record is no record', () => {
  beforeEach(async () => { await setPendingSettlement(null); });

  const rejected: Array<[string, Partial<PendingSettlement>]> = [
    ['no plans', { plans: [] }],
    ['zero total', { amountPaise: 0 }],
    ['negative total', { amountPaise: -1 }],
  ];

  it.each(rejected)('rejects: %s', async (_label, over) => {
    await setPendingSettlement(plan(over));
    expect(await getPendingSettlement()).toBeNull();
  });

  const badPlans: Array<[string, unknown]> = [
    ['a plan missing its payer', { groupId: 'g1', to: 'aarav', amount: 50000 }],
    ['a plan missing its payee', { groupId: 'g1', from: 'me', amount: 50000 }],
    ['a plan missing its group', { from: 'me', to: 'aarav', amount: 50000 }],
    ['a plan with a zero amount', { groupId: 'g1', from: 'me', to: 'aarav', amount: 0 }],
  ];

  it.each(badPlans)('rejects %s rather than settling half of it', async (_label, bad) => {
    await setPendingSettlement(plan({ plans: [bad as PendingSettlement['plans'][0]] }));
    expect(await getPendingSettlement()).toBeNull();
  });
});

describe('shouldAskAboutSettlement', () => {
  it('does not ask about a bounce-straight-back', () => {
    // The UPI app barely had time to open; asking would train people to dismiss.
    const s = plan({ startedAt: NOW });
    expect(shouldAskAboutSettlement(s, NOW + PENDING_PAYMENT_MIN_AWAY_MS - 1)).toBe(false);
  });

  it('asks once enough time has passed', () => {
    const s = plan({ startedAt: NOW });
    expect(shouldAskAboutSettlement(s, NOW + PENDING_PAYMENT_MIN_AWAY_MS)).toBe(true);
    expect(shouldAskAboutSettlement(s, NOW + 60_000)).toBe(true);
  });

  it('goes quiet after the TTL rather than asking about yesterday', () => {
    const s = plan({ startedAt: NOW });
    expect(shouldAskAboutSettlement(s, NOW + PENDING_PAYMENT_TTL_MS)).toBe(true);
    expect(shouldAskAboutSettlement(s, NOW + PENDING_PAYMENT_TTL_MS + 1)).toBe(false);
  });
});
