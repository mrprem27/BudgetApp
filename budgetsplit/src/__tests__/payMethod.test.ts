import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  PAY_METHOD, PAY_METHOD_LABEL, INCOME_LANDING, PayMethod, assetOf, payFromOf, isCardRepayment, asPayMethod,
} from '../constants/enums';

/**
 * One field: where the money came from (`U-49`). How it moved — UPI, a debit card, net banking,
 * an autopay mandate — is not stored; every one of those is the bank, and UPI on a credit card is
 * the card. U-48 kept How and From as two fields; this is the guard that the second one stays gone.
 */
describe('From is the only pay field', () => {
  it('offers exactly the sources, and nothing that is a way of paying', () => {
    expect([...PAY_METHOD]).toEqual([PayMethod.Bank, PayMethod.Card, PayMethod.Cash, PayMethod.Wallet, PayMethod.Other]);
    expect(PAY_METHOD).not.toContain('upi');
    expect(PAY_METHOD).not.toContain('autopay');
    expect(PAY_METHOD_LABEL[PayMethod.Card]).toBe('Credit card');
  });

  it('keeps Other, because "I do not know" is a real answer', () => {
    // Hiding a legitimate option pushes people onto a wrong one.
    expect(PAY_METHOD).toContain(PayMethod.Other);
  });

  it('never offers a landing option that cannot receive money', () => {
    // Income arrives INTO somewhere — never onto a credit card.
    for (const m of INCOME_LANDING) expect(PAY_METHOD).toContain(m);
    expect(INCOME_LANDING).not.toContain(PayMethod.Card);
    expect(INCOME_LANDING).not.toContain(PayMethod.Other);
  });

  it('reads a saved default from before U-49 as Bank', () => {
    expect(asPayMethod('upi')).toBe(PayMethod.Bank);
    expect(asPayMethod('autopay')).toBe(PayMethod.Bank);
    expect(asPayMethod('wallet')).toBe(PayMethod.Wallet);
  });

  it('draws each From on its own place, a card bill on the bank it was paid from', () => {
    expect(assetOf(PayMethod.Bank)).toBe('bank');
    expect(assetOf(PayMethod.Card)).toBe('credit');
    expect(assetOf(PayMethod.Other)).toBeNull();
    expect(payFromOf({ kind: 'expense', pay_method: 'card' })).toBe('credit');
    expect(payFromOf({ pay_method: 'bank' })).toBe('bank');
    // A transfer to a friend paid by card is card spending, not a card bill (`DQ-109`).
    expect(payFromOf({ pay_method: 'card' })).toBe('credit');
    expect(isCardRepayment({ kind: 'settlement', to_account_id: 'default:card' })).toBe(true);
    expect(isCardRepayment({ kind: 'settlement' })).toBe(false);
    expect(payFromOf({ kind: 'expense', pay_method: null })).toBeNull();
  });
});

/**
 * There was a second picker for months.
 *
 * `PayMethodSelector` scrolled tiles sideways while onboarding's pay step
 * hand-rolled the same choice as a vertical list — one enum, one question, two
 * designs, and the horizontal one hid its own options off the right edge. This is
 * the guard that stops a third appearing, on the same principle as
 * `emptyState.test.ts` and `trustCopy.test.ts`: the collapse is worth less than
 * the mechanism that keeps it collapsed.
 */
describe('the pay-method picker is built once', () => {
  const ROOT = join(__dirname, '..', '..');
  const ROOTS = [join(ROOT, 'app'), join(ROOT, 'src', 'components')];

  /** Allowed to iterate the methods, with the reason it is not a second picker. */
  const ALLOWED: Record<string, string> = {
    'finance/PayMethodSelector.tsx': 'is the picker',
  };

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) out.push(...walk(full));
      else if (full.endsWith('.tsx')) out.push(full);
    }
    return out;
  }
  const label = (f: string) => f.split('/').slice(-2).join('/');

  it('finds the source to scan', () => {
    expect(ROOTS.flatMap(walk).length).toBeGreaterThan(50);
  });

  it('has no screen mapping over the methods to build its own list', () => {
    const offenders: string[] = [];
    for (const file of ROOTS.flatMap(walk)) {
      const src = readFileSync(file, 'utf8');
      // `.map(` over either list is how both hand-rolls were written.
      if (!/PAY_METHOD\s*\.\s*map\(|PAY_CHOICES\s*\.\s*map\(/.test(src)) continue;
      if (!ALLOWED[label(file)]) offenders.push(label(file));
    }
    expect(offenders).toEqual([]);
  });
});
