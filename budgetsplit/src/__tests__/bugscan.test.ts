import type * as SQLite from 'expo-sqlite';
import { openTestDb, seedGroupAndMe } from './dbHarness';
import {
  insertTxnRows, softDeleteTxn, restoreTxn, reapDeletedAttachments, attachmentInUse, getActiveRecurringRules,
} from '../db/queries/transactions';
import { materializeDueOccurrences } from '../db/queries/recurring';
import { queueUpsert, setQueueListener } from '../db/queries/syncQueue';
import { loadCatchUp } from '../lib/homeData';
import { settings } from '../lib/settings';
import { formatRupees, formatRupeesShort } from '../lib/money';

// Regressions for docs/SPEC-BUGSCAN.md. Each was proven by reverting its fix.

const ME = 'me';
const DAY = 86_400_000;

async function seedRule(db: SQLite.SQLiteDatabase, extra: Record<string, unknown> = {}) {
  await insertTxnRows(db, {
    groupId: 'g', kind: 'expense', entryMode: 'quick', date: Date.now() - 70 * DAY, category: 'Rent',
    recurFreq: 'monthly', recurInterval: 1,
    payments: [{ personId: ME, amount: 100_000 }], shares: [{ personId: ME, amount: 100_000 }],
    ...extra,
  } as Parameters<typeof insertTxnRows>[1], 'rule', Date.now());
}

const liveOccurrences = async (db: SQLite.SQLiteDatabase) =>
  (await db.getAllAsync<{ id: string }>("SELECT id FROM txn WHERE parent_recur_id = 'rule' AND is_deleted = 0")).map(r => r.id);

describe('BS-2 · Undo of "delete rule + all logged"', () => {
  it('restores only what that delete removed, not an occurrence deleted earlier by hand', async () => {
    const db = await openTestDb();
    await seedGroupAndMe(db);
    await seedRule(db);
    await materializeDueOccurrences(db);
    const [first, ...rest] = await liveOccurrences(db);
    expect(rest.length).toBeGreaterThan(0);

    await softDeleteTxn(db, first);
    await new Promise(r => setTimeout(r, 5)); // a later stamp, as a real second tap has
    await softDeleteTxn(db, 'rule', true);
    expect(await liveOccurrences(db)).toEqual([]);

    await restoreTxn(db, 'rule', true);
    expect((await liveOccurrences(db)).sort()).toEqual(rest.sort());
  });
});

describe('BS-3 · shared receipt files', () => {
  it('the reaper does not hand back a file a live row still uses', async () => {
    const db = await openTestDb();
    await seedGroupAndMe(db);
    await seedRule(db, { attachmentUri: 'file://rent.jpg' });
    await materializeDueOccurrences(db);
    const [first] = await liveOccurrences(db);
    await softDeleteTxn(db, first);
    await db.runAsync('UPDATE txn SET updated_at = ? WHERE id = ?', [Date.now() - 60 * DAY, first]);

    expect(await reapDeletedAttachments(db, 30 * DAY)).toEqual([]);
    expect(await attachmentInUse(db, 'file://rent.jpg')).toBe(true);
  });

  it('still hands back a file nothing else points at', async () => {
    const db = await openTestDb();
    await seedGroupAndMe(db);
    await insertTxnRows(db, {
      groupId: 'g', kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food', attachmentUri: 'file://solo.jpg',
      payments: [{ personId: ME, amount: 500 }], shares: [{ personId: ME, amount: 500 }],
    } as Parameters<typeof insertTxnRows>[1], 't', Date.now());
    await softDeleteTxn(db, 't');
    await db.runAsync("UPDATE txn SET updated_at = ? WHERE id = 't'", [Date.now() - 60 * DAY]);
    expect(await reapDeletedAttachments(db, 30 * DAY)).toEqual(['file://solo.jpg']);
  });
});

