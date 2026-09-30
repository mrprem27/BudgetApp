import { ACCOUNT_FLOWS_SQL, BUCKET_FLOWS_SQL, CARD_FLOWS_SQL, CASH_TOTALS_SQL } from '../db/queries/cashQuery';
import { getAccounts, upsertAccount, archiveAccount } from '../db/queries/accounts';
import { setMoneyProfile } from '../db/queries/moneyProfile';
import { applyLaunchInvariants } from '../db/schema';
import { createTestDb, addPerson, addGroup, addMember, addTxn, asDb, type TestDb } from './helpers/testDb';

/**
 * `U-68` 1a.3: balances per account. Per kind they must equal the bucket flows, and the card
 * rows must equal `cardSpend`, or the accounts list and the Money card disagree about one sum.
 */
async function world() {
  const db = createTestDb();
  await applyLaunchInvariants(async sql => { db.raw.exec(sql); });
  const me = addPerson(db, 'Me', true);
  const g = addGroup(db, 'Personal', true);
  addMember(db, g, me);
  const hdfc = await upsertAccount(asDb(db), { name: 'HDFC', kind: 'bank', openingBalance: 40000 });
  const amex = await upsertAccount(asDb(db), { name: 'Amex', kind: 'card', creditLimit: 1000000 });
  return { db, me, g, hdfc, amex };
}

function entry(db: TestDb, g: string, me: string, kind: 'expense' | 'income' | 'settlement', pay: string | null, account: string | null, amount: number, side: 'pay' | 'share' = 'pay', toAccount: string | null = null) {
  const id = addTxn(db, {
    groupId: g, kind, date: 1000, category: 'X',
    ...(side === 'pay' ? { payments: [{ personId: me, amount }] } : { shares: [{ personId: me, amount }] }),
  });
  db.raw.prepare('UPDATE txn SET pay_method = ?, account_id = ?, to_account_id = ? WHERE id = ?').run(pay, account, toAccount, id);
}

const sum = (rows: { delta: number }[]) => rows.reduce((s, r) => s + r.delta, 0);

describe('ACCOUNT_FLOWS_SQL', () => {
  it('sums to the bucket flows per kind, and CARD_FLOWS_SQL to cardSpend', async () => {
    const { db, me, g, hdfc, amex } = await world();
    entry(db, g, me, 'expense', 'bank', hdfc, 1100);
    entry(db, g, me, 'expense', 'bank', 'default:bank', 2300);
    entry(db, g, me, 'income', 'bank', null, 50000);             // a peer's row: no account
    entry(db, g, me, 'expense', 'cash', 'default:cash', 700);
    entry(db, g, me, 'expense', 'card', amex, 900);
    entry(db, g, me, 'expense', 'card', 'default:card', 400);
    entry(db, g, me, 'settlement', 'bank', hdfc, 600, 'pay', amex); // paying the Amex bill from HDFC
    entry(db, g, me, 'settlement', 'bank', hdfc, 5000, 'share');  // money in
    entry(db, g, me, 'expense', null, null, 300);                // not recorded

    const byAccount = db.raw.prepare(ACCOUNT_FLOWS_SQL).all(me, me, 9e12) as { account_id: string | null; delta: number }[];
    const byBucket = db.raw.prepare(BUCKET_FLOWS_SQL).all(me, me, 9e12) as { bucket: string | null; delta: number }[];
    const kindOf = (a: string | null) => (a === null ? null : a === hdfc ? 'bank' : a.replace('default:', ''));
    for (const b of byBucket) {
      expect(sum(byAccount.filter(a => kindOf(a.account_id) === b.bucket))).toBe(b.delta);
    }
    expect(byAccount.find(a => a.account_id === hdfc)?.delta).toBe(-1100 + 5000 - 600);
    expect(byAccount.find(a => a.account_id === 'default:bank')?.delta).toBe(-2300 + 50000);

    const cards = db.raw.prepare(CARD_FLOWS_SQL).all(0, 0, me, 9e12) as { account_id: string; delta: number }[];
    const totals = db.raw.prepare(CASH_TOTALS_SQL).get(0, 0, me, me, 9e12) as { cardSpend: number };
    expect(sum(cards)).toBe(totals.cardSpend);
    expect(cards.find(c => c.account_id === amex)?.delta).toBe(900 - 600);
  });

  it('gives each account its balance, the default card carrying the stated balance', async () => {
    const { db, me, g, hdfc, amex } = await world();
    await setMoneyProfile(asDb(db), { openingBank: 140000, creditUsed: 2000 });
    // The card balance was stated before these entries, so they count on top of it.
    db.raw.prepare("UPDATE settings SET value = '500' WHERE key = 'money.card_baseline_at'").run();
    entry(db, g, me, 'expense', 'bank', hdfc, 1100);
    entry(db, g, me, 'expense', 'card', amex, 900);
    const accounts = await getAccounts(asDb(db));
    const of = (id: string) => accounts.find(a => a.id === id)?.balance;
    expect(of(hdfc)).toBe(40000 - 1100);
    expect(of('default:bank')).toBe(100000);   // the total the profile holds, less HDFC's opening
    expect(of(amex)).toBe(900);
    expect(of('default:card')).toBe(2000);
  });

  it('archives a named account but never a default', async () => {
    const { db, hdfc } = await world();
    await archiveAccount(asDb(db), hdfc);
    await archiveAccount(asDb(db), 'default:bank');
    const live = (await getAccounts(asDb(db))).map(a => a.id);
    expect(live).not.toContain(hdfc);
    expect(live).toContain('default:bank');
    expect((await getAccounts(asDb(db), { archived: true })).map(a => a.id)).toEqual([hdfc]);
  });
});

describe('a card bill names both ends (DQ-109)', () => {
  it('converts an old card bill once, and leaves a friend paid by card as card spending', async () => {
    const { db, me, g } = await world();
    const friend = addPerson(db, 'Riya', false);
    entry(db, g, me, 'settlement', 'card', 'default:card', 3000);                 // an old-shape card bill
    const toFriend = addTxn(db, { groupId: g, kind: 'settlement', date: 1000, category: 'X',
      payments: [{ personId: me, amount: 500 }], shares: [{ personId: friend, amount: 500 }] });
    db.raw.prepare("UPDATE txn SET pay_method = 'card', account_id = 'default:card' WHERE id = ?").run(toFriend);

    await applyLaunchInvariants(async sql => { db.raw.exec(sql); });
    await applyLaunchInvariants(async sql => { db.raw.exec(sql); });

    const rows = db.raw.prepare("SELECT id, pay_method, account_id, to_account_id FROM txn WHERE kind = 'settlement' ORDER BY id").all() as
      { id: string; pay_method: string; account_id: string; to_account_id: string | null }[];
    const bill = rows.find(r => r.id !== toFriend)!;
    expect(bill).toMatchObject({ pay_method: 'bank', account_id: 'default:bank', to_account_id: 'default:card' });
    expect(rows.find(r => r.id === toFriend)).toMatchObject({ pay_method: 'card', to_account_id: null });
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM sync_queue WHERE local_table = 'txn' AND local_id = ?").get(bill.id)).toEqual({ n: 1 });
    // The bill comes out of the bank and off the card: ₹500 spent on it, ₹3,000 repaid, nothing owed.
    const after = await getAccounts(asDb(db));
    const of = (id: string) => after.find(a => a.id === id)!.balance;
    expect(of('default:bank')).toBe(-3000);
    expect(of('default:card')).toBe(0);
  });
});
