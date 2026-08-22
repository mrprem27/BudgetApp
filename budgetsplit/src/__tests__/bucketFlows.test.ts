import { DatabaseSync } from 'node:sqlite';
import { BUCKET_FLOWS_SQL } from '../db/queries/cashQuery';
import { assetOf, PAY_METHOD, PayMethod } from '../constants/enums';

/**
 * The bucket rule exists twice — once as `assetOf` in TypeScript, once inside
 * `BUCKET_FLOWS_SQL` — because `cashQuery.ts` is deliberately import-free so it
 * can be tested against a real SQLite engine.
 *
 * Two copies of one policy is exactly how "upi counts as bank" quietly stops being
 * true on one side. This runs both over every pay method and fails when they
 * disagree, which is the only thing that makes the duplication safe.
 */

const ME = 'me';

function db() {
  const d = new DatabaseSync(':memory:');
  d.exec(`
    CREATE TABLE txn (id TEXT PRIMARY KEY, kind TEXT, pay_method TEXT, date INTEGER,
                      is_deleted INTEGER DEFAULT 0, recur_freq TEXT);
    CREATE TABLE txn_payment (txn_id TEXT, person_id TEXT, amount INTEGER);
    CREATE TABLE txn_share   (txn_id TEXT, person_id TEXT, amount INTEGER);
    CREATE TABLE txn_approval (txn_id TEXT PRIMARY KEY, state TEXT, created_at INTEGER, decided_at INTEGER, landed_pay_method TEXT);
  `);
  return d;
}

/** One expense of `amount`, paid by me, with the given method. */
function spend(d: DatabaseSync, id: string, method: string | null, amount: number) {
  d.prepare('INSERT INTO txn (id, kind, pay_method, date) VALUES (?, ?, ?, 1)').run(id, 'expense', method);
  d.prepare('INSERT INTO txn_payment (txn_id, person_id, amount) VALUES (?, ?, ?)').run(id, ME, amount);
}

function flows(d: DatabaseSync): Record<string, number> {
  const rows = d.prepare(BUCKET_FLOWS_SQL).all(ME, ME, 9_999_999) as unknown as
    { bucket: string | null; delta: number }[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.bucket ?? 'unattributed'] = r.delta;
  return out;
}

describe('BUCKET_FLOWS_SQL agrees with assetOf', () => {
  it('puts every pay method in the same place both do', () => {
    const d = db();
    // A distinguishable amount per method, so a mis-grouping cannot cancel out.
    PAY_METHOD.forEach((pm, i) => spend(d, `t${i}`, pm, (i + 1) * 100));

    // What `assetOf` says the answer should be, summed per bucket.
    const expected: Record<string, number> = {};
    PAY_METHOD.forEach((pm, i) => {
      const bucket = assetOf(pm);
      if (bucket === 'credit') return;               // card moves no bucket
      const key = bucket ?? 'unattributed';
      expected[key] = (expected[key] ?? 0) - (i + 1) * 100;   // spending is negative
    });

    expect(flows(d)).toEqual(expected);
  });

  it('reads upi and autopay as bank, exactly as assetOf does', () => {
    const d = db();
    spend(d, 'a', PayMethod.Upi, 500);
    spend(d, 'b', PayMethod.Autopay, 300);
    spend(d, 'c', PayMethod.Bank, 200);
    expect(flows(d).bank).toBe(-1000);
    expect(assetOf(PayMethod.Upi)).toBe('bank');
    expect(assetOf(PayMethod.Autopay)).toBe('bank');
  });

  it('leaves an unrecorded pay method unattributed rather than guessing', () => {
    // The legacy case, and the whole reason there is a fourth group. Defaulting
    // NULL into bank would drain that bucket for every old row while the total
    // stayed right — wrong in the way nothing looks broken.
    const d = db();
    spend(d, 'a', null, 700);
    const got = flows(d);
    expect(got.unattributed).toBe(-700);
    expect(got.bank).toBeUndefined();
    expect(assetOf(null)).toBeNull();
  });

  it('never moves a bucket for card spend', () => {
    const d = db();
    spend(d, 'a', PayMethod.Card, 9000);
    expect(flows(d)).toEqual({});
    expect(assetOf(PayMethod.Card)).toBe('credit');
  });

  it('ignores an entry that is still waiting for approval', () => {
    const d = db();
    spend(d, 'a', PayMethod.Bank, 400);
    d.prepare("INSERT INTO txn_approval (txn_id, state, created_at) VALUES ('a', 'pending', 1)").run();
    expect(flows(d)).toEqual({});
  });
});
