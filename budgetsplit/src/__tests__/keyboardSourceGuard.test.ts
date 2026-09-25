import fs from 'fs';
import path from 'path';

/**
 * Keyboard handling is one decision, made once (AGENTS.md §6b, 2026-09-25).
 *
 * Before this, every form picked its own container and the three picks
 * disagreed: a whole-screen `KeyboardAvoidingView` (the footer rose, a lower
 * field was never scrolled into view), a `KeyboardAwareScrollView` with the
 * footer outside it (fields scrolled, the footer hid behind the keys), or
 * nothing at all. Two primitives now own it:
 *
 *   - `ui/KeyboardForm` — a full screen: the focused field scrolls into view
 *     above the keyboard, content never re-flows, and the
 *     footer stays put under the keyboard unless the screen is a real form;
 *   - `ui/DraggableSheet` — every sheet: it lifts above the keyboard and scrolls
 *     the focused field into its own visible area.
 *
 * This guard is what makes the next sync form (sign-in, conflicts, invites…)
 * inherit that rather than re-deciding it.
 */

const ROOT = path.join(__dirname, '..', '..');
const DIRS = [path.join(ROOT, 'app'), path.join(ROOT, 'src', 'components')];
const rel = (f: string) => path.relative(ROOT, f);

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [];
  });
}
const FILES = DIRS.flatMap(walk);
const src = new Map(FILES.map(f => [f, fs.readFileSync(f, 'utf8')]));
/** Code only: comments mention these APIs to explain why they are gone. */
const code = (f: string) => src.get(f)!.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/\{\s*\}/g, '{}');

const KEYBOARD_FORM = path.join(ROOT, 'src', 'components', 'ui', 'KeyboardForm.tsx');
const SHEET = path.join(ROOT, 'src', 'components', 'ui', 'DraggableSheet.tsx');

it('scans the app', () => {
  expect(FILES.length).toBeGreaterThan(150);
  expect(src.get(KEYBOARD_FORM)).toBeDefined();
});

describe('only the two primitives touch the keyboard library', () => {
  const owners: Array<[RegExp, string[]]> = [
    [/\bKeyboardAvoidingView\b/, [SHEET]],
    [/\b(KeyboardAwareScrollView|KeyboardStickyView)\b(?!Ref)/, [KEYBOARD_FORM]],
    // Tried and removed 2026-09-25: buggy on device, and the keyboard already
    // has its own return key.
    [/\bKeyboardToolbar\b/, []],
    [/\bautomaticallyAdjustKeyboardInsets\b/, []],
  ];
  it.each(owners.map(([re, allowed]) => [re.source, re, allowed] as const))('%s', (_label, re, allowed) => {
    const offenders = FILES.filter(f => !allowed.includes(f) && re.test(code(f))).map(rel);
    expect(offenders).toEqual([]);
  });
});

/**
 * An input is "contained" once it sits inside a sheet, a `KeyboardForm`, the
 * onboarding scaffold (which is a `KeyboardForm`), or a list whose scroll view is
 * `keyboardAwareScroll`. Everything else it renders is checked transitively: a
 * component that renders an input bears one, and so does anything rendering it.
 */
const CONTAINERS = ['SheetModal', 'KeyboardForm', 'StepScaffold'];

