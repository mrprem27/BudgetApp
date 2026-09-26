/**
 * A seeded PRNG (mulberry32) plus a deterministic hash of a `FinanceSnapshot`
 * to seed it from (`SPEC-ENGINE.md` §4 E3, §6 project structure). The whole
 * simulation is a pure function of the ledger: the same snapshot always
 * simulates the same 500 futures, never `Math.random()`.
 */
import type { FinanceSnapshot } from './types';

/** A small, fast, seeded PRNG returning floats in `[0, 1)`. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function rng(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * FNV-1a over the snapshot's JSON form — cheap, and stable across runs (object
 * key order in `FinanceSnapshot` is fixed by `getFinanceSnapshot`, so this is
 * not vulnerable to the usual "JSON.stringify key order" trap).
 */
export function hashSnapshot(snapshot: FinanceSnapshot): number {
  const s = JSON.stringify(snapshot);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
