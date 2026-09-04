import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  PAY_METHOD, PAY_METHOD_CHOOSABLE, PAY_METHOD_LABEL, PAY_METHOD_ICON,
  INCOME_LANDING, PayMethod, assetOf,
} from '../constants/enums';

/**
 * Two lists, and the difference between them is the point.
 *
 * `PAY_METHOD` is what a row may STORE. `PAY_METHOD_CHOOSABLE` is what a person
 * may PICK. Collapsing those into one list is what put `Autopay` in front of the
 * user (`OV-28`) — a value that is not a payment method at all: it carries the
 * `repeat` glyph, folds to `bank` in every money calculation, and means what the
 * recurring control's `auto` mode already means, two rows away on the same screen.
 */
describe('what may be stored vs what may be picked', () => {
  it('offers everything except Autopay', () => {
    expect(PAY_METHOD_CHOOSABLE).not.toContain(PayMethod.Autopay);
    expect([...PAY_METHOD_CHOOSABLE].sort())
      .toEqual([...PAY_METHOD].filter(m => m !== PayMethod.Autopay).sort());
  });

  it('keeps Autopay storable, because an import genuinely produces it', () => {
    // A mandate debit arrives labelled "autopay" and `payMethodDetect` matches it.
    // There is no rule on this device to carry `recurMode`, so the value is the
    // honest record of what the statement said. Detected, never picked.
    expect(PAY_METHOD).toContain(PayMethod.Autopay);
    expect(PAY_METHOD_LABEL[PayMethod.Autopay]).toBeTruthy();
    expect(PAY_METHOD_ICON[PayMethod.Autopay]).toBeTruthy();
    // And nothing about the money math moves: it still draws from bank.
    expect(assetOf(PayMethod.Autopay)).toBe('bank');
  });

  it('keeps Other, because "I do not know" is a real answer', () => {
    // Hiding a legitimate option pushes people onto a wrong one.
    expect(PAY_METHOD_CHOOSABLE).toContain(PayMethod.Other);
  });

  it('never offers a landing option that cannot receive money', () => {
    // Income arrives INTO somewhere. It never arrives "by card" or "by autopay".
    for (const m of INCOME_LANDING) expect(PAY_METHOD_CHOOSABLE).toContain(m);
    expect(INCOME_LANDING).not.toContain(PayMethod.Card);
    expect(INCOME_LANDING).not.toContain(PayMethod.Autopay);
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
      if (!/PAY_METHOD(_CHOOSABLE)?\s*\.\s*map\(|PAY_CHOICES\s*\.\s*map\(/.test(src)) continue;
      if (!ALLOWED[label(file)]) offenders.push(label(file));
    }
    expect(offenders).toEqual([]);
  });
});