/** Where the JSX element opening at `start` ends: its `/>` (or `>`) outside every `{…}`. */
function elementEnd(s: string, start: number): number {
  let depth = 0;
  for (let i = start + 1; i < s.length; i++) {
    const c = s[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (depth === 0 && s.startsWith('/>', i)) return i + 2;
    else if (depth === 0 && c === '>') {
      const tag = /^<(\w+)/.exec(s.slice(start))![1];
      const close = s.indexOf(`</${tag}>`, i);
      return close < 0 ? i + 1 : close + tag.length + 3;
    }
  }
  return s.length;
}

function uncontained(f: string): string {
  let s = code(f);
  // A list whose scroll view is keyboard-aware contains everything it renders.
  for (let m = /<(SectionList|FlatList)\b/.exec(s); m; m = /<(SectionList|FlatList)\b/.exec(s)) {
    const end = elementEnd(s, m.index);
    const el = s.slice(m.index, end);
    s = s.slice(0, m.index) + (/renderScrollComponent=\{/.test(el) ? '' : el.replace(/^</, '< ')) + s.slice(end);
  }
  for (const tag of CONTAINERS) s = s.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`, 'g'), '');
  return s;
}

function exportedComponents(f: string): string[] {
  return [...code(f).matchAll(/export (?:function|const) ([A-Z]\w*)/g)].map(m => m[1]);
}

function inputBearers(): Set<string> {
  const bearing = new Set<string>();               // component names
  const bearingFiles = new Set<string>();
  const skip = new Set(Object.keys(EXEMPT_COMPONENTS).map(f => path.join(ROOT, f)));
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of FILES) {
      if (bearingFiles.has(f) || skip.has(f)) continue;
      const s = uncontained(f);
      // `[\s/]`, not `\b`: `useRef<TextInput>(null)` is a type, not an element.
      const renders = /<TextInput[\s/]/.test(s) || [...bearing].some(n => new RegExp(`<${n}[\\s/]`).test(s));
      if (!renders) continue;
      bearingFiles.add(f);
      for (const n of exportedComponents(f)) bearing.add(n);
      grew = true;
    }
  }
  return bearingFiles;
}

/**
 * Routes the scan can't prove, each with the reason it is safe. Every entry is a
 * decision, not an omission (the same shape as `syncQueueCoverage`'s EXEMPT).
 */
const EXEMPT: Record<string, string> = {
  'app/search.tsx': 'the search box is pinned at the top of the screen, above the keyboard; the results list below it is keyboardAwareScroll',
};
/** Components the scan can't prove, same rule. */
const EXEMPT_COMPONENTS: Record<string, string> = {
  'src/components/system/Onboarding.tsx': 'the money step builds its MoneyRows in an array above the JSX and renders it inside <StepScaffold> — contained, but out of a source scan\'s sight',
};

describe('every screen that takes typing is keyboard-safe', () => {
  const bearers = inputBearers();

  it('finds the input components it must follow', () => {
    // Canaries: without these the check passes by finding nothing.
    for (const f of ['src/components/ui/Input.tsx', 'src/components/finance/add/AmountField.tsx', 'src/components/finance/GroupForm.tsx']) {
      expect({ f, bears: bearers.has(path.join(ROOT, f)) }).toEqual({ f, bears: true });
    }
  });

  it('no route renders an input outside a KeyboardForm, a sheet or a keyboard-aware list', () => {
    const routes = [...bearers].filter(f => f.startsWith(path.join(ROOT, 'app') + path.sep)).map(rel);
    expect(routes.filter(r => !(r in EXEMPT))).toEqual([]);
  });

  it('keeps no stale exemption', () => {
    const stale = [...Object.keys(EXEMPT), ...Object.keys(EXEMPT_COMPONENTS)].filter(f => !fs.existsSync(path.join(ROOT, f)));
    expect(stale).toEqual([]);
  });

  it('a footer lifts over the keyboard only where a screen opts in, and says why', () => {
    // Default is covered-by-the-keyboard (2026-09-25). Each opt-in is a real
    // multi-field form; adding one means adding it here, on purpose.
    const optIns = FILES.filter(f => /\bfooterAboveKeyboard\b(?!\?)/.test(code(f)) && f !== KEYBOARD_FORM).map(rel);
    expect(optIns).toEqual(['src/components/finance/budget/BudgetEditor.tsx']);
  });

  it('onboarding sits in the upper third, never centred', () => {
    const scaffold = code(path.join(ROOT, 'src', 'components', 'system', 'onboarding', 'StepScaffold.tsx'));
    expect(scaffold).toMatch(/<KeyboardForm[\s\S]*anchor="upper-third"/);
    expect(scaffold).not.toMatch(/justifyContent: 'center'/);
  });
});
