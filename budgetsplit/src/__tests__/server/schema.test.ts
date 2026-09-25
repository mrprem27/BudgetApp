import { createD1 } from './helpers/d1';
import { addMember, insert, makeGroup, makeTransaction, makeUser, syncCols, uid } from './helpers/fixtures';

/**
 * The server schema's job is to REFUSE bad rows, not merely to hold good ones. Each
 * case here is a row the server must never store, whatever a client sends —
 * proven by the constraint itself, not by Worker code that could be bypassed.
 */
describe('server schema — accounts, people, groups, categories, budgets', () => {
  it('holds a complete, valid set of rows', async () => {
    const db = createD1();
    const me = await makeUser(db);
    const aarav = await makeUser(db);
    const g = await makeGroup(db, me.userId);
    await addMember(db, g, me.personId, me.userId, { role: 'admin' });
    await addMember(db, g, aarav.personId, me.userId);
    await insert(db, 'friends', {
      id: uid('friend'), ...syncCols(me.userId, me.userId), user_id: me.userId,
      person_id: aarav.personId, name: 'Aarav', avatar_color: '#8B7CF8',
    });
    await insert(db, 'categories', {
      id: uid('cat'), ...syncCols(me.userId, me.userId), user_id: me.userId, kind: 'expense', name: 'Food',
    });
    await insert(db, 'budgets', {
      id: uid('budget'), ...syncCols(g, me.userId), group_id: g, category: 'Food', amount: 500000,
    });
    await insert(db, 'devices', { id: uid('device'), user_id: me.userId, created_at: 1, last_seen_at: 1 });
    expect(await db.prepare('SELECT COUNT(*) AS n FROM group_members').first('n')).toBe(2);
  });

  it('refuses a foreign key to a row that does not exist', async () => {
    const db = createD1();
    const me = await makeUser(db);
    await expect(insert(db, 'friends', {
      id: uid('friend'), ...syncCols(me.userId, me.userId), user_id: me.userId,
      person_id: 'no-such-person', name: 'Ghost', avatar_color: '#000000',
    })).rejects.toThrow(/FOREIGN KEY/);
  });

  it('refuses a value outside an enum', async () => {
    const db = createD1();
    const me = await makeUser(db);
    await expect(makeGroup(db, me.userId, { kind: 'team' })).rejects.toThrow(/CHECK/);
    const g = await makeGroup(db, me.userId);
    await expect(addMember(db, g, me.personId, me.userId, { role: 'owner' })).rejects.toThrow(/CHECK/);
  });

  it('refuses a budget of zero or less', async () => {
    const db = createD1();
    const me = await makeUser(db);
    const g = await makeGroup(db, me.userId);
    for (const amount of [0, -100]) {
      await expect(insert(db, 'budgets', {
        id: uid('budget'), ...syncCols(g, me.userId), group_id: g, category: 'Food', amount,
      })).rejects.toThrow(/CHECK/);
    }
  });

  it('allows one live personal group per user, and a new one after deleting it', async () => {
    const db = createD1();
    const me = await makeUser(db);
    const first = await makeGroup(db, me.userId, { kind: 'personal', name: 'Personal' });
    await expect(makeGroup(db, me.userId, { kind: 'personal', name: 'Personal' })).rejects.toThrow(/UNIQUE/);
    await db.prepare('UPDATE groups SET deleted_at = 1 WHERE id = ?').bind(first).run();
    await expect(makeGroup(db, me.userId, { kind: 'personal', name: 'Personal' })).resolves.toBeDefined();
  });

  it('refuses a duplicate live category, and allows it again once the first is deleted', async () => {
    const db = createD1();
    const me = await makeUser(db);
    const cat = () => ({
      id: uid('cat'), ...syncCols(me.userId, me.userId), user_id: me.userId, kind: 'expense', name: 'Food',
    });
    const first = cat();
    await insert(db, 'categories', first);
    await expect(insert(db, 'categories', cat())).rejects.toThrow(/UNIQUE/);
    // Same name, other kind: a different category.
    await insert(db, 'categories', { ...cat(), kind: 'income' });
    // The tombstone stays, and frees the name.
    await db.prepare('UPDATE categories SET deleted_at = 1 WHERE id = ?').bind(first.id).run();
    await insert(db, 'categories', cat());
    expect(await db.prepare("SELECT COUNT(*) AS n FROM categories WHERE kind = 'expense'").first('n')).toBe(2);
  });

  it('refuses a second default budget line for one category, but allows a personal override', async () => {
    const db = createD1();
    const me = await makeUser(db);
    const g = await makeGroup(db, me.userId);
    const line = (over: Record<string, unknown> = {}) => ({
      id: uid('budget'), ...syncCols(g, me.userId), group_id: g, category: 'Food', amount: 100, ...over,
    });
    await insert(db, 'budgets', line());
    await expect(insert(db, 'budgets', line())).rejects.toThrow(/UNIQUE/);
    await insert(db, 'budgets', line({ person_id: me.personId }));
    await expect(insert(db, 'budgets', line({ person_id: me.personId }))).rejects.toThrow(/UNIQUE/);
  });

  it('never lets a group change owner', async () => {
    const db = createD1();
    const me = await makeUser(db);
    const other = await makeUser(db);
    const g = await makeGroup(db, me.userId);
    await expect(
      db.prepare('UPDATE groups SET owner_id = ? WHERE id = ?').bind(other.userId, g).run(),
    ).rejects.toThrow(/owner_id is permanent/);
    // Every other column stays editable.
    await db.prepare("UPDATE groups SET name = 'Flat 4B' WHERE id = ?").bind(g).run();
  });

  it('refuses a row filed under someone else\'s scope', async () => {
    const db = createD1();
    const me = await makeUser(db);
    const other = await makeUser(db);
    await expect(insert(db, 'categories', {
      id: uid('cat'), ...syncCols(other.userId, me.userId), user_id: me.userId, kind: 'expense', name: 'Food',
    })).rejects.toThrow(/CHECK/);
  });

  it('records when a member left exactly when they have left', async () => {
    const db = createD1();
    const me = await makeUser(db);
    const g = await makeGroup(db, me.userId);
    await expect(addMember(db, g, me.personId, me.userId, { status: 'left' })).rejects.toThrow(/CHECK/);
    await expect(addMember(db, g, me.personId, me.userId, { status: 'active', left_at: 5 })).rejects.toThrow(/CHECK/);
    await addMember(db, g, me.personId, me.userId, { status: 'removed', left_at: 5 });
  });

  it('refuses a person merged into themselves', async () => {
    const db = createD1();
    const me = await makeUser(db);
    await expect(insert(db, 'people', {
      id: 'loop', merged_into: 'loop', created_by: me.userId, created_at: 1,
    })).rejects.toThrow(/CHECK/);
  });

  it('write_guard aborts the whole batch when its condition fails', async () => {
    const db = createD1();
    const me = await makeUser(db);
    const g = await makeGroup(db, me.userId);
    const rename = db.prepare('UPDATE groups SET name = ?, version = version + 1 WHERE id = ?').bind('Renamed', g);
    // Compare-and-set: this client saw version 7; the row is at 1.
    const guard = db.prepare('INSERT INTO write_guard SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM groups WHERE id = ? AND version = ?)')
      .bind(g, 7);
    await expect(db.batch([guard, rename])).rejects.toThrow(/precondition_failed|CHECK/);
    expect(await db.prepare('SELECT name FROM groups WHERE id = ?').bind(g).first('name')).toBe('Flat');

    const pass = db.prepare('INSERT INTO write_guard SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM groups WHERE id = ? AND version = ?)')
      .bind(g, 1);
    await db.batch([pass, rename]);
    expect(await db.prepare('SELECT name FROM groups WHERE id = ?').bind(g).first('name')).toBe('Renamed');
  });
});