describe('BS-4 · rules in a group that ended for me', () => {
  it.each([
    ['deleted', "UPDATE budget_group SET deleted_at = 1, is_archived = 1 WHERE id = 'g'"],
    ['left', "UPDATE group_member SET deleted_at = 1 WHERE group_id = 'g' AND person_id = 'me'"],
  ])('a %s group posts nothing and counts as no bill', async (_why, end) => {
    const db = await openTestDb();
    await seedGroupAndMe(db);
    await seedRule(db);
    await db.runAsync(end);
    expect(await materializeDueOccurrences(db)).toBe(0);
    expect(await getActiveRecurringRules(db)).toEqual([]);
  });

  it('a live group still posts', async () => {
    const db = await openTestDb();
    await seedGroupAndMe(db);
    await seedRule(db);
    expect(await materializeDueOccurrences(db)).toBeGreaterThan(0);
  });
});

describe('BS-5 · a queued change schedules its own sync', () => {
  afterEach(() => setQueueListener(null));
  it('tells the listener, whatever screen made the write', async () => {
    const db = await openTestDb();
    const heard = jest.fn();
    setQueueListener(heard);
    await queueUpsert(db, 'savings_goal', 'goal-1');
    expect(heard).toHaveBeenCalled();
  });
});

describe('U2 · Home catch-up counts only rules that posted', () => {
  it('ignores remind-only, ended and someone else\'s rules', async () => {
    const db = await openTestDb();
    await seedGroupAndMe(db);
    await seedRule(db);
    for (const [id, set] of [['remind', "recur_mode = 'remind'"], ['ended', "recur_state = 'ended'"], ['peer', "author_person_id = 'x'"]] as const) {
      await insertTxnRows(db, {
        groupId: 'g', kind: 'expense', entryMode: 'quick', date: Date.now() - 70 * DAY, category: 'Gym',
        recurFreq: 'monthly', recurInterval: 1,
        payments: [{ personId: ME, amount: 1 }], shares: [{ personId: ME, amount: 1 }],
      } as Parameters<typeof insertTxnRows>[1], id, Date.now());
      await db.runAsync(`UPDATE txn SET ${set} WHERE id = ?`, [id]);
    }
    await settings.setAppLastOpen(Date.now() - 40 * DAY);
    expect(await loadCatchUp(db)).toEqual({ days: 40, ruleCount: 1 });
    // Stamped: the next open, moments later, says nothing.
    expect(await loadCatchUp(db)).toBeNull();
  });
});

describe('U5 · a negative amount reads "-₹50.00", like the compact form', () => {
  it('puts the sign before the symbol, and never prints -₹0', () => {
    expect(formatRupees(-5000)).toBe('-₹50.00');
    expect(formatRupees(5000)).toBe('₹50.00');
    expect(formatRupees(-0)).toBe('₹0.00');
    expect(formatRupees(-0.4)).toBe('₹0.00');
    expect(formatRupeesShort(-150050)).toBe('-₹1,501');
    expect(formatRupeesShort(-20)).toBe('₹0');
  });
});

describe('IM-1 · bank CSVs quote amounts that contain a thousands comma', () => {
  it('imports the quoted rows, not just the plain ones', () => {
    const { parseStatement } = jest.requireActual('../lib/importParse') as typeof import('../lib/importParse');
    const r = parseStatement([
      'Date,Narration,Withdrawal,Deposit,Balance',
      '01/06/2025,"UPI-SWIGGY, BLR","1,250.00",,"48,750.00"',
      '02/06/2025,"NEFT SALARY",,"50,000.00","98,750.00"',
      '03/06/2025,Coffee,120.00,,98630.00',
    ].join('\n'));
    expect(r.rows.map(x => [x.amount, x.direction])).toEqual([[125000, 'debit'], [5000000, 'credit'], [12000, 'debit']]);
    expect(r.rows[0].description).toBe('UPI-SWIGGY, BLR');
    expect(r.skipped).toBe(1); // the header, and only the header
  });
});

