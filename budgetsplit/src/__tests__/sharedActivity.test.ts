import { getSharedActivityWith } from '../db/queries/transactions';
import { createTestDb, addPerson, addGroup, addMember, addTxn, asDb } from './helpers/testDb';

/**
 * The person detail screen asks a different question from every other list in the
 * app: not "am I involved" but "are we **both** involved".
 *
 * `getMyActivity` answers the first, which inside a shared group is nearly every
 * row — so reusing it here would have shown a flatmate every dinner you ever had
 * with anyone else in the flat.
 */
describe('getSharedActivityWith', () => {
  function setup() {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const alex = addPerson(db, 'Alex', false);
    const sam = addPerson(db, 'Sam', false);
    const flat = addGroup(db, 'Flat', false);
    const personal = addGroup(db, 'Personal', true);
    for (const p of [me, alex, sam]) addMember(db, flat, p);
    addMember(db, personal, me);
    return { db, me, alex, sam, flat, personal };
  }

  const split = (people: string[], each: number) => people.map(personId => ({ personId, amount: each }));

  it('returns only transactions both people are on', async () => {
    const { db, me, alex, sam, flat } = setup();
    addTxn(db, {
      groupId: flat, kind: 'expense', date: 1, category: 'Food',
      payments: [{ personId: me, amount: 20000 }], shares: split([me, alex], 10000),
    });
    // Same group, but Alex isn't on it.
    addTxn(db, {
      groupId: flat, kind: 'expense', date: 2, category: 'Food',
      payments: [{ personId: me, amount: 20000 }], shares: split([me, sam], 10000),
    });

    const rows = await getSharedActivityWith(asDb(db), me, alex);
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe(1);
  });

  it('counts a person on either side — payer or sharer', async () => {
    const { db, me, alex, flat } = setup();
    // Alex paid, I consumed: he is a payer, I am a sharer.
    addTxn(db, {
      groupId: flat, kind: 'expense', date: 1, category: 'Food',
      payments: [{ personId: alex, amount: 20000 }], shares: split([me, alex], 10000),
    });
    expect(await getSharedActivityWith(asDb(db), me, alex)).toHaveLength(1);
  });

  it('excludes personal-group rows', async () => {
    // A personal-group settlement is deliberately one-sided (`CROSS_GROUP_FILTER`),
    // so counting it here would claim a transaction was shared when it wasn't.
    const { db, me, alex, personal } = setup();
    addTxn(db, {
      groupId: personal, kind: 'settlement', date: 1, category: 'Repayment',
      payments: [{ personId: me, amount: 20000 }], shares: [{ personId: alex, amount: 20000 }],
    });
    expect(await getSharedActivityWith(asDb(db), me, alex)).toHaveLength(0);
  });

  it('includes settlements and income, not just expenses', async () => {
    // A ledger shows all three kinds (AGENTS §12) — only balance maths drops income.
    const { db, me, alex, flat } = setup();
    addTxn(db, {
      groupId: flat, kind: 'settlement', date: 1, category: 'Repayment',
      payments: [{ personId: alex, amount: 10000 }], shares: [{ personId: me, amount: 10000 }],
    });
    addTxn(db, {
      groupId: flat, kind: 'income', date: 2, category: 'Refund',
      payments: [{ personId: me, amount: 5000 }], shares: [{ personId: alex, amount: 5000 }],
    });
    const kinds = (await getSharedActivityWith(asDb(db), me, alex)).map(r => r.kind).sort();
    expect(kinds).toEqual(['income', 'settlement']);
  });

  it('skips deleted rows and recurring templates', async () => {
    const { db, me, alex, flat } = setup();
    addTxn(db, {
      groupId: flat, kind: 'expense', date: 1, category: 'Food',
      payments: [{ personId: me, amount: 20000 }], shares: split([me, alex], 10000),
      isDeleted: true,
    });
    addTxn(db, {
      groupId: flat, kind: 'expense', date: 2, category: 'Rent',
      payments: [{ personId: me, amount: 20000 }], shares: split([me, alex], 10000),
      recurFreq: 'monthly',
    });
    expect(await getSharedActivityWith(asDb(db), me, alex)).toHaveLength(0);
  });

  it('hydrates payments and shares', async () => {
    const { db, me, alex, flat } = setup();
    addTxn(db, {
      groupId: flat, kind: 'expense', date: 1, category: 'Food',
      payments: [{ personId: me, amount: 20000 }], shares: split([me, alex], 10000),
    });
    const [row] = await getSharedActivityWith(asDb(db), me, alex);
    expect(row.payments).toEqual([{ personId: me, amount: 20000 }]);
    expect(row.shares).toHaveLength(2);
    expect(row.groupName).toBe('Flat');
  });
});
