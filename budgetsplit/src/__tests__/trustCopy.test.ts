import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  trustMeans, reviewMeans, trustInert, trustStateLabel, groupTrustLabel,
  trustConfirmTitle, trustConfirmBody, trustAndApproveLabel, trustAndApproveBody,
} from '../lib/trustCopy';

/**
 * Trust was explained six different ways across six files, and two of them were
 * not merely differently worded but differently TRUE — `usePersonScreen`'s dialog
 * omitted the transfer carve-out, so the same decision read as unconditional on
 * one screen and conditional on another.
 *
 * The rule has two halves and both must always be said together. These tests hold
 * that, and hold that no screen goes back to hand-writing its own version.
 */
describe('what trust means is said once, and said fully', () => {
  it('always names BOTH halves — the rule and the carve-out', () => {
    const s = trustMeans('Aarav');
    expect(s).toMatch(/counts straight away/i);
    // The half that was missing. Money arriving is never bulk-trusted (§13).
    expect(s).toMatch(/confirmed each time/i);
  });

  it('states the mirror for not trusting, including what is already accepted', () => {
    const s = reviewMeans('Aarav');
    expect(s).toMatch(/waits for your approval/i);
    expect(s).toMatch(/already accepted stay accepted/i);
  });

  it('says why the control is inert rather than claiming protection', () => {
    // A person with no account has no write path, so "protected" would be theatre.
    expect(trustInert('Aarav')).toMatch(/no linked account/i);
    expect(trustInert('Aarav')).not.toMatch(/protect/i);
  });

  it('spells out an inherited value instead of pointing at "above"', () => {
    // "Same as above" pointed two blocks and a paragraph away.
    expect(groupTrustLabel(null, 'trusted')).toBe('Counts straight away (from the setting above)');
    expect(groupTrustLabel('review', 'trusted')).toBe(trustStateLabel('review'));
  });
});

/**
 * The two buttons that shared a label and did different things. The approvals one
 * also approves the queue; its label has to admit that.
 */
describe('the approvals button says it approves', () => {
  it('names the count it is about to accept', () => {
    expect(trustAndApproveLabel('Aarav', 3)).toBe('Trust Aarav and approve these 3');
    expect(trustAndApproveLabel('Aarav', 1)).toBe('Trust Aarav and approve this');
  });

  it('falls back to plain trust when there is nothing queued', () => {
    expect(trustAndApproveLabel('Aarav', 0)).toBe('Trust Aarav');
    expect(trustAndApproveBody('Aarav', 0)).not.toMatch(/will be accepted/i);
  });

  it('still carries the transfer carve-out in its body', () => {
    expect(trustAndApproveBody('Aarav', 2)).toMatch(/confirmed each time/i);
    expect(trustAndApproveBody('Aarav', 2)).toMatch(/2 entries waiting here will be accepted/i);
  });

  it('asks the same question as the person screen', () => {
    expect(trustConfirmTitle('Aarav', 'trusted')).toBe('Trust Aarav?');
    expect(trustConfirmBody('Aarav', 'trusted')).toBe(trustMeans('Aarav'));
  });
});

/**
 * The guard that matters: nothing may hand-write these sentences again. Reads the
 * real source, like `screenLoading` and the invariant harnesses.
 */
describe('no screen writes its own version', () => {
  const ROOTS = [join(__dirname, '..', '..', 'app'), join(__dirname, '..', 'components'), join(__dirname, '..', 'hooks')];

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) out.push(...walk(p));
      else if (/\.tsx?$/.test(p) && !p.includes('__tests__')) out.push(p);
    }
    return out;
  }

  /** Phrases that may only ever come from `lib/trustCopy`. */
  const OWNED = [
    /count(s)? straight away/i,
    /waits? for your approval/i,
    /confirmed each time/i,
  ];

  /**
   * Long-form help is allowed its own prose — it is explaining, not instructing,
   * and `trustCopy`'s sentences are written to sit on a control. What it is NOT
   * allowed to do is drop the carve-out, which is exactly how the six phrasings
   * came to disagree about what trust actually does.
   */
  it('keeps the transfer carve-out in the long-form explanation too', () => {
    const help = readFileSync(join(__dirname, '..', '..', 'app', 'help.tsx'), 'utf8');
    const para = /trusted[^']*'/.exec(help.slice(help.indexOf('Nothing lands without your say-so')))?.[0] ?? '';
    expect(para).toMatch(/transfer always waits/i);
  });

  it('has no file re-stating a trust sentence in its own words', () => {
    const offenders: string[] = [];
    for (const file of ROOTS.flatMap(walk)) {
      const src = readFileSync(file, 'utf8');
      // Comments explain the rule all over the codebase and should — only the
      // strings a user reads are owned.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const re of OWNED) {
        if (re.test(code)) offenders.push(`${file.split('/').slice(-2).join('/')}: ${re}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
