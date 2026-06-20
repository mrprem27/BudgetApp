import { evaluateAfford } from '../lib/afford';

describe('evaluateAfford', () => {
  it('is comfortable when plenty remains above the 20% buffer', () => {
    const r = evaluateAfford(1000, 10000, 0); // ₹10 cash, ₹1 purchase
    expect(r.verdict).toBe('comfortable');
    expect(r.freeToSpend).toBe(10000);
    expect(r.remaining).toBe(9000);
  });

  it('subtracts upcoming bills before deciding', () => {
    const r = evaluateAfford(3000, 10000, 6000); // ₹6 of bills committed
    expect(r.freeToSpend).toBe(4000);
    expect(r.remaining).toBe(1000);
    expect(r.verdict).toBe('tight'); // 1000 < 20% buffer (2000)
  });

  it('says no when the purchase exceeds free-to-spend', () => {
    const r = evaluateAfford(5000, 10000, 6000);
    expect(r.verdict).toBe('no');
    expect(r.remaining).toBe(-1000);
  });

  it('ignores negative bills', () => {
    expect(evaluateAfford(1000, 5000, -100).freeToSpend).toBe(5000);
  });
});
