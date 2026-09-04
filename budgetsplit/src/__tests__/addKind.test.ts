import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { AddKind, ADD_KIND, ADD_KIND_LABEL, SETTLEMENT_ADD_KINDS } from '../constants/enums';
import { kindAccent, kindGradient, kindAmountColor } from '../lib/kindTheme';
import { detectVoiceKind } from '../lib/voiceParse';

/**
 * Adding a fourth `AddKind` took eight files, and only **two** of them failed the
 * build when it landed.
 *
 * The two that did were `Record<AddKind, …>` maps, which is the pattern that works:
 * TypeScript refuses an incomplete record, so the compiler names the file. The six
 * that did not were `switch` statements with a `default:`, a chain of `===` with a
 * fallback, and `kind !== 'transfer'` gates whose meaning silently changed from
 * "expense or income" to "expense, income or invest".
 *
 * The worst of them was a deep link: `?kind=invest` fell through a `===` chain to
 * Expense and opened the wrong form with no error anywhere. That is the class this
 * guards — not "is Invest wired up", but **"can the next kind be half-added"**.
 */

describe('every kind is reachable and complete', () => {
  it('labels every member, in a render order that holds all of them', () => {
    for (const k of Object.values(AddKind)) {
      expect(ADD_KIND_LABEL[k]).toBeTruthy();
      expect(ADD_KIND).toContain(k);
    }
    // The switcher's order is a different list from the enum's members, and the
    // two drifting apart would hide a pill rather than fail anything.
    expect([...ADD_KIND].sort()).toEqual(Object.values(AddKind).sort());
  });

  it('gives every kind its own theme, with no silent default', () => {
    // `kindAccent` and friends `switch` with a `default:`, so a new kind compiles
    // and renders as an expense. Assert each answer is deliberate instead.
    for (const k of Object.values(AddKind)) {
      expect(typeof kindAccent(k)).toBe('string');
      expect(kindGradient(k)).toHaveLength(2);
      expect(typeof kindAmountColor(k)).toBe('string');
    }
    // Transfer and Invest are the same movement, so they share a colour — the one
    // place a shared answer is intended rather than a fallthrough.
    expect(kindAccent(AddKind.Invest)).toBe(kindAccent(AddKind.Transfer));
    // …and neither is the expense colour, which is what a missed case would give.
    expect(kindAccent(AddKind.Invest)).not.toBe(kindAccent(AddKind.Expense));
  });

  it('says which kinds are settlements, rather than naming one', () => {
    expect(SETTLEMENT_ADD_KINDS).toContain(AddKind.Transfer);
    expect(SETTLEMENT_ADD_KINDS).toContain(AddKind.Invest);
    expect(SETTLEMENT_ADD_KINDS).not.toContain(AddKind.Expense);
    expect(SETTLEMENT_ADD_KINDS).not.toContain(AddKind.Income);
  });
});

/**
 * A dictated phrase reaches every kind, because there is **one** Siri command and
 * detection routes it — not one shortcut per kind. A kind detection cannot produce
 * is a kind voice cannot reach.
 */
describe('voice detection reaches every kind', () => {
  const PHRASES: Record<AddKind, string> = {
    [AddKind.Expense]: 'four fifty groceries',
    [AddKind.Income]: 'fifty thousand salary',
    [AddKind.Transfer]: 'paid Riya five hundred',
    [AddKind.Invest]: 'ten thousand into my sip',
  };

  it('produces each one from a plausible phrase', () => {
    const people = [{ id: 'r', name: 'Riya' }];
    for (const [kind, phrase] of Object.entries(PHRASES)) {
      expect(detectVoiceKind(phrase, { people })).toBe(kind);
    }
  });

  it('orders its hints so the ambiguous cases land right', () => {
    const people = [{ id: 'r', name: 'Riya' }];
    // Money arriving FROM a holding is income, though the words are investment words.
    expect(detectVoiceKind('twelve hundred dividend')).toBe('income');
    expect(detectVoiceKind('five thousand interest credited')).toBe('income');
    // A named person and a settle verb beat an investment word.
    expect(detectVoiceKind('paid Riya for the gold', { people })).toBe('transfer');
    // With nobody named, the same words are a purchase of the holding.
    expect(detectVoiceKind('twenty thousand gold')).toBe('invest');
  });
});

/**
 * The gates that changed meaning. `kind !== 'transfer'` used to mean "expense or
 * income"; the moment Invest existed it also meant "or invest", and every one of
 * them had to be re-read by hand. A negation against a single member is the shape
 * that does that, so the Add screen should not grow new ones.
 */
describe('the Add screen does not gate on a single kind by negation', () => {
  const ROOT = join(__dirname, '..', '..');

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) out.push(...walk(full));
      else if (full.endsWith('.tsx') || full.endsWith('.ts')) out.push(full);
    }
    return out;
  }

  const FILES = [
    join(ROOT, 'app', 'add', 'quick.tsx'),
    ...walk(join(ROOT, 'src', 'components', 'finance', 'add')),
  ];

  it('finds the source to scan', () => {
    expect(FILES.length).toBeGreaterThan(5);
  });

  it("has no `kind !== '<one kind>'` left", () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      const src = readFileSync(f, 'utf8');
      // Both the raw string and the enum form.
      for (const m of src.matchAll(/\bkind\s*!==\s*(?:'(\w+)'|AddKind\.(\w+))/g)) {
        offenders.push(`${f.split('/').slice(-2).join('/')} — kind !== ${m[1] ?? m[2]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