describe('server schema — transactions, approvals, personal money, activity', () => {
  async function world() {
    const db = createD1();
    const me = await makeUser(db);
    const aarav = await makeUser(db);
    const shared = await makeGroup(db, me.userId);
    const personal = await makeGroup(db, me.userId, { kind: 'personal', name: 'Personal' });
    await addMember(db, shared, me.personId, me.userId, { role: 'admin' });
    await addMember(db, shared, aarav.personId, me.userId);
    return { db, me, aarav, shared, personal };
  }

  it('holds a complete transaction bundle and everything that hangs off it', async () => {
    const { db, me, aarav, shared } = await world();
    const t = await makeTransaction(db, shared, me.personId, me.userId, { adjustments: '{"tax":0}' });
    await insert(db, 'transaction_payers', { transaction_id: t, person_id: me.personId, amount: 30000 });
    await insert(db, 'transaction_splits', { transaction_id: t, person_id: me.personId, amount: 15000 });
    await insert(db, 'transaction_splits', { transaction_id: t, person_id: aarav.personId, amount: 15000 });
    await insert(db, 'transaction_tags', { transaction_id: t, tag: 'Goa' });
    await insert(db, 'transaction_items', {
      id: uid('item'), transaction_id: t, name: 'Pizza', quantity: 1, unit_price: 30000, assigned_to: 'all',
    });
    await insert(db, 'recurring_rules', { transaction_id: t, frequency: 'monthly' });
    await insert(db, 'recurring_skips', { rule_id: t, occurrence_date: 1, created_at: 1 });
    await makeTransaction(db, shared, me.personId, me.userId, { recurring_rule_id: t, occurrence_date: 2 });
    await insert(db, 'transaction_history', {
      id: uid('hist'), transaction_id: t, version: 1, snapshot: '{}', edited_by: me.userId, edited_at: 1,
    });
    await insert(db, 'approvals', {
      id: uid('appr'), ...syncCols(aarav.userId, me.userId), transaction_id: t, user_id: aarav.userId,
      status: 'pending', arrived_at: 1,
    });
    await insert(db, 'disputes', {
      id: uid('disp'), ...syncCols(shared, aarav.userId), group_id: shared, transaction_id: t,
      user_id: aarav.userId, transaction_version: 1, raised_at: 1,
    });
    await insert(db, 'activity_log', {
      id: uid('act'), scope_id: shared, seq: 1, actor_id: me.userId, entity: 'txn', entity_id: t,
      action: 'created', amount: 30000, summary: 'Added ₹300 · Food', created_at: 1,
    });
    expect(await db.prepare('SELECT COUNT(*) AS n FROM transaction_splits').first('n')).toBe(2);
  });

  it('refuses a payer or a split of zero or less', async () => {
    const { db, me, shared } = await world();
    const t = await makeTransaction(db, shared, me.personId, me.userId);
    for (const table of ['transaction_payers', 'transaction_splits']) {
      for (const amount of [0, -500]) {
        await expect(insert(db, table, { transaction_id: t, person_id: me.personId, amount }))
          .rejects.toThrow(/CHECK/);
      }
    }
    await expect(makeTransaction(db, shared, me.personId, me.userId, { amount: 0 })).rejects.toThrow(/CHECK/);
  });

  it('refuses a negative asset balance', async () => {
    const { db, me } = await world();
    await expect(insert(db, 'assets', {
      id: uid('asset'), ...syncCols(me.userId, me.userId), user_id: me.userId, name: 'Gold', balance: -1,
    })).rejects.toThrow(/CHECK/);
  });

  it('refuses a savings transaction that belongs to no goal', async () => {
    const { db, me } = await world();
    await expect(insert(db, 'savings_transactions', {
      id: uid('st'), ...syncCols(me.userId, me.userId), user_id: me.userId, goal_id: null,
      amount: 100, kind: 'deposit', date: 1,
    })).rejects.toThrow(/NOT NULL/);
  });

  it('refuses an unknown repeat mode — but accepts a paused rule with no pause date, which old phones hold', async () => {
    const { db, me, shared } = await world();
    const t = await makeTransaction(db, shared, me.personId, me.userId);
    await expect(insert(db, 'recurring_rules', { transaction_id: t, frequency: 'monthly', mode: 'sometimes' }))
      .rejects.toThrow(/CHECK/);
    await insert(db, 'recurring_rules', { transaction_id: t, frequency: 'monthly', status: 'paused' });
  });

  it('refuses JSON that is not JSON', async () => {
    const { db, me, shared } = await world();
    await expect(makeTransaction(db, shared, me.personId, me.userId, { adjustments: '{tax:' }))
      .rejects.toThrow(/CHECK/);
  });

  it('keeps income and asset movements in the personal group', async () => {
    const { db, me, shared, personal } = await world();
    await expect(makeTransaction(db, shared, me.personId, me.userId, { kind: 'income' }))
      .rejects.toThrow(/personal group/);
    await makeTransaction(db, personal, me.personId, me.userId, { kind: 'income' });
    const asset = uid('asset');
    await insert(db, 'assets', { id: asset, ...syncCols(me.userId, me.userId), user_id: me.userId, name: 'Gold' });
    await expect(makeTransaction(db, shared, me.personId, me.userId, { kind: 'settlement', asset_id: asset }))
      .rejects.toThrow(/personal group/);
    // …and an existing shared expense cannot be edited into income.
    const t = await makeTransaction(db, shared, me.personId, me.userId);
    await expect(db.prepare("UPDATE transactions SET kind = 'income' WHERE id = ?").bind(t).run())
      .rejects.toThrow(/personal group/);
  });

  it('refuses a rejection with no decision date', async () => {
    const { db, me, aarav, shared } = await world();
    const t = await makeTransaction(db, shared, me.personId, me.userId);
    await expect(insert(db, 'approvals', {
      id: uid('appr'), ...syncCols(aarav.userId, aarav.userId), transaction_id: t, user_id: aarav.userId,
      status: 'rejected', arrived_at: 1,
    })).rejects.toThrow(/CHECK/);
  });

  it('allows one trust answer per person everywhere, plus one per group', async () => {
    const { db, me, aarav, shared } = await world();
    const trust = (over: Record<string, unknown> = {}) => ({
      id: uid('trust'), ...syncCols(me.userId, me.userId), user_id: me.userId,
      person_id: aarav.personId, level: 'trusted', ...over,
    });
    await insert(db, 'trust_settings', trust());
    await expect(insert(db, 'trust_settings', trust())).rejects.toThrow(/UNIQUE/);
    await insert(db, 'trust_settings', trust({ group_id: shared, level: 'review' }));
    await expect(insert(db, 'trust_settings', trust({ group_id: shared }))).rejects.toThrow(/UNIQUE/);
  });
});
