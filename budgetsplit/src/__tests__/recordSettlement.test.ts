import { openTestDb, seedGroupAndMe } from './dbHarness';
import { recordSettlement, getTxnById } from '../db/queries/transactions';
import { parseTags } from '../lib/tags';

/**
 * `recordSettlement` is the one canonical way money between two people is written,
 * used by the Transfer pill, the smart settle screen and the demo seed.
 *
 * It gained `tags` and `attachmentUri` so Transfer can carry the same optional
 * detail as any other transaction — previously the Add screen collected tags on
 * the *edit* path and silently dropped them on create, so the same field persisted
 * or vanished depending on how you arrived.
 *
 * The assertion that matters most here is the negative one: the two-sided
 * payment/share shape must be byte-identical to before. This is the money path.
 */
const ME = 'me';
const OTHER = 'other';

async function seed() {
  const db = await openTestDb();
  await seedGroupAndMe(db);
  await db.runAsync("INSERT INTO person (id, name, is_me, avatar_color) VALUES (?,?,0,'#fff')", [OTHER, 'Alex']);
  await db.runAsync("INSERT INTO group_member (group_id, person_id) VALUES ('g', ?)", [OTHER]);
  return db;
}

const base = { groupId: 'g', fromId: ME, toId: OTHER, amount: 50_000 };

describe('recordSettlement', () => {
  it('writes one payment from the payer and one share to the payee', async () => {
    const db = await seed();
    const id = await recordSettlement(db, base);
    const t = await getTxnById(db, id);

    expect(t!.kind).toBe('settlement');
    expect(t!.payments).toEqual([{ personId: ME, amount: 50_000 }]);
    expect(t!.shares).toEqual([{ personId: OTHER, amount: 50_000 }]);
  });

  it('writes the SAME split whether or not the new optional fields are given', async () => {
    // The regression guard for the change: adding tags/attachment must not
    // perturb the money rows by a single paisa or flip either direction.
    const db = await seed();
    const plain = await getTxnById(db, await recordSettlement(db, base));
    const rich = await getTxnById(db, await recordSettlement(db, {
      ...base, tags: ['goa', 'reimburse'], attachmentUri: 'file:///receipt.jpg',
    }));

    expect(rich!.payments).toEqual(plain!.payments);
    expect(rich!.shares).toEqual(plain!.shares);
    expect(rich!.kind).toBe(plain!.kind);
  });

  it('persists tags and an attachment when given', async () => {
    const db = await seed();
    const id = await recordSettlement(db, {
      ...base, tags: ['goa', 'reimburse'], attachmentUri: 'file:///receipt.jpg',
    });
    const t = await getTxnById(db, id);

    expect(parseTags(t!.tags)).toEqual(['goa', 'reimburse']);
    expect(t!.attachment_uri).toBe('file:///receipt.jpg');
  });

  it('leaves both null when they are not given', async () => {
    // Every existing caller omits them — demo seed, settle screen, confirm flow.
    const db = await seed();
    const t = await getTxnById(db, await recordSettlement(db, base));

    expect(t!.tags).toBeNull();
    expect(t!.attachment_uri).toBeNull();
  });

  it('still defaults the category and date', async () => {
    const db = await seed();
    const t = await getTxnById(db, await recordSettlement(db, base));
    expect(t!.category).toBe('Settlement');
    expect(t!.date).toBeGreaterThan(0);
  });
});