describe('IM-2 · an empty withdrawal cell must not turn a deposit into an expense', () => {
  const { parseStatement } = jest.requireActual('../lib/importParse') as typeof import('../lib/importParse');
  const HEADER = 'Date,Narration,Ref No,Withdrawal Amt.,Deposit Amt.,Closing Balance';

  it('reads the side from the header, so a blank cell keeps its column', () => {
    const r = parseStatement([
      HEADER,
      '02/06/2025,NEFT SALARY,000123,,50000.00,98750.00',
      '03/06/2025,Coffee,000124,120.00,,98630.00',
    ].join('\n'));
    expect(r.rows.map(x => [x.amount, x.direction, x.kind])).toEqual([[5000000, 'credit', 'income'], [12000, 'debit', 'expense']]);
  });

  it('is not fooled by a reference number in the row', () => {
    const r = parseStatement([HEADER, '02/06/2025,Refund,402913847,,250.00,9000.00'].join('\n'));
    expect(r.rows.map(x => [x.amount, x.direction])).toEqual([[25000, 'credit']]);
  });

  it('leaves a headerless statement to the old heuristic', () => {
    const r = parseStatement('02/06/2025,Coffee,120.00 Dr');
    expect(r.rows.map(x => [x.amount, x.direction])).toEqual([[12000, 'debit']]);
  });
});

describe('UP-1 · a UPI code that states an amount keeps it', () => {
  const { parseAnyUpiQr } = jest.requireActual('../lib/upiIntent') as typeof import('../lib/upiIntent');
  it('reads am from a upi:// code, so the amount cannot be typed differently', () => {
    expect(parseAnyUpiQr('upi://pay?pa=shop@okhdfcbank&pn=Shop&am=249.50&cu=INR')?.amountPaise).toBe(24950);
  });
  it('leaves an open-amount code open', () => {
    expect(parseAnyUpiQr('upi://pay?pa=rahul@ybl&pn=Rahul')?.amountPaise).toBeUndefined();
    expect(parseAnyUpiQr('rahul@ybl')?.amountPaise).toBeUndefined();
  });
  it('ignores an am that is not a plain positive amount', () => {
    for (const am of ['0', '-5', '1e3', 'abc', '', '99999999999', '1.234']) {
      expect(parseAnyUpiQr(`upi://pay?pa=x@ybl&am=${am}`)?.amountPaise).toBeUndefined();
    }
  });
});

