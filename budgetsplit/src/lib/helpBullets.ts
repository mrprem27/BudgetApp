/**
 * A Help paragraph as one short bullet per sentence.
 *
 * Help copy is written as prose, and a wall of it is hard to scan on a phone. A sentence is
 * already one thought, so it becomes one bullet — no rewrite of the copy, and new entries get
 * the same treatment for free. A single sentence stays a single line (`length === 1`), and the
 * caller renders that as plain text rather than a lone bullet.
 *
 * A full stop only ends a sentence when a capital, quote, bracket or ₹ follows, so
 * "e.g. Salary", "tax/tip." and "₹4.50" stay whole.
 */
const ABBREVIATIONS = /\b(e\.g|i\.e|vs|etc|approx|incl|Rs)\./gi;
const HOLD = '\u0000';

export function helpBullets(body: string): string[] {
  const held = body.replace(ABBREVIATIONS, m => m.split('.').join(HOLD));
  return held
    .replace(/([.!?])\s+(?=[A-Z“"‘(₹])/g, '$1\n')
    .split('\n')
    .map(s => s.split(HOLD).join('.').trim())
    .filter(Boolean);
}
