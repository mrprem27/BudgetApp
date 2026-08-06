import { DatabaseSync } from 'node:sqlite';
import { MCC_CATEGORY, categoryForMcc } from '../lib/mcc';
import { DEFAULT_CATEGORIES } from '../constants/categories';
import { SCHEMA, COLUMN_MIGRATIONS } from '../db/schema';

describe('categoryForMcc', () => {
  it('maps a merchant category code to a category', () => {
    expect(categoryForMcc('5411')).toBe('Groceries');
    expect(categoryForMcc('5812')).toBe('Eating Out');
    expect(categoryForMcc('4121')).toBe('Cab & Auto');
    expect(categoryForMcc('5912')).toBe('Health & Pharmacy');
  });

  it('fails closed on anything that is not four digits', () => {
    // The code arrives off a scanned QR, so it is attacker-controlled.
    for (const bad of ['', '  ', '54', '54111', 'abcd', '54a1', '-411', '54.1']) {
      expect(categoryForMcc(bad)).toBeNull();
    }
    expect(categoryForMcc(undefined)).toBeNull();
    expect(categoryForMcc(null)).toBeNull();
  });

  it('returns null for an unmapped code rather than a nearest guess', () => {
    // 5813 is mapped, 5815 is not adjacent-therefore-similar.
    expect(categoryForMcc('5815')).toBeNull();
    expect(categoryForMcc('0000')).toBeNull();
    expect(categoryForMcc('9999')).toBeNull();
  });

  it('tolerates surrounding whitespace, since the value is parsed from a QR', () => {
    expect(categoryForMcc(' 5411 ')).toBe('Groceries');
  });

  it('only ever names a category that actually exists', () => {
    // A category string matching nothing drops silently on the way into Review, which
    // looks identical to "we couldn't tell" while actually being a typo.
    const known = new Set(DEFAULT_CATEGORIES.map(c => c.name));
    for (const [code, category] of Object.entries(MCC_CATEGORY)) {
      expect(known.has(category)).toBe(true);
      expect(code).toMatch(/^\d{4}$/);
    }
  });

  it('leaves genuinely ambiguous codes unmapped', () => {
    // Mapping "miscellaneous retail" or "department stores" to Shopping would be right
    // often enough to look fine and wrong often enough to mis-budget — and a name like
    // "Krishna Medical Store" carries more signal than the code does. A category we
    // cannot defend is worse than none, because Review reads a filled field as an answer.
    expect(MCC_CATEGORY['5999']).toBeUndefined(); // miscellaneous retail
    expect(MCC_CATEGORY['5311']).toBeUndefined(); // department stores
    expect(MCC_CATEGORY['5300']).toBeUndefined(); // wholesale clubs
  });
});

describe('pending_txn carries a scanned location', () => {
  /**
   * Scan & Pay is the only import that runs while the user stands at the merchant, so
   * its location is first-hand rather than inferred. That is worth nothing if the columns
   * silently don't exist: the insert would throw, or worse, a `SELECT *` round-trip would
   * quietly drop them. Run against real SQLite so the schema is the thing under test.
   */
  function freshDb(): DatabaseSync {
    const db = new DatabaseSync(':memory:');
    db.exec(SCHEMA);
    return db;
  }

  it('has the columns, and round-trips them', () => {
    const db = freshDb();
    db.exec(`
      INSERT INTO pending_txn (id, date, amount, description, kind, direction, created_at, source, pay_method, lat, lng, place_label)
      VALUES ('p1', 1000, 900, 'Chai Stop', 'expense', 'debit', 1000, 'upi_qr', 'upi', 12.9352, 77.6245, 'Koramangala, Bengaluru')
    `);
    const row = db.prepare('SELECT lat, lng, place_label FROM pending_txn WHERE id = ?').get('p1') as
      { lat: number; lng: number; place_label: string };
    expect(row.lat).toBeCloseTo(12.9352);
    expect(row.lng).toBeCloseTo(77.6245);
    expect(row.place_label).toBe('Koramangala, Bengaluru');
    db.close();
  });

  it('leaves them null for imports that have no honest location', () => {
    // An emailed receipt parsed days later must not be stamped with where the phone is
    // now — that would be the user's sofa, recorded as though it were the shop.
    const db = freshDb();
    db.exec(`
      INSERT INTO pending_txn (id, date, amount, description, kind, direction, created_at, source)
      VALUES ('p2', 1000, 900, 'Amazon', 'expense', 'debit', 1000, 'email')
    `);
    const row = db.prepare('SELECT lat, lng, place_label FROM pending_txn WHERE id = ?').get('p2') as
      { lat: number | null; lng: number | null; place_label: string | null };
    expect(row.lat).toBeNull();
    expect(row.lng).toBeNull();
    expect(row.place_label).toBeNull();
    db.close();
  });

  it('migrates a database created before the columns existed', () => {
    // The ALTERs are what an existing install actually runs; a schema that only works
    // for fresh databases would break exactly the users who have data to lose.
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE pending_txn (
        id TEXT PRIMARY KEY, date INTEGER NOT NULL, amount INTEGER NOT NULL,
        description TEXT NOT NULL, kind TEXT NOT NULL, direction TEXT NOT NULL DEFAULT 'unknown',
        created_at INTEGER NOT NULL
      )
    `);
    for (const m of COLUMN_MIGRATIONS.filter(s => /pending_txn ADD COLUMN (lat|lng|place_label)/.test(s))) {
      db.exec(m);
    }
    db.exec(`
      INSERT INTO pending_txn (id, date, amount, description, kind, direction, created_at, lat, lng, place_label)
      VALUES ('p3', 1, 1, 'x', 'expense', 'debit', 1, 1.5, 2.5, 'Somewhere')
    `);
    const row = db.prepare('SELECT lat, lng, place_label FROM pending_txn WHERE id = ?').get('p3') as
      { lat: number; lng: number; place_label: string };
    expect(row.lat).toBeCloseTo(1.5);
    expect(row.lng).toBeCloseTo(2.5);
    expect(row.place_label).toBe('Somewhere');
    db.close();
  });
});