describe('UP-2 · a merchant QR whose checksum does not hold is not a payee', () => {
  const { parseMerchantQr, emvCrc16 } = jest.requireActual('../lib/emvQr') as typeof import('../lib/emvQr');
  const tlv = (tag: string, v: string) => `${tag}${String(v.length).padStart(2, '0')}${v}`;
  // Independent of the code under test, and over Node's real UTF-8 bytes.
  const referenceCrc = (text: string) => {
    let crc = 0xffff;
    for (const byte of Buffer.from(text, 'utf8')) {
      crc ^= byte << 8;
      for (let i = 0; i < 8; i++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return crc;
  };
  const withCrc = (body: string) => {
    const head = `${body}6304`;
    return head + referenceCrc(head).toString(16).toUpperCase().padStart(4, '0');
  };
  const body = (name: string, vpa = 'shop@okhdfcbank') =>
    tlv('00', '01') + tlv('01', '11') + tlv('26', tlv('00', 'in.gov.upi') + tlv('01', vpa))
    + tlv('52', '5411') + tlv('53', '356') + tlv('59', name) + tlv('60', 'Pune');

  it('computes the standard CRC-16/CCITT-FALSE check value', () => {
    expect(emvCrc16('123456789')).toBe(0x29b1);
  });
  it('accepts a code whose checksum holds, non-ASCII names included', () => {
    expect(parseMerchantQr(withCrc(body('Chai Stop')))?.vpa).toBe('shop@okhdfcbank');
    expect(parseMerchantQr(withCrc(body('चाय की दुकान')))?.vpa).toBe('shop@okhdfcbank');
  });
  it('rejects one whose payee was changed under an intact length and checksum', () => {
    const good = withCrc(body('Chai Stop'));
    expect(parseMerchantQr(good.replace('shop@okhdfcbank', 'scam@okhdfcbank'))).toBeNull();
  });
  it('still accepts a code that carries no checksum at all', () => {
    expect(parseMerchantQr(body('Chai Stop'))?.vpa).toBe('shop@okhdfcbank');
  });
});

describe('VP-1/2 · a dictated phrase is read the way the recognizer formats it', () => {
  const { parseVoice } = jest.requireActual('../lib/voiceParse') as typeof import('../lib/voiceParse');
  const opts = { categories: [{ name: 'Groceries' }], people: [{ id: 'p1', name: 'Riya' }], nowMs: new Date(2026, 8, 29, 12).getTime() };
  const read = (t: string) => parseVoice(t, opts);

  it('VP-1 · group commas do not split an amount', () => {
    expect(read('1,200 groceries').amountPaise).toBe(120000);
    expect(read('rent 1,20,000').amountPaise).toBe(12000000);
    expect(read('groceries 1.5 lakh').amountPaise).toBe(15000000);
  });

  it('VP-1 · a sentence-final full stop does not hide the amount or the person', () => {
    expect(read('coffee 150.').amountPaise).toBe(15000);
    expect(read('Rs.450 chai').amountPaise).toBe(45000);
    const paid = read('paid Riya 500.');
    expect([paid.amountPaise, paid.personId]).toEqual([50000, 'p1']);
  });

  it('VP-2 · the number in "2 days ago" is the date, not the amount', () => {
    for (const t of ['2 days ago I paid 450 for lunch', 'two days ago I paid four fifty for lunch']) {
      const d = read(t);
      expect(d.amountPaise).toBe(45000);
      expect(d.dateMs).not.toBeNull();
      expect(d.note).toBe('lunch');
    }
  });
});

describe('EG-1 · the 12-month surplus counts every recurring bill, not only the monthly ones', () => {
  const { monthlyAffordability } = jest.requireActual('../lib/engine/behaviour') as typeof import('../lib/engine/behaviour');
  const { PERSONA_NOW } = jest.requireActual('../db/enginePersonas') as typeof import('../db/enginePersonas');
  const DAY = 86_400_000;
  const R = (rupees: number) => rupees * 100;
  type Snap = import('../lib/engine/types').FinanceSnapshot;
  type Rule = Snap['recurring']['rules'][number];
  const rule = (o: object) => ({ group_id: 'g', entry_mode: 'quick', is_deleted: 0, pendingApproval: false, payments: [], shares: [], ...o }) as unknown as Rule;

  const snapWith = (bill: Rule): Snap => ({
    asOf: PERSONA_NOW, meId: 'me',
    cash: { available: R(1_000_000), creditUsed: 0, creditLimit: 0, cardDueDay: null },
    recurring: {
      rules: [
        rule({ id: 'fee', kind: 'expense', date: PERSONA_NOW + 180 * DAY, category: 'Education', recur_freq: 'yearly', shares: [{ personId: 'me', amount: R(12_000) }] }),
        rule({ id: 'salary', kind: 'income', date: PERSONA_NOW - 3 * DAY, category: 'Salary', recur_freq: 'monthly', payments: [{ personId: 'me', amount: R(20_000) }] }),
        bill,
      ],
      skips: {},
    },
    goals: { list: [], savedByGoal: {}, funding: { commitMonthly: 0, fundedThisMonth: 0, remaining: 0, goalsCount: 0 } },
    exposure: { owe: 0, owed: 0, owedExpected: 0, net: 0, owePeople: 0, owedPeople: 0, perPerson: [] },
    receivables: [], budgets: [], futureOneOffs: [],
    history: [90, 60, 30].map(d => ({ id: `i${d}`, date: PERSONA_NOW - d * DAY, kind: 'income' as const, category: 'Salary', amountPaise: R(20_000), isRecurringLinked: true })),
  });

  it('a weekly ₹5,000 bill (~₹21,667 a month) eats a ₹20,000 income', () => {
    const weekly = rule({ id: 'maid', kind: 'expense', date: PERSONA_NOW + 2 * DAY, category: 'Household Help', recur_freq: 'weekly', shares: [{ personId: 'me', amount: R(5_000) }] });
    expect(monthlyAffordability(snapWith(weekly))[0].surplusPaise).toBeLessThan(0);
  });

  it('an every-10-days bill counts by its interval', () => {
    const custom = rule({ id: 'tiffin', kind: 'expense', date: PERSONA_NOW + 2 * DAY, category: 'Food', recur_freq: 'custom', recur_interval: 10, shares: [{ personId: 'me', amount: R(7_000) }] });
    expect(monthlyAffordability(snapWith(custom))[0].surplusPaise).toBe(R(20_000) - R(21_000));
  });

  it('a monthly bill still counts once, and the yearly fee is not counted twice', () => {
    const monthly = rule({ id: 'rent', kind: 'expense', date: PERSONA_NOW + 2 * DAY, category: 'Rent', recur_freq: 'monthly', shares: [{ personId: 'me', amount: R(8_000) }] });
    expect(monthlyAffordability(snapWith(monthly))[0].surplusPaise).toBe(R(12_000));
  });
});

describe('EG-2 · a due day is held to the month\'s length, and a due day in progress is today', () => {
  const { knownEvents, projectKnown } = jest.requireActual('../lib/engine/projection') as typeof import('../lib/engine/projection');
  const { purchaseEvents } = jest.requireActual('../lib/engine/assess') as typeof import('../lib/engine/assess');
  type Snap = import('../lib/engine/types').FinanceSnapshot;
  const card = (asOf: number, cardDueDay: number): Snap => ({
    asOf, meId: 'me',
    cash: { available: 1_000_000, creditUsed: 50_000, creditLimit: 0, cardDueDay },
    recurring: { rules: [], skips: {} },
    goals: { list: [], savedByGoal: {}, funding: { commitMonthly: 0, fundedThisMonth: 0, remaining: 0, goalsCount: 0 } },
    exposure: { owe: 0, owed: 0, owedExpected: 0, net: 0, owePeople: 0, owedPeople: 0, perPerson: [] },
    receivables: [], budgets: [], history: [], futureOneOffs: [],
  });
  const cardDate = (asOf: number, day: number) =>
    knownEvents(card(asOf, day), asOf + 60 * 86_400_000).find(e => e.kind === 'card')!.date;

  it('the 31st in a 30-day month is the 30th, not the 1st of the next', () => {
    expect(cardDate(Date.UTC(2026, 3, 10, 12), 31)).toBe(Date.UTC(2026, 3, 30));
  });

  it('the 31st in February is the 28th', () => {
    expect(cardDate(Date.UTC(2026, 1, 1, 12), 31)).toBe(Date.UTC(2026, 1, 28));
  });

  it('a card due today is due today, not a month out', () => {
    const asOf = Date.UTC(2026, 3, 15, 12);
    expect(cardDate(asOf, 15)).toBe(asOf);
    // On the path from day one, so the low point sees it — not a stand-in day at the horizon's end.
    expect(projectKnown(card(asOf, 15), 30).days[0].events.map(e => e.kind)).toContain('card');
  });

  it('a monthly purchase that starts on the 31st returns to the 31st after a short month', () => {
    const start = Date.UTC(2026, 0, 31);
    const dates = purchaseEvents({ amountPaise: 100, recurrence: 'monthly' } as never, start, start + 100 * 86_400_000).map(e => e.date);
    expect(dates).toEqual([start, Date.UTC(2026, 1, 28), Date.UTC(2026, 2, 31), Date.UTC(2026, 3, 30)]);
  });
});

describe('IM-3 · a reference number in a headerless row is not the amount', () => {
  const { parseStatement } = jest.requireActual('../lib/importParse') as typeof import('../lib/importParse');
  it('skips a long or zero-led bare number when the row has real amounts', () => {
    const r = parseStatement(['02/06/2025,Coffee,402913847,120.00,9000.00', '03/06/2025,Tea,000124,60.00,8940.00'].join('\n'));
    expect(r.rows.map(x => x.amount)).toEqual([12000, 6000]);
  });
  it('still reads a lone plain number as the amount', () => {
    expect(parseStatement('02/06/2025,Coffee,120').rows.map(x => x.amount)).toEqual([12000]);
  });
});
