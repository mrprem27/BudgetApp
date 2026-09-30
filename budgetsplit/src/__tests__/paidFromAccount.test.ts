import { paidFromLabel, accountName, accountsToChoose } from '../lib/paidFrom';
import { PayMethod } from '../constants/enums';
import { insertTxn, updateTxn } from '../db/queries/transactions';
import { upsertAccount } from '../db/queries/accounts';
import { applyLaunchInvariants } from '../db/schema';
import { txnInputFromPlan } from '../lib/reviewCommit';
import { createTestDb, addPerson, addGroup, addMember, asDb } from './helpers/testDb';

/** `U-68` 1a.5–6: Paid from picks a named account, and reads as one. */
const ACCOUNTS = [
  { id: 'default:bank', name: 'Bank', kind: 'bank', is_default: 1 },
  { id: 'hdfc', name: 'HDFC', kind: 'bank', is_default: 0 },
  { id: 'default:cash', name: 'Cash', kind: 'cash', is_default: 1 },
];

describe('Paid from reads as the account', () => {
  it('reads as the kind while there is one account of it', () => {
    expect(accountsToChoose(ACCOUNTS, PayMethod.Cash)).toEqual([]);
    expect(paidFromLabel(ACCOUNTS, PayMethod.Cash, 'default:cash')).toBe('Cash');
  });

  it('names the account once there are several, the default when none is set', () => {
    expect(accountsToChoose(ACCOUNTS, PayMethod.Bank).map(a => a.id)).toEqual(['default:bank', 'hdfc']);
    expect(paidFromLabel(ACCOUNTS, PayMethod.Bank, 'hdfc')).toBe('HDFC');
    expect(paidFromLabel(ACCOUNTS, PayMethod.Bank, undefined)).toBe('Bank');
    // A stale id of another kind falls back to this kind's default.
    expect(paidFromLabel(ACCOUNTS, PayMethod.Bank, 'default:cash')).toBe('Bank');
  });

  it('the detail names a renamed default even when it is the only one', () => {
    expect(accountName([{ id: 'default:cash', name: 'Wallet at home', kind: 'cash', is_default: 1 }], PayMethod.Cash, null)).toBe('Wallet at home');
  });
});

describe('an entry keeps the account it was paid from', () => {
  async function world() {
    const db = createTestDb();
    await applyLaunchInvariants(async sql => { db.raw.exec(sql); });
    const me = addPerson(db, 'Me', true);
    const g = addGroup(db, 'Personal', true);
    addMember(db, g, me);
    const hdfc = await upsertAccount(asDb(db), { name: 'HDFC', kind: 'bank' });
    const account = (id: string) => (db.raw.prepare('SELECT account_id FROM txn WHERE id = ?').get(id) as { account_id: string | null }).account_id;
    const base = { groupId: g, kind: 'expense' as const, entryMode: 'quick' as const, date: 1000, category: 'Food', payments: [{ personId: me, amount: 500 }], shares: [{ personId: me, amount: 500 }] };
    return { db, hdfc, account, base };
  }

  it('stores the named account, and the default when none is given', async () => {
    const { db, hdfc, account, base } = await world();
    expect(account(await insertTxn(asDb(db), { ...base, payMethod: PayMethod.Bank, accountId: hdfc }))).toBe(hdfc);
    expect(account(await insertTxn(asDb(db), { ...base, payMethod: PayMethod.Bank }))).toBe('default:bank');
  });

  it('drops an account of another kind rather than keep a mismatch', async () => {
    const { db, hdfc, account, base } = await world();
    const id = await insertTxn(asDb(db), { ...base, payMethod: PayMethod.Cash, accountId: hdfc });
    expect(account(id)).toBe('default:cash');
  });

  it('an edit keeps the account unless it is changed', async () => {
    const { db, hdfc, account, base } = await world();
    const id = await insertTxn(asDb(db), { ...base, payMethod: PayMethod.Bank, accountId: hdfc });
    const edit = { id, groupId: base.groupId, kind: base.kind, date: base.date, category: 'Food', payMethod: PayMethod.Bank, payments: base.payments, shares: base.shares };
    await updateTxn(asDb(db), edit);
    expect(account(id)).toBe(hdfc);
    await updateTxn(asDb(db), { ...edit, accountId: 'default:bank' });
    expect(account(id)).toBe('default:bank');
  });

  it('a reviewed row carries its account into the entry', () => {
    const input = txnInputFromPlan(
      { account_id: 'hdfc', date: 1, description: 'x', source: 'manual', lat: null, lng: null, place_label: null } as never,
      { ok: true, groupId: 'g', kind: 'expense', payer: 'me', total: 100, category: 'Food', payMethod: PayMethod.Bank, snap: {} as never, shares: [] } as never,
    );
    expect(input.accountId).toBe('hdfc');
  });
});
