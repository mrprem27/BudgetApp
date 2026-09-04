import { settlementView, isInvestment, type SettlementRow } from '../lib/settlementView';
import { investedOf } from '../lib/splitMath';
import { PayMethod } from '../constants/enums';
import { colors } from '../theme';

/**
 * `kind = 'settlement'` means four different things (`OV-02`), and six places were
 * each deciding which — producing four different words for the same event:
 * "Transfers", "Settlement", "Settlements", "settled".
 *
 * The Invest pill made it unignorable. It shipped an entry surface for a movement
 * with no exit surface: `asset_id` reached every ledger and no display file read it,
 * so a SIP rendered as a coral −₹10,000 (identical to spending it) and selling gold
 * rendered as green income — which `AGENTS.md` §12 forbids in as many words.
 */

const ME = 'me';
const row = (over: Partial<SettlementRow> = {}): SettlementRow => ({
  asset_id: null,
  pay_method: null,
  payments: [{ personId: ME, amount: 1000000 }],
  shares: [],
  ...over,
});

/** Money INTO an asset: payments-only, `asset_id` set. */
const invest = row({ asset_id: 'gold' });
/** Money OUT of an asset: shares-only, same `asset_id`. */
const redeem = row({ asset_id: 'gold', payments: [], shares: [{ personId: ME, amount: 1000000 }] });
const cardBill = row({ pay_method: PayMethod.Card });
const p2p = row({ shares: [{ personId: 'aarav', amount: 1000000 }] });

describe('the four things a settlement can be', () => {
  it('tells them apart', () => {
    expect(settlementView(invest).kind).toBe('invest');
    expect(settlementView(redeem).kind).toBe('redeem');
    expect(settlementView(cardBill).kind).toBe('card');
    expect(settlementView(p2p).kind).toBe('transfer');
  });

  it('gives each its own word', () => {
    const labels = [invest, redeem, cardBill, p2p].map(r => settlementView(r).label);
    expect(new Set(labels).size).toBe(4);
  });

  it('uses asset_id, not the category, to spot an asset movement', () => {
    // `INVESTMENT_CATEGORY` is written by BOTH directions, so the category cannot
    // tell buying from selling — and a card repayment carries no asset at all.
    expect(settlementView(row({ asset_id: 'x' })).kind).toBe('invest');
    expect(settlementView(row({ asset_id: null })).kind).toBe('transfer');
  });

  it('names the asset when the caller resolved it', () => {
    expect(settlementView(invest, 'Gold').destination).toBe('Gold');
    // Unresolved is null, not the word "undefined" leaking into a label.
    expect(settlementView(invest).destination).toBeNull();
    // A person-to-person transfer has no destination asset to name.
    expect(settlementView(p2p, 'Gold').destination).toBeNull();
  });
});

/**
 * The sign, decided once. Every surface rendering an amount was inferring it, and
 * the redemption case was inferred wrong in at least two of them.
 */
describe('direction', () => {
  it('reads an asset movement from which side carries rows', () => {
    expect(settlementView(invest).outbound).toBe(true);
    expect(settlementView(redeem).outbound).toBe(false);
  });

  it('does not let a redemption read as income', () => {
    // §12: "still NOT income — you already owned that money, it only changed
    // shape." It came back to me, so `outbound` is false; but the tint stays the
    // settlement colour, never `colors.income`.
    const v = settlementView(redeem);
    expect(v.outbound).toBe(false);
    expect(v.tint).toBe(colors.settle);
    expect(v.tint).not.toBe(colors.income);
  });

  it('keeps every settlement in the settlement colour', () => {
    for (const r of [invest, redeem, cardBill, p2p]) {
      expect(settlementView(r).tint).toBe(colors.settle);
      // …and never the expense colour, which is what a coral minus sign gave a SIP.
      expect(settlementView(r).tint).not.toBe(colors.expense);
    }
  });
});

describe('isInvestment', () => {
  it('is true only for money going into an asset', () => {
    expect(isInvestment(invest)).toBe(true);
    expect(isInvestment(redeem)).toBe(false);
    expect(isInvestment(cardBill)).toBe(false);
    expect(isInvestment(p2p)).toBe(false);
  });
});

/**
 * The figure behind "plus ₹10,000 invested this month". Three things must not
 * count, and each would be a silently wrong number rather than a crash.
 */
describe('investedOf', () => {
  const withKind = (r: SettlementRow, kind = 'settlement') => ({ ...r, kind });

  it('counts money into an asset', () => {
    expect(investedOf(withKind(invest))).toBe(1000000);
  });

  it('does not count a redemption — selling gold is not investing', () => {
    expect(investedOf(withKind(redeem))).toBe(0);
  });

  it('does not count a card repayment', () => {
    expect(investedOf(withKind(cardBill))).toBe(0);
  });

  it('does not count a person-to-person transfer', () => {
    expect(investedOf(withKind(p2p))).toBe(0);
  });

  it('does not count an expense or income, whatever they carry', () => {
    expect(investedOf(withKind(invest, 'expense'))).toBe(0);
    expect(investedOf(withKind(invest, 'income'))).toBe(0);
  });

  it('sums a multi-payment row rather than reading the first', () => {
    const multi = withKind(row({
      asset_id: 'gold',
      payments: [{ personId: ME, amount: 600000 }, { personId: ME, amount: 400000 }],
    }));
    expect(investedOf(multi)).toBe(1000000);
  });
});
