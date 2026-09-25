import { createD1, type TestD1 } from './helpers/d1';
import { addMember, insert, makeGroup, makeTransaction, makeUser, uid } from './helpers/fixtures';
import { applyPush, ensureDevice, type Mutation } from '../../../../server/api/sync/push';
import { ENTITIES } from '../../../../server/api/sync/routes';

/**
 * "Same person as…" (`DQ-94` part 2, Phase 2 task P1): two placeholders, folded
 * by hand, `into_person` rather than `into_user`. No account is involved on
 * either side, so the authority rule is the one already used for the FROM side
 * of an `into_user` merge, applied to both: whoever made the placeholder, or
 * shares a readable group with it.
 */

const T0 = 1_750_000_000_000;

async function push(db: TestD1, userId: string, mutations: Mutation[], now = T0) {
  const deviceId = `dev-${userId}`;
  const last = (await ensureDevice(db, userId, deviceId, now))!;
  return applyPush({ db, userId, deviceId, now }, mutations, last, ENTITIES);
}
const codes = async (db: TestD1) =>
  (await db.prepare('SELECT code FROM sync_rejections ORDER BY created_at, mutation_id').all<{ code: string }>()).results.map(r => r.code);

const person = async (db: TestD1, createdBy: string, id = uid('person')) => {
  await insert(db, 'people', { id, user_id: null, created_by: createdBy, created_at: T0 });
  return id;
};

const merge = (id: number, from: string, into: string, baseVersion = 0): Mutation => ({
  id, entity: 'person_merges', op: 'upsert', entityId: from, baseVersion, data: { into_person: into },
});

describe('person_merges — into_person (two placeholders, picked by hand)', () => {
  it('folds my own two placeholders: membership, splits and payers move, the placeholder is retired', async () => {
    const db = createD1();
    const me = await makeUser(db);
    const g = await makeGroup(db, me.userId);
    const aarav = await person(db, me.userId);
    const also = await person(db, me.userId);
    await addMember(db, g, me.personId, me.userId);
    await addMember(db, g, aarav, me.userId);
    const dinner = await makeTransaction(db, g, me.personId, me.userId);
    await insert(db, 'transaction_payers', { transaction_id: dinner, person_id: me.personId, amount: 30000 });
    await insert(db, 'transaction_splits', { transaction_id: dinner, person_id: me.personId, amount: 15000 });
    await insert(db, 'transaction_splits', { transaction_id: dinner, person_id: aarav, amount: 15000 });

    await push(db, me.userId, [merge(1, aarav, also)]);
    expect(await codes(db)).toEqual([]);

    expect(await db.prepare('SELECT merged_into FROM people WHERE id = ?').bind(aarav).first('merged_into')).toBe(also);
    expect(await db.prepare('SELECT status FROM group_members WHERE group_id = ? AND person_id = ?').bind(g, also).first('status')).toBe('active');
    expect(await db.prepare('SELECT COUNT(*) AS n FROM group_members WHERE group_id = ? AND person_id = ? AND deleted_at IS NULL')
      .bind(g, aarav).first('n')).toBe(0);
    expect(await db.prepare('SELECT amount FROM transaction_splits WHERE transaction_id = ? AND person_id = ?')
      .bind(dinner, also).first('amount')).toBe(15000);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM transaction_splits WHERE person_id = ?').bind(aarav).first('n')).toBe(0);
  });

  it('refuses a stranger\'s placeholder on the FROM side', async () => {
    const db = createD1();
    const me = await makeUser(db);
    const stranger = await makeUser(db);
    const theirs = await person(db, stranger.userId);
    const mine = await person(db, me.userId);

    await push(db, me.userId, [merge(1, theirs, mine)]);
    expect(await codes(db)).toEqual(['forbidden']);
    expect(await db.prepare('SELECT merged_into FROM people WHERE id = ?').bind(theirs).first('merged_into')).toBeNull();
  });

  it('refuses a stranger\'s placeholder on the INTO side', async () => {
    const db = createD1();
    const me = await makeUser(db);
    const stranger = await makeUser(db);
    const mine = await person(db, me.userId);
    const theirs = await person(db, stranger.userId);

    await push(db, me.userId, [merge(1, mine, theirs)]);
    expect(await codes(db)).toEqual(['forbidden']);
    expect(await db.prepare('SELECT merged_into FROM people WHERE id = ?').bind(mine).first('merged_into')).toBeNull();
  });

  it('a shared group is enough authority, on either side, with no link required', async () => {
    const db = createD1();
    const owner = await makeUser(db);
    const member = await makeUser(db);
    const g = await makeGroup(db, owner.userId);
    const a = await person(db, owner.userId);
    const b = await person(db, owner.userId);
    await addMember(db, g, owner.personId, owner.userId);
    await addMember(db, g, member.personId, owner.userId);
    await addMember(db, g, a, owner.userId);
    await addMember(db, g, b, owner.userId);

    // `member` made neither placeholder, but reads the group both are in — no
    // link between `owner` and `member` exists, unlike an `into_user` merge.
    await push(db, member.userId, [merge(1, a, b)]);
    expect(await codes(db)).toEqual([]);
    expect(await db.prepare('SELECT merged_into FROM people WHERE id = ?').bind(a).first('merged_into')).toBe(b);
  });

  it('refuses into_person naming an account — that is what into_user is for', async () => {
    const db = createD1();
    const me = await makeUser(db);
    const other = await makeUser(db);
    const mine = await person(db, me.userId);

    await push(db, me.userId, [merge(1, mine, other.personId)]);
    expect(await codes(db)).toEqual(['invalid']);
  });

  it('refuses into_person naming a placeholder that is already merged', async () => {
    const db = createD1();
    const me = await makeUser(db);
    const a = await person(db, me.userId);
    const b = await person(db, me.userId);
    const c = await person(db, me.userId);
    await push(db, me.userId, [merge(1, a, b)]);
    expect(await codes(db)).toEqual([]);

    await push(db, me.userId, [merge(2, c, a)], T0 + 1);
    expect(await codes(db)).toEqual(['invalid']);
  });

  it('into_user is unchanged: still requires a live link, and into_person plays no part in it', async () => {
    const db = createD1();
    const me = await makeUser(db);
    const other = await makeUser(db);
    const mine = await person(db, me.userId);

    await push(db, me.userId, [{
      id: 1, entity: 'person_merges', op: 'upsert', entityId: mine, baseVersion: 0, data: { into_user: other.userId },
    }]);
    expect(await codes(db)).toEqual(['forbidden']);

    const [a, b] = me.userId < other.userId ? [me.userId, other.userId] : [other.userId, me.userId];
    await insert(db, 'links', { id: uid('link'), user_a: a, user_b: b, created_at: T0, ended_at: null });
    await push(db, me.userId, [{
      id: 2, entity: 'person_merges', op: 'upsert', entityId: mine, baseVersion: 0, data: { into_user: other.userId },
    }], T0 + 1);
    expect(await db.prepare('SELECT code FROM sync_rejections WHERE mutation_id = 2').first('code')).toBeNull();
    expect(await db.prepare('SELECT merged_into FROM people WHERE id = ?').bind(mine).first('merged_into')).toBe(other.personId);
  });
});
