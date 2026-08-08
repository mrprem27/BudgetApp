import { applyStep, stepIsUsable, divisionRemainder, operandKind } from '../lib/amountCalc';

const R = (rupees: number) => rupees * 100; // rupees → paise

describe('operandKind', () => {
  it('treats + and - as money, × and ÷ as plain factors', () => {
    // "÷ 3" must mean "split three ways", not "divide by three rupees".
    expect(operandKind('+')).toBe('money');
    expect(operandKind('-')).toBe('money');
    expect(operandKind('*')).toBe('factor');
    expect(operandKind('/')).toBe('factor');
  });
});

describe('applyStep — addition and subtraction take amounts', () => {
  it('adds rupees exactly', () => {
    expect(applyStep(R(100), '+', '50')).toBe(R(150));
  });

  it('handles paise in the operand without floating drift', () => {
    expect(applyStep(R(100), '+', '0.01')).toBe(R(100) + 1);
    expect(applyStep(0, '+', '19.99')).toBe(1999);
  });

  it('subtracts, clamping at zero rather than going negative', () => {
    expect(applyStep(R(100), '-', '30')).toBe(R(70));
    // A negative transaction amount has no meaning on this screen.
    expect(applyStep(R(20), '-', '50')).toBe(0);
  });

  it('ignores an empty or junk operand instead of zeroing the total', () => {
    expect(applyStep(R(100), '+', '')).toBe(R(100));
    expect(applyStep(R(100), '+', 'abc')).toBe(R(100));
    expect(applyStep(R(100), '-', '')).toBe(R(100));
  });
});

describe('applyStep — division rounds once, explicitly', () => {
  it('divides evenly when it can (the plan\'s example)', () => {
    // ₹1200 / 3 = ₹400.00 exactly, no drifting fraction.
    expect(applyStep(R(1200), '/', '3')).toBe(R(400));
    expect(Number.isInteger(applyStep(R(1200), '/', '3'))).toBe(true);
  });

  it('rounds to whole paise when it cannot', () => {
    // ₹100 / 3 = 3333.33 paise → 3333 paise (₹33.33).
    expect(applyStep(R(100), '/', '3')).toBe(3333);
  });

  it('always returns an integer number of paise for any divisor', () => {
    for (const d of [3, 6, 7, 9, 11, 13, 1.5, 2.25]) {
      const out = applyStep(R(100), '/', String(d));
      expect(Number.isInteger(out)).toBe(true);
    }
  });

  it('refuses divide-by-zero rather than producing Infinity', () => {
    expect(applyStep(R(100), '/', '0')).toBe(R(100));
    expect(applyStep(R(100), '/', '0.0')).toBe(R(100));
  });

  it('refuses a negative divisor', () => {
    expect(applyStep(R(100), '/', '-2')).toBe(R(100));
  });
});

describe('applyStep — multiplication', () => {
  it('applies a tax multiplier exactly where it can', () => {
    // ₹480 × 1.18 = ₹566.40
    expect(applyStep(R(480), '*', '1.18')).toBe(56640);
  });

  it('rounds a fractional result rather than storing a fraction', () => {
    // 250 × 1.5 = 375 exactly in binary floating point, so this is unambiguous.
    expect(applyStep(250, '*', '1.5')).toBe(375);
    // 333 × 1.5 = 499.5 → rounds up.
    expect(applyStep(333, '*', '1.5')).toBe(500);
  });

  it('lands on an integer even where the float itself is not what decimal suggests', () => {
    // `100 * 1.005` is 100.49999999999999 in IEEE 754, not 100.5 — so this rounds DOWN.
    // That is the correct behaviour, not a bug: the guarantee this module makes is that
    // money never becomes a fraction, not that decimal arithmetic is exact (it can't be
    // with a float multiplier). Asserting 101 here would be asserting idealised maths.
    const out = applyStep(100, '*', '1.005');
    expect(Number.isInteger(out)).toBe(true);
    expect(out).toBe(100);
  });

  it('multiplying by zero is allowed — it is a deliberate clear', () => {
    expect(applyStep(R(100), '*', '0')).toBe(0);
  });

  it('refuses a negative multiplier', () => {
    expect(applyStep(R(100), '*', '-1')).toBe(R(100));
  });
});

describe('stepIsUsable', () => {
  it('is false when the step would change nothing, so = can be disabled', () => {
    expect(stepIsUsable(R(100), '+', '')).toBe(false);
    expect(stepIsUsable(R(100), '/', '0')).toBe(false);
    expect(stepIsUsable(R(100), '/', '1')).toBe(false); // divide by one is a no-op
  });

  it('is true for a real step', () => {
    expect(stepIsUsable(R(100), '+', '50')).toBe(true);
    expect(stepIsUsable(R(100), '/', '3')).toBe(true);
  });
});

describe('divisionRemainder — warn when a split will not sum back', () => {
  it('is zero for an even split', () => {
    expect(divisionRemainder(R(1200), '3')).toBe(0);
  });

  it('is non-zero when the split leaves paise behind', () => {
    // 10000 paise / 3 → 3333 each, 1 paisa unaccounted for.
    expect(divisionRemainder(R(100), '3')).toBe(1);
  });

  it('is zero for non-integer or invalid divisors — "remainder" is meaningless there', () => {
    expect(divisionRemainder(R(100), '1.5')).toBe(0);
    expect(divisionRemainder(R(100), '0')).toBe(0);
    expect(divisionRemainder(R(100), 'x')).toBe(0);
  });
});

describe('chained steps keep money integral throughout', () => {
  it('bill + tip, split three ways', () => {
    let acc = R(1200);
    acc = applyStep(acc, '+', '150');   // ₹1,350 with tip
    acc = applyStep(acc, '/', '3');     // ₹450 each
    expect(acc).toBe(R(450));
    expect(Number.isInteger(acc)).toBe(true);
  });

  it('never leaves a fractional paisa across a long chain', () => {
    let acc = R(777);
    for (const [op, operand] of [['*', '1.18'], ['/', '7'], ['+', '3.33'], ['/', '3']] as const) {
      acc = applyStep(acc, op, operand);
      expect(Number.isInteger(acc)).toBe(true);
      expect(acc).toBeGreaterThanOrEqual(0);
    }
  });
});
