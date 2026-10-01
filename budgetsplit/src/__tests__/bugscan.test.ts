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

describe('TP-1 · the time picker saves the time it shows, and its wheels are not the sheet\'s drag', () => {
  const { snapTime } = jest.requireActual('../lib/timeSnap') as typeof import('../lib/timeSnap');
  const fs = jest.requireActual('fs') as typeof import('fs');

  it('holds a time to the wheel step, across the hour and midnight', () => {
    expect(snapTime({ hour: 7, minute: 7 }, 5)).toEqual({ hour: 7, minute: 5 });
    expect(snapTime({ hour: 7, minute: 58 }, 5)).toEqual({ hour: 8, minute: 0 });
    expect(snapTime({ hour: 23, minute: 58 }, 5)).toEqual({ hour: 0, minute: 0 });
    expect(snapTime({ hour: 9, minute: 30 }, 5)).toEqual({ hour: 9, minute: 30 });
  });

  it('the sheet holding the wheels is dragged by its header only', () => {
    const src = fs.readFileSync('src/components/ui/TimePickerSheet.tsx', 'utf8');
    expect(src).toMatch(/dragBody=\{false\}/);
  });
});

describe('HB-1 · Help paragraphs read as bullets', () => {
  const { helpBullets } = jest.requireActual('../lib/helpBullets') as typeof import('../lib/helpBullets');
  it('one bullet per sentence', () => {
    expect(helpBullets('Tap + → Income. Enter the amount, pick a source, and save. Income counts as savings.'))
      .toEqual(['Tap + → Income.', 'Enter the amount, pick a source, and save.', 'Income counts as savings.']);
  });
  it('keeps e.g., decimals and a lone sentence whole', () => {
    expect(helpBullets('Add context (e.g. "Rajesh\'s dinner"). It is searchable.')).toEqual(['Add context (e.g. "Rajesh\'s dinner").', 'It is searchable.']);
    expect(helpBullets('Costs ₹4.50 a month')).toEqual(['Costs ₹4.50 a month']);
    expect(helpBullets('')).toEqual([]);
  });
});

describe('FC-1 · the forecast chart is drawn only once it has a width', () => {
  const fs = jest.requireActual('fs') as typeof import('fs');
  it('holds the space until measured, and re-keys on width', () => {
    const src = fs.readFileSync('app/(tabs)/insights.tsx', 'utf8');
    expect(src).toMatch(/chartW > 0 \? \(/);
    expect(src).toMatch(/key=\{Math\.round\(chartW\)\}/);
  });
});

describe('TR-1 · the Afford working states the engine\'s real rules with real numbers', () => {
  const { affordTrace } = jest.requireActual('../lib/engine/trace') as typeof import('../lib/engine/trace');
  const { afford } = jest.requireActual('../lib/engine/assess') as typeof import('../lib/engine/assess');
  const { PERSONA_NOW } = jest.requireActual('../db/enginePersonas') as typeof import('../db/enginePersonas');
  const DAY = 86_400_000;
  type Snap = import('../lib/engine/types').FinanceSnapshot;
  const snap: Snap = {
    asOf: PERSONA_NOW, meId: 'me',
    cash: { available: 5_000_000, creditUsed: 0, creditLimit: 0, cardDueDay: null },
    recurring: { rules: [], skips: {} },
    goals: { list: [], savedByGoal: {}, funding: { commitMonthly: 0, fundedThisMonth: 0, remaining: 0, goalsCount: 0 } },
    exposure: { owe: 0, owed: 0, owedExpected: 0, net: 0, owePeople: 0, owedPeople: 0, perPerson: [] },
    receivables: [], budgets: [], futureOneOffs: [],
    history: Array.from({ length: 40 }, (_, i) => ({ id: `e${i}`, date: PERSONA_NOW - (40 - i) * DAY, kind: 'expense' as const, category: 'Groceries', amountPaise: 20_000, isRecurringLinked: false })),
  };
  const purchase = { amountPaise: 100_000, when: 'now' as const };
  const lines = () => affordTrace(snap, purchase, afford(snap, purchase)).sections.flatMap(s => s.lines);

  it('says how the everyday rate is built, with the day counts', () => {
    const rate = lines().find(l => l.label === 'Everyday spending' && l.detail?.includes('ordinary days'));
    expect(rate?.detail).toMatch(/36 ordinary days of the last 40.*4 biggest days are dropped/);
  });

  it('explains the safety floor from the median Need day', () => {
    const floor = lines().find(l => l.label === 'Safety floor');
    expect(floor?.detail).toMatch(/median daily spend on Needs/);
  });

  it('says what cash includes', () => {
    expect(lines().find(l => l.label === 'Cash you can spend now')?.detail).toMatch(/wallet.*goals/);
  });
});

describe('EG-3 · the horizon runs to the NEAREST payday, and every income counts', () => {
  const { horizonDaysFor, knownEvents } = jest.requireActual('../lib/engine/projection') as typeof import('../lib/engine/projection');
  const { PERSONA_NOW } = jest.requireActual('../db/enginePersonas') as typeof import('../db/enginePersonas');
  const DAY = 86_400_000;
  const R = (n: number) => n * 100;
  type Snap = import('../lib/engine/types').FinanceSnapshot;
  type Rule = Snap['recurring']['rules'][number];
  const income = (id: string, freq: string, inDays: number, amount: number) => ({
    id, group_id: 'g', kind: 'income', entry_mode: 'quick', date: PERSONA_NOW + inDays * DAY, category: 'Salary',
    recur_freq: freq, is_deleted: 0, pendingApproval: false, payments: [{ personId: 'me', amount }], shares: [],
  }) as unknown as Rule;
  const snapOf = (rules: Rule[]): Snap => ({
    asOf: PERSONA_NOW, meId: 'me',
    cash: { available: R(50_000), creditUsed: 0, creditLimit: 0, cardDueDay: null },
    recurring: { rules, skips: {} },
    goals: { list: [], savedByGoal: {}, funding: { commitMonthly: 0, fundedThisMonth: 0, remaining: 0, goalsCount: 0 } },
    exposure: { owe: 0, owed: 0, owedExpected: 0, net: 0, owePeople: 0, owedPeople: 0, perPerson: [] },
    receivables: [], budgets: [], futureOneOffs: [],
    history: [90, 60, 30].map(d => ({ id: `i${d}`, date: PERSONA_NOW - d * DAY, kind: 'income' as const, category: 'Salary', amountPaise: R(40_000), isRecurringLinked: true })),
  });

  it('a yearly bonus listed first does not stretch the horizon to next year', () => {
    const days = horizonDaysFor(snapOf([income('bonus', 'yearly', 340, R(100_000)), income('salary', 'monthly', 12, R(40_000))]));
    expect(days).toBe(30);
  });

  it('a lone far-off income cannot push the horizon past two months', () => {
    expect(horizonDaysFor(snapOf([income('bonus', 'yearly', 340, R(100_000))]))).toBeLessThanOrEqual(60);
  });

  it('a second income (rent, a side job) is counted too', () => {
    const rules = [income('salary', 'monthly', 12, R(40_000)), income('rent', 'monthly', 20, R(15_000))];
    const paid = knownEvents(snapOf(rules), PERSONA_NOW + 30 * DAY, true).filter(e => e.kind === 'income').map(e => e.ref).sort();
    expect(paid).toEqual(['rent', 'salary']);
  });
});

describe('IR-1 · Import is reachable from Review even while items are waiting', () => {
  const fs = jest.requireActual('fs') as typeof import('fs');
  it("Review's header always carries an Import button", () => {
    const src = fs.readFileSync('app/(ledger)/review.tsx', 'utf8');
    expect(src).toMatch(/Import more data[\s\S]{0,80}router\.push\('\/import'\)/);
  });
});

describe('UX-1 · budget used reads as a multiple once it is over', () => {
  const { usageText } = jest.requireActual('../lib/budgetCopy') as typeof import('../lib/budgetCopy');
  it('percent up to 100, then ×', () => {
    expect(usageText(0)).toBe('0%');
    expect(usageText(87.4)).toBe('87%');
    expect(usageText(100)).toBe('100%');
    expect(usageText(101)).toBe('1.01×');
    expect(usageText(150)).toBe('1.5×');
    expect(usageText(240)).toBe('2.4×');
    expect(usageText(1234)).toBe('12×');
  });
  it('never prints NaN or a negative', () => {
    expect(usageText(NaN)).toBe('0%');
    expect(usageText(-5)).toBe('0%');
  });
});

describe('FR-1 · a payment names the other person when you owe', () => {
  const { paymentSentence } = jest.requireActual('../lib/owe') as typeof import('../lib/owe');
  it('words it from your side', () => {
    expect(paymentSentence({ name: 'Prem Bhati', is_me: 1 }, { name: 'Aarav Sharma' })).toEqual({ lead: 'You owe ', name: 'Aarav Sharma', tail: '' });
    expect(paymentSentence({ name: 'Aarav Sharma' }, { name: 'Prem Bhati', is_me: 1 })).toEqual({ lead: '', name: 'Aarav Sharma', tail: ' owes you' });
    expect(paymentSentence({ name: 'Aarav' }, { name: 'Riya' })).toEqual({ lead: '', name: 'Aarav', tail: ' owes Riya' });
  });
});

describe('GR-1 · the group picker puts the groups you use most first', () => {
  const { createTestDb, addPerson, addGroup, addMember, addSimpleExpense } = jest.requireActual('./helpers/testDb') as typeof import('./helpers/testDb');
  const { getGroupsByRecentUse } = jest.requireActual('../db/queries/groups') as typeof import('../db/queries/groups');
  const DAY = 86_400_000;
  it('orders by recent entry count, not by which was touched last', async () => {
    const now = Date.now();
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const personal = addGroup(db, 'Personal', true); addMember(db, personal, me);
    const often = addGroup(db, 'Flat'); addMember(db, often, me);
    const once = addGroup(db, 'Trip'); addMember(db, once, me);
    for (let i = 0; i < 6; i++) addSimpleExpense(db, { groupId: often, personId: me, amount: 10_000, date: now - (10 + i) * DAY });
    addSimpleExpense(db, { groupId: once, personId: me, amount: 9_000_000, date: now - DAY });
    const names = (await getGroupsByRecentUse(db as never, now)).map(g => g.name);
    expect(names).toEqual(['Personal', 'Flat', 'Trip']);
  });
  it('entries older than 60 days do not count as recent', async () => {
    const now = Date.now();
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const personal = addGroup(db, 'Personal', true); addMember(db, personal, me);
    const old = addGroup(db, 'Old'); addMember(db, old, me);
    const fresh = addGroup(db, 'Fresh'); addMember(db, fresh, me);
    for (let i = 0; i < 8; i++) addSimpleExpense(db, { groupId: old, personId: me, amount: 100, date: now - (100 + i) * DAY });
    addSimpleExpense(db, { groupId: fresh, personId: me, amount: 100, date: now - 5 * DAY });
    expect((await getGroupsByRecentUse(db as never, now)).map(g => g.name)).toEqual(['Personal', 'Fresh', 'Old']);
  });
});

describe('F-1 · money forms use AmountRow, and the Your-money total is the three buckets', () => {
  const fs = jest.requireActual('fs') as typeof import('fs');
  const { sumInputsPaise } = jest.requireActual('../lib/money') as typeof import('../lib/money');
  it('totals the fields, empty ones as zero', () => {
    expect(sumInputsPaise('1200', '', '0')).toBe(120000);
    expect(sumInputsPaise('10.5', '2,000', 'abc')).toBe(201050);
    expect(sumInputsPaise()).toBe(0);
  });
  it.each([
    'src/components/finance/plan/MoneyEditorSheet.tsx',
    'src/components/finance/plan/PayCardBillSheet.tsx',
    'src/components/finance/plan/AssetSheet.tsx',
  ])('%s takes amounts only through AmountRow', file => {
    const src = fs.readFileSync(file, 'utf8');
    expect(src).toMatch(/<AmountRow/);
    expect(src).not.toMatch(/keyboardType="decimal-pad"/);
  });
});

describe('UI-1 · every tab has the same header and the same action buttons', () => {
  const fs = jest.requireActual('fs') as typeof import('fs');
  it.each(['index', 'groups', 'savings', 'insights'])('(tabs)/%s.tsx uses the shared large header and HeaderIconButton', tab => {
    const src = fs.readFileSync(`app/(tabs)/${tab}.tsx`, 'utf8');
    expect(src).toMatch(/<ScreenHeader\s+large|<ScreenHeader[^>]*\blarge\b/);
    expect(src).toMatch(/<HeaderIconButton/);
    // No hand-rolled header buttons left beside it.
    expect(src).not.toMatch(/styles\.headerAdd|styles\.headerIconBtn|styles\.headerBtn/);
  });
  it('the button holds the one icon size', () => {
    expect(fs.readFileSync('src/components/ui/HeaderIconButton.tsx', 'utf8')).toMatch(/layout\.headerIcon/);
  });
  it('only Home carries the profile avatar', () => {
    for (const tab of ['groups', 'savings', 'insights']) {
      expect(fs.readFileSync(`app/(tabs)/${tab}.tsx`, 'utf8')).not.toMatch(/ProfileButton|router\.push\('\/settings'\)/);
    }
  });
  it('Reports is reached from Insights; Export all data is on Profile with your other data', () => {
    expect(fs.readFileSync('app/(tabs)/insights.tsx', 'utf8')).toMatch(/router\.push\('\/reports'\)/);
    // Export was a tile at the foot of Insights; it is a file of your data, so it sits beside the backup.
    expect(fs.readFileSync('app/(tabs)/insights.tsx', 'utf8')).not.toMatch(/exportAll/);
    expect(fs.readFileSync('app/(system)/settings/account.tsx', 'utf8')).toMatch(/Export all data/);
    const settings = fs.readFileSync('app/(system)/settings/index.tsx', 'utf8');
    expect(settings).not.toMatch(/Reports & export|exportAll/);
  });
});

describe('G1 · the group header states where I stand', () => {
  const { headerBalance } = jest.requireActual('../lib/owe') as typeof import('../lib/owe');
  const fs = jest.requireActual('fs') as typeof import('fs');
  it('owed, owe and settled up', () => {
    expect(headerBalance(120000)).toEqual({ direction: 'owed', headline: "You're owed", amount: 120000 });
    expect(headerBalance(-30000)).toEqual({ direction: 'owe', headline: 'You owe', amount: 30000 });
    expect(headerBalance(0)).toEqual({ direction: 'settled', headline: 'Settled up', amount: 0 });
  });
  it('the screen uses the one header card, not the two old boxes', () => {
    const src = fs.readFileSync('app/(people)/group/[id].tsx', 'utf8');
    expect(src).toMatch(/<GroupHeaderCard/);
    expect(src).not.toMatch(/GroupHero|GroupBalanceCard/);
  });
});

describe('T1 · long-press shows a whole name', () => {
  jest.mock('react-native', () => ({ Alert: { alert: jest.fn() } }), { virtual: true });
  const { fullTextOnHold } = jest.requireActual('../components/ui/fullTextOnHold') as typeof import('../components/ui/fullTextOnHold');
  it('gives a handler for real text and nothing for empty', () => {
    expect(typeof fullTextOnHold('A very long group name').onLongPress).toBe('function');
    expect(fullTextOnHold('   ')).toEqual({});
    expect(fullTextOnHold(null)).toEqual({});
  });
});

describe('ST-1 · Settings rows share one colour per section', () => {
  const fs = jest.requireActual('fs') as typeof import('fs');
  it('the tint map is built from section colours, not per-row hues', () => {
    const src = fs.readFileSync('app/(system)/settings/index.tsx', 'utf8');
    expect(src).toMatch(/const SECTION = \{/);
    expect(src).toMatch(/upiId: SECTION\.paid,\s*upiQr: SECTION\.paid/);
  });
});

describe('G2 · one filter structure: tags match any-of, and the badge counts what sits behind the button', () => {
  const { matchesFilters, applyFilters, filtersActive, extraFilterCount, NO_FILTERS } = jest.requireActual('../lib/txnFilter') as typeof import('../lib/txnFilter');
  const fs = jest.requireActual('fs') as typeof import('fs');
  const row = (tags: string | null) => ({ kind: 'expense', date: 1, category: 'Food', note: null, tags, payments: [], shares: [] });

  it('a row matches when it carries ANY chosen tag, ignoring case', () => {
    const f = { ...NO_FILTERS, tags: ['Goa'] };
    expect(matchesFilters(row(JSON.stringify(['goa', 'work'])), f)).toBe(true);
    expect(matchesFilters(row(JSON.stringify(['work'])), f)).toBe(false);
    expect(matchesFilters(row(null), f)).toBe(false);
    expect(matchesFilters(row(JSON.stringify(['work'])), { ...NO_FILTERS, tags: ['Goa', 'work'] })).toBe(true);
  });

  it('no tags chosen means no tag filter', () => {
    const rows = [row(null), row(JSON.stringify(['x']))];
    expect(applyFilters(rows, { ...NO_FILTERS, tags: [] })).toHaveLength(2);
    expect(filtersActive({ ...NO_FILTERS, tags: [] })).toBe(false);
    expect(filtersActive({ ...NO_FILTERS, tags: ['x'] })).toBe(true);
  });

  it('the badge counts date, person and each tag — not the inline kind', () => {
    expect(extraFilterCount(NO_FILTERS)).toBe(0);
    expect(extraFilterCount({ from: 1, to: 2, personId: 'p', tags: ['a', 'b'] })).toBe(4);
    expect(extraFilterCount({ from: null, to: 5, personId: null, tags: [] })).toBe(1);
  });

  it('every screen with a filter bar passes tags through', () => {
    for (const f of ['app/(people)/personal.tsx', 'src/components/finance/group/TransactionsTab.tsx']) {
      const src = fs.readFileSync(f, 'utf8');
      expect(src).toMatch(/onTags=\{setTags\}/);
      expect(src).not.toMatch(/\bcollapsible\b/);
    }
  });
});

describe('G2b · Review carries the same Filters button, with a count', () => {
  const { reviewFilterCount, DEFAULT_FILTERS } = jest.requireActual('../lib/reviewFilter') as typeof import('../lib/reviewFilter');
  const fs = jest.requireActual('fs') as typeof import('fs');
  it('counts text, each category, amount and dates', () => {
    expect(reviewFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(reviewFilterCount({ ...DEFAULT_FILTERS, query: 'swiggy', categories: ['Food', 'Fuel'], amountMin: '100', dateFrom: '2026-09-01' })).toBe(5);
  });
  it('Review\'s filters sit in its header, with the count as a badge (U-35)', () => {
    expect(fs.readFileSync('app/(ledger)/review.tsx', 'utf8')).toMatch(/<HeaderIconButton icon="sliders" label="Filters" badge=\{reviewFilterCount\(filters\)\}/);
  });
});

describe('N3 · adding a member is the first thing on the member screens', () => {
  const fs = jest.requireActual('fs') as typeof import('fs');
  it('MembersTab: the Add member row comes before the list header', () => {
    const src = fs.readFileSync('src/components/finance/group/MembersTab.tsx', 'utf8');
    expect(src.indexOf('accessibilityLabel="Add member"')).toBeGreaterThan(0);
    expect(src.indexOf('accessibilityLabel="Add member"')).toBeLessThan(src.indexOf('members.map('));
    expect(src).not.toMatch(/Invite someone/);
  });
  it('members.tsx: the add control comes before the members card', () => {
    const src = fs.readFileSync('app/(people)/group/[id]/members.tsx', 'utf8');
    expect(src.indexOf('Add or create person')).toBeLessThan(src.indexOf('styles.membersCard'));
  });
});

describe('CU-1 · the Money tab shows the chosen currency, not a dollar sign', () => {
  const { currencySymbol } = jest.requireActual('../lib/money') as typeof import('../lib/money');
  const fs = jest.requireActual('fs') as typeof import('fs');
  it('follows the currency setting, and defaults to the rupee', () => {
    expect(currencySymbol('INR')).toBe('₹');
    expect(currencySymbol('USD')).toBe('$');
    expect(currencySymbol(undefined)).toBe('₹');
    expect(currencySymbol(null)).toBe('₹');
    expect(currencySymbol('XXX')).toBe('₹');
  });
  it('the tab bar renders that symbol for the Money tab', () => {
    const src = fs.readFileSync('app/(tabs)/_layout.tsx', 'utf8');
    expect(src).toMatch(/currencyGlyph/);
    expect(src).toMatch(/settings\.defaultCurrency\(\)/);
  });
});

describe('UP-3 · the pay picker: CRED and Airtel first, real icons, choices always visible', () => {
  const { UPI_APPS, UpiApp, pickDefaultApp } = jest.requireActual('../lib/upiIntent') as typeof import('../lib/upiIntent');
  const fs = jest.requireActual('fs') as typeof import('fs');

  it('CRED then Airtel lead, and PhonePe (which refuses third parties) is last', () => {
    const keys = UPI_APPS.map(a => a.key);
    expect(keys.slice(0, 2)).toEqual([UpiApp.Cred, UpiApp.Airtel]);
    expect(keys[keys.length - 1]).toBe(UpiApp.PhonePe);
  });

  it('with nothing chosen before, the default is the first installed app in that order', () => {
    const installed = UPI_APPS.filter(a => [UpiApp.PhonePe, UpiApp.Cred, UpiApp.Paytm].includes(a.key));
    expect(pickDefaultApp(installed, null)?.key).toBe(UpiApp.Cred);
    expect(pickDefaultApp(installed, UpiApp.Paytm)?.key).toBe(UpiApp.Paytm);
  });

  it('every listed app has a bundled icon file that exists', () => {
    const src = fs.readFileSync('src/components/finance/pay/upiAppLogos.ts', 'utf8');
    for (const a of UPI_APPS) {
      expect(src).toMatch(new RegExp(`UpiApp\\.\\w+\\]: require\\('../../../assets/upi/${a.key === 'gpay' ? 'googlepay' : a.key}\\.png'\\)`));
    }
    const files = (src.match(/assets\/upi\/(\w+)\.png/g) ?? []).map(m => m.replace('assets/upi/', ''));
    expect(files).toHaveLength(UPI_APPS.length);
    for (const f of files) expect(fs.existsSync(`src/assets/upi/${f}`)).toBe(true);
  });

  it('choosing an app only selects it — the grid has no collapse and does not close the sheet', () => {
    const src = fs.readFileSync('src/components/finance/pay/UpiPayButton.tsx', 'utf8');
    expect(src).toMatch(/onSelect=\{handoff\.choose\}/);
    expect(src).not.toMatch(/Collapse|setExpanded/);
  });

  it('Scan & Pay types the amount in the same hero field as Add', () => {
    expect(fs.readFileSync('src/components/finance/ScanPaySheet.tsx', 'utf8')).toMatch(/<AmountField/);
  });
});

describe('A · Money has three sections, and the forecast lives in Insights', () => {
  const fs = jest.requireActual('fs') as typeof import('fs');
  const money = fs.readFileSync('app/(tabs)/savings.tsx', 'utf8');
  it('Overview | Assets | Goals, each rendered on its own', () => {
    for (const k of ['overview', 'assets', 'goals']) expect(money).toMatch(new RegExp(`tab === '${k}'`));
    expect(money).toMatch(/<TabPills/);
  });
  it('the Assets tab and the /assets screen are the same section', () => {
    expect(money).toMatch(/<AssetsSection/);
    expect(fs.readFileSync('app/(money)/assets.tsx', 'utf8')).toMatch(/<AssetsSection/);
  });
  it('Money no longer carries the month-end forecast', () => {
    expect(money).not.toMatch(/ForecastCard|forecastMonthEnd/);
    expect(fs.readFileSync('app/(tabs)/insights.tsx', 'utf8')).toMatch(/forecast: 'Month end'/);
  });
});

describe('B1 · every goal amount is typed in an AmountRow', () => {
  const fs = jest.requireActual('fs') as typeof import('fs');
  it.each(['app/(tabs)/savings.tsx', 'app/(money)/savings/[id].tsx'])('%s has no bare decimal-pad input', f => {
    const src = fs.readFileSync(f, 'utf8');
    expect(src).toMatch(/<AmountRow/);
    expect(src).not.toMatch(/keyboardType="decimal-pad"/);
  });
});

describe('B3 · notes read as one clean line, and a transfer keeps its note', () => {
  const { oneLine, rowText } = jest.requireActual('../lib/noteText') as typeof import('../lib/noteText');
  it('trims and collapses whitespace, empty is null', () => {
    expect(oneLine('  dinner\n  with   Aarav \n')).toBe('dinner with Aarav');
    expect(oneLine('   \n  ')).toBeNull();
    expect(oneLine(null)).toBeNull();
  });
  it('a transfer shows its sentence, then its note', () => {
    expect(rowText({ settlementTitle: 'Aarav paid you', note: ' for the\ncab ', settleLine: null, category: 'Repayment' }))
      .toEqual({ primary: 'Aarav paid you', secondary: 'for the cab' });
  });
  it('otherwise the note leads, then the category; no note means the category alone', () => {
    expect(rowText({ settlementTitle: null, note: 'Zomato', settleLine: null, category: 'Food Delivery' })).toEqual({ primary: 'Zomato', secondary: 'Food Delivery' });
    expect(rowText({ settlementTitle: null, note: '  ', settleLine: 'Moved to Gold', category: 'Investment' })).toEqual({ primary: 'Moved to Gold', secondary: null });
  });
});

describe('B2 · Edit group: the name sits in a card row by its icon, and New person comes first', () => {
  const fs = jest.requireActual('fs') as typeof import('fs');
  const src = fs.readFileSync('src/components/finance/GroupForm.tsx', 'utf8');
  it('no bordered free-standing name field', () => {
    expect(src).toMatch(/styles\.nameRow/);
    expect(src).not.toMatch(/styles\.input\b/);
  });
  it('the add-person tile precedes the people', () => {
    // GroupForm draws members with PersonPicker (`W1-18`); its + New tile renders before the people.
    expect(src).toMatch(/<PersonPicker[^>]*onNew=/);
    const picker = fs.readFileSync('src/components/finance/PersonPicker.tsx', 'utf8');
    expect(picker.indexOf('Add a new person')).toBeGreaterThan(-1);
    expect(picker.indexOf('Add a new person')).toBeLessThan(picker.indexOf('visible.map'));
  });
});

describe('B4 · the shared rows and chips give the full text on long-press', () => {
  const fs = jest.requireActual('fs') as typeof import('fs');
  it('ListRow and a width-capped Chip use fullTextOnHold', () => {
    expect(fs.readFileSync('src/components/ui/ListRow.tsx', 'utf8')).toMatch(/fullTextOnHold\(title\)/);
    expect(fs.readFileSync('src/components/ui/Chip.tsx', 'utf8')).toMatch(/fullTextOnHold\(label\)/);
  });
});

describe('C1 · the card due day is asked, stored, read by the engine and synced', () => {
  const { createTestDb, addPerson, addGroup, addMember } = jest.requireActual('./helpers/testDb') as typeof import('./helpers/testDb');
  const { setMoneyProfile, getMoneyProfile } = jest.requireActual('../db/queries/moneyProfile') as typeof import('../db/queries/moneyProfile');
  const { getFinanceSnapshot } = jest.requireActual('../db/queries/engineSnapshot') as typeof import('../db/queries/engineSnapshot');
  const { asDueDay } = jest.requireActual('../lib/cash') as typeof import('../lib/cash');
  const { accountToServer, serverToAccount } = jest.requireActual('../lib/sync/rowMap') as typeof import('../lib/sync/rowMap');

  const setup = () => {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const g = addGroup(db, 'Personal', true); addMember(db, g, me);
    return db;
  };

  it('only 1–31 is a due day', () => {
    expect([asDueDay(20), asDueDay('5'), asDueDay(0), asDueDay(45), asDueDay(''), asDueDay(null)]).toEqual([20, 5, null, null, null, null]);
  });

  it('a saved day reaches the engine, and clearing it clears the card account', async () => {
    const db = setup();
    await setMoneyProfile(db as never, { creditLimit: 5_000_000, creditUsed: 100_000, cardDueDay: 20 });
    expect((await getMoneyProfile(db as never)).cardDueDay).toBe(20);
    expect((await getFinanceSnapshot(db as never)).cash.cardDueDay).toBe(20);
    await setMoneyProfile(db as never, { cardDueDay: null });
    expect((await getMoneyProfile(db as never)).cardDueDay).toBeNull();
    expect(db.raw.prepare("SELECT due_day FROM account WHERE id = 'default:card'").get()).toEqual({ due_day: null });
  });

  it('travels on the card account, both ways (U-68)', () => {
    const ctx = { userId: 'u1' } as never;
    const out = accountToServer({ id: 'default:card', kind: 'card', due_day: 20, credit_limit: 5000000 }, ctx);
    expect(out.data).toMatchObject({ due_day: 20, credit_limit: 5000000 });
    expect(serverToAccount({ id: out.entityId, ...out.data }, ctx)).toMatchObject({ id: 'default:card', due_day: 20 });
  });
});

describe('RV · review fixes: links land on the right Money section; Clear filters clears tags', () => {
  const fs = jest.requireActual('fs') as typeof import('fs');
  it('Money honours ?tab=, and every goal-bound link asks for it', () => {
    expect(fs.readFileSync('app/(tabs)/savings.tsx', 'utf8')).toMatch(/useLocalSearchParams<\{ tab\?: string \}>/);
    expect(fs.readFileSync('app/(money)/afford.tsx', 'utf8')).toMatch(/\/savings\?tab=goals/);
    expect(fs.readFileSync('src/components/finance/home/StsSheet.tsx', 'utf8')).toMatch(/\/savings\?tab=goals/);
    expect(fs.readFileSync('app/(money)/savings/[id].tsx', 'utf8')).toMatch(/dismissTo\('\/savings\?tab=goals'\)/);
  });
  it("the group ledger's Clear filters also clears tags", () => {
    expect(fs.readFileSync('src/hooks/useTxnFilters.ts', 'utf8')).toMatch(/setPersonId\(null\); setTags\(\[\]\);/);
    expect(fs.readFileSync('src/components/finance/group/TransactionsTab.tsx', 'utf8')).toMatch(/onAction=\{filter\.clear\}/);
  });
  it('the asset list can be pulled to refresh on both screens', () => {
    expect(fs.readFileSync('app/(money)/assets.tsx', 'utf8')).toMatch(/AppRefreshControl refreshing=\{assets\.refreshing\}/);
    expect(fs.readFileSync('app/(tabs)/savings.tsx', 'utf8')).toMatch(/assetsData\.onRefresh/);
  });
});

describe('H1 · Home says where the month is heading in one line, and shows the streak', () => {
  const { forecastTile } = jest.requireActual('../lib/forecastVerdict') as typeof import('../lib/forecastVerdict');
  const fs = jest.requireActual('fs') as typeof import('fs');
  it('under budget: the projection, and what is left under the budget', () => {
    expect(forecastTile({ projected: 3_000_000, budget: 3_500_000 })).toEqual({ tone: 'good', amount: '₹30K', sub: '₹5K under budget' });
  });
  it('over budget: the projection, and by how much', () => {
    expect(forecastTile({ projected: 4_000_000, budget: 3_500_000 })).toEqual({ tone: 'over', amount: '₹40K', sub: '₹5K over budget' });
  });
  it('with no budget it is only the projection', () => {
    expect(forecastTile({ projected: 3_000_000, budget: 0 })).toEqual({ tone: 'neutral', amount: '₹30K', sub: 'at this pace' });
  });
  it('hidden amounts stay hidden', () => {
    expect(forecastTile({ projected: 4_000_000, budget: 3_500_000, mask: () => '••••' })).toEqual({ tone: 'over', amount: '••••', sub: '•••• over budget' });
  });
  it('the tile says it is a projection, and sits beside Safe to spend above the pills (U-11, U-21)', () => {
    const tiles = fs.readFileSync('src/components/finance/home/HomeTiles.tsx', 'utf8');
    expect(tiles).toMatch(/label="Month end · projected"/);
    expect(tiles).toMatch(/label="Safe to spend"/);
    const home = fs.readFileSync('app/(tabs)/index.tsx', 'utf8');
    expect(home.indexOf('<HeroCard')).toBeGreaterThan(0);
    expect(home.indexOf('<HeroCard')).toBeLessThan(home.indexOf('<HomeTiles'));  // U-30: spend first
    expect(home.indexOf('<HomeTiles')).toBeLessThan(home.indexOf('<TabPills'));
  });
  it('the streak badge sits beside the greeting on Home', () => {
    expect(fs.readFileSync('app/(tabs)/index.tsx', 'utf8')).toMatch(/eyebrowAccessory=\{<StreakBadge days=\{streak\} \/>\}/);
    // The ⚡ glyph, as a chip icon or (since `U-61`, a compact inline badge) a Feather name.
    expect(fs.readFileSync('src/components/finance/home/StreakBadge.tsx', 'utf8')).toMatch(/(icon|name)="zap"/);
  });
});

describe('XL-1 · a spreadsheet statement keeps its dates and its multi-line narrations', () => {
  const { zipSync, strToU8 } = jest.requireActual('fflate') as typeof import('fflate');
  const { readXlsx } = jest.requireActual('../lib/xlsx') as typeof import('../lib/xlsx');
  const { parseAnyWorkbook } = jest.requireActual('../lib/importDetect') as typeof import('../lib/importDetect');
  const book = (dateCell: string, styles: string) => zipSync({
    'xl/worksheets/sheet1.xml': strToU8(`<worksheet><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>Date</t></is></c><c r="B1" t="inlineStr"><is><t>Narration</t></is></c><c r="C1" t="inlineStr"><is><t>Withdrawal</t></is></c><c r="D1" t="inlineStr"><is><t>Deposit</t></is></c></row>
<row r="2">${dateCell}<c r="B2" t="inlineStr"><is><t>UPI/Swiggy
Ref 123</t></is></c><c r="C2"><v>450</v></c></row>
</sheetData></worksheet>`),
    'xl/styles.xml': strToU8(styles),
    'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="S" sheetId="1"/></sheets></workbook>'),
  });

  it('a built-in date format reads as a date, not an amount', () => {
    const rows = parseAnyWorkbook(readXlsx(book('<c r="A2" s="1"><v>46264</v></c>', '<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>'))).result.rows;
    expect(rows.map(r => [new Date(r.date).getFullYear(), new Date(r.date).getMonth(), new Date(r.date).getDate(), r.amount])).toEqual([[2026, 7, 30, 45000]]);
  });

  it('a custom dd-mmm-yy format is a date too; a plain number stays a number', () => {
    const custom = '<styleSheet><numFmts><numFmt numFmtId="170" formatCode="dd\\-mmm\\-yy"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="170"/></cellXfs></styleSheet>';
    expect(readXlsx(book('<c r="A2" s="1"><v>46264</v></c>', custom))[0].rows[1][0]).toBe('30/08/2026');
    expect(readXlsx(book('<c r="A2" s="0"><v>46264</v></c>', custom))[0].rows[1][0]).toBe('46264');
  });

  it('a line break inside a cell does not make a second, bogus row', () => {
    const r = parseAnyWorkbook(readXlsx(book('<c r="A2" s="1"><v>46264</v></c>', '<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>'))).result;
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].description).toBe('UPI/Swiggy Ref 123');
  });
});

describe('R2 · a bill paid by hand near its date counts as that occurrence, not a second one', () => {
  const { createTestDb, addPerson, addGroup, addMember, addTxn } = jest.requireActual('./helpers/testDb') as typeof import('./helpers/testDb');
  const { materializeDueOccurrences } = jest.requireActual('../db/queries/recurring') as typeof import('../db/queries/recurring');
  const { matchWindowDays, amountMatches } = jest.requireActual('../lib/recurrence') as typeof import('../lib/recurrence');
  const DAY = 86_400_000;

  it('window: at most 4 days, under half a cycle, none for daily', () => {
    expect([matchWindowDays('monthly', 1), matchWindowDays('weekly', 1), matchWindowDays('daily', 1), matchWindowDays('custom', 3), matchWindowDays(null, 1)])
      .toEqual([4, 3, 0, 1, 0]);
    expect([amountMatches(2_100_000, 2_200_000), amountMatches(1_900_000, 2_200_000), amountMatches(5, 0)]).toEqual([true, false, false]);
  });

  function setup() {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const g = addGroup(db, 'Personal', true); addMember(db, g, me);
    // Monthly rent rule that started 40 days ago → occurrences at the start and ~10 days ago.
    const start = Date.now() - 40 * DAY;
    const rule = addTxn(db, { groupId: g, kind: 'expense', date: start, category: 'Rent', recurFreq: 'monthly', payments: [{ personId: me, amount: 2_200_000 }], shares: [{ personId: me, amount: 2_200_000 }] });
    db.raw.prepare("UPDATE txn SET recur_interval = 1, recur_state = 'active', recur_mode = 'auto' WHERE id = ?").run(rule);
    return { db, me, g, rule, start };
  }
  const occurrenceOf = (start: number) => { const d = new Date(start); d.setMonth(d.getMonth() + 1); return d.getTime(); };
  const count = (db: { raw: { prepare: (s: string) => { get: () => unknown } } }) =>
    (db.raw.prepare("SELECT COUNT(*) AS n FROM txn WHERE category = 'Rent' AND recur_freq IS NULL AND is_deleted = 0").get() as { n: number }).n;

  it('rent paid 2 days early is claimed — no duplicate', async () => {
    const { db, me, g, rule, start } = setup();
    const occ = occurrenceOf(start);
    const manual = addTxn(db, { groupId: g, kind: 'expense', date: occ - 2 * DAY, category: 'Rent', payments: [{ personId: me, amount: 2_200_000 }], shares: [{ personId: me, amount: 2_200_000 }] });
    await materializeDueOccurrences(db as never);
    // The start-date occurrence + the hand-paid one, which is now the second occurrence.
    expect(count(db)).toBe(2);
    expect(db.raw.prepare('SELECT parent_recur_id FROM txn WHERE id = ?').get(manual)).toEqual({ parent_recur_id: rule });
  });

  it('a different amount, or too far away, still posts the occurrence', async () => {
    const a = setup();
    addTxn(a.db, { groupId: a.g, kind: 'expense', date: occurrenceOf(a.start) - 2 * DAY, category: 'Rent', payments: [{ personId: a.me, amount: 900_000 }], shares: [{ personId: a.me, amount: 900_000 }] });
    await materializeDueOccurrences(a.db as never);
    expect(count(a.db)).toBe(3);
    const b = setup();
    addTxn(b.db, { groupId: b.g, kind: 'expense', date: occurrenceOf(b.start) - 9 * DAY, category: 'Rent', payments: [{ personId: b.me, amount: 2_200_000 }], shares: [{ personId: b.me, amount: 2_200_000 }] });
    await materializeDueOccurrences(b.db as never);
    expect(count(b.db)).toBe(3);
  });
});

// ------------------------------------------------------------------ pass 2 (2026-09-30)

const fs = jest.requireActual('fs') as typeof import('fs');

describe('P2-1 · the Recurring switch hides every Recurring tab, not only Money\'s row', () => {
  it('gates the group and Personal tabs on flags.recurring', () => {
    for (const file of ['app/(people)/group/[id].tsx', 'app/(people)/personal.tsx']) {
      expect({ file, gated: /flags\.recurring/.test(fs.readFileSync(file, 'utf8')) }).toEqual({ file, gated: true });
    }
  });
});

describe('P2-5 · coming back to the app refreshes what it caught up on', () => {
  it('posts a rule that came due while the app was away', async () => {
    const db = await openTestDb();
    await seedGroupAndMe(db);
    await seedRule(db);
    expect(await liveOccurrences(db)).toEqual([]);
    const { runForegroundMaintenance } = jest.requireActual('../lib/maintenanceWrites') as typeof import('../lib/maintenanceWrites');
    await runForegroundMaintenance(db);
    expect((await liveOccurrences(db)).length).toBeGreaterThan(0);
  });

  it('says whether it wrote anything', async () => {
    const db = await openTestDb();
    await seedGroupAndMe(db);
    const { runForegroundMaintenance } = jest.requireActual('../lib/maintenanceWrites') as typeof import('../lib/maintenanceWrites');
    expect(await runForegroundMaintenance(db)).toBe(false);
    await seedRule(db);
    expect(await runForegroundMaintenance(db)).toBe(true);
  });

  it('runs on the root connection, and the tab layout refreshes once it is done', () => {
    // The writes stay on the root's own connection: the tab layout's shares one with sync and
    // the voice drain, and two transactions on one connection collide.
    const root = fs.readFileSync('app/_layout.tsx', 'utf8');
    const foreground = root.slice(root.indexOf("AppState.addEventListener('change'"));
    expect(foreground.slice(0, foreground.indexOf('});'))).toMatch(/startForegroundMaintenance\(dbRef\)/);
    const tabs = fs.readFileSync('app/(tabs)/_layout.tsx', 'utf8');
    expect(tabs).toMatch(/foregroundMaintenanceDone\)\.then\(wrote => \{\s*if \(wrote \|\| today !== loadedDay\.current\)[^}]*refresh\(\)/);
  });
});

/**
 * P2-6 — a confirm button whose async work can throw must say so. Six did not (archive group ×2,
 * leave group, remove a friend, remove a receipt, delete a goal) and one more left its caller waiting
 * forever (delete an asset): a failure was an unhandled rejection and a button that did nothing.
 */
describe('P2-6 · an async confirm button handles its own failure', () => {
  function sources(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
      const full = `${dir}/${e.name}`;
      if (e.isDirectory()) return e.name === '__tests__' ? [] : sources(full);
      return /\.tsx?$/.test(e.name) ? [full] : [];
    });
  }
  /**
   * The `{ … }` body of each `onPress: async () => {` in a file. A heuristic, and it says so: a
   * handler passed by name (`onPress: remove`), or a `try` that wraps only the first await, is not
   * caught here — those are for review.
   */
  function handlers(src: string): string[] {
    const out: string[] = [];
    for (const m of src.matchAll(/onPress:\s*async\s*\(\)\s*=>\s*\{/g)) {
      let depth = 0;
      let i = m.index! + m[0].length - 1;
      const start = i;
      for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) break;
      }
      out.push(src.slice(start, i + 1));
    }
    return out;
  }

  it('finds the handlers at all', () => {
    const all = [...sources('app'), ...sources('src')].flatMap(f => handlers(fs.readFileSync(f, 'utf8')));
    expect(all.length).toBeGreaterThan(10);
  });

  it('wraps each one in try, or in the hook\'s own run()', () => {
    const bare = [...sources('app'), ...sources('src')].flatMap(f =>
      handlers(fs.readFileSync(f, 'utf8'))
        .filter(body => !/\btry\s*\{|\brun\(/.test(body))
        .map(body => `${f}: ${body.slice(0, 60).replace(/\s+/g, ' ')}`));
    expect(bare).toEqual([]);
  });
});

describe('P2-7 · re-picking a setup updates the switches on screen', () => {
  it('reloads the flags after applyPersona', () => {
    const src = fs.readFileSync('app/(system)/features.tsx', 'utf8');
    expect(src).toMatch(/await applyPersona\(next, FEATURE_KEYS\);[\s\S]{0,600}await reloadFlags\(\)/);
  });
});

describe('P2-8 · Afford', () => {
  const src = fs.readFileSync('app/(money)/afford.tsx', 'utf8');
  it('does not say "Not enough data yet" twice', () => {
    expect(src).not.toMatch(/`Not enough data yet —/);
  });
  it('asks "how often" as pick-one (a row opening a list), and offers a goal only when goals are on', () => {
    expect(src).toMatch(/title="How often"[\s\S]*<OptionRow key=\{o\.key\}/);
    expect(src).toMatch(/flags\.savingsGoals && \(\s*<SecondaryButton label="Save toward it in a goal"/);
  });
});

describe('P2-9 · pick-one choices in the new-goal sheet are TabPills, like Priority beside them', () => {
  it('has no hand-rolled segment rows left', () => {
    const src = fs.readFileSync('app/(tabs)/savings.tsx', 'utf8');
    expect(src).not.toMatch(/styles\.segSm/);
    expect((src.match(/<TabPills/g) ?? []).length).toBe(4); // sections, priority, frequency, target date
  });
});

describe('P2-10 · the UPI link inspector is a dev tool', () => {
  it('opens on long-press only while DEV_TOOLS_ENABLED', () => {
    for (const file of ['src/components/finance/add/TransferBody.tsx', 'src/components/finance/ScanPaySheet.tsx']) {
      expect({ file, gated: /onLongPress=\{DEV_TOOLS_ENABLED \?/.test(fs.readFileSync(file, 'utf8')) }).toEqual({ file, gated: true });
    }
  });
});

describe('P2-11 · a person\'s trust and write-off say so when they fail, and tell every screen when they land', () => {
  it('routes all three writes through one save that catches and refreshes', () => {
    const src = fs.readFileSync('src/hooks/usePersonScreen.ts', 'utf8');
    const save = src.slice(src.indexOf('async function save('), src.indexOf('async function toggleTrusted'));
    expect(save).toMatch(/try \{[\s\S]*catch[\s\S]*refresh\(\)/);
    expect(save).not.toMatch(/reload\(\)/); // refresh() already reloads this screen
    expect((src.match(/await save\(\(\) => set(TrustState|ReceivableState|GroupTrust)\(/g) ?? []).length).toBe(3);
  });
});

describe('P2-12 · a filtered Friends list draws no divider under its last row', () => {
  it('counts the rows it draws, not every contact', () => {
    const src = fs.readFileSync('app/(people)/friends.tsx', 'utf8');
    expect(src).toMatch(/last=\{i === open\.length - 1\}/);
    expect(src).toMatch(/last=\{i === square\.length - 1\}/);
    expect(src).toMatch(/!last && styles\.rowBorder/);
  });
});

describe('P2-15 · the streak switch says what it controls', () => {
  it('names the calendar, and says the ⚡ count shows either way', () => {
    expect(fs.readFileSync('app/(system)/features.tsx', 'utf8')).toMatch(/label: 'Streak Calendar', caption: '[^']*⚡ count shows either way'/);
  });
});

describe('U-17 · the ledger filter is one search field and one row of chips, one chip per question', () => {
  const src = fs.readFileSync('src/components/ui/FilterBar.tsx', 'utf8');
  it('names each question on its chip, and a set chip clears with its ✕', () => {
    for (const q of ["'Type'", "'Date'", "'Who'", "'Tags'"]) expect(src).toContain(q);
    expect((src.match(/onRemove=\{\w+Set|onRemove=\{range|onRemove=\{person|onRemove=\{selectedTags/g) ?? []).length).toBe(4);
  });
  it('has no second row of active chips and no separate Filters button', () => {
    expect(src).not.toMatch(/<FiltersButton|activeCount > 0 &&/);
  });
  it('keeps its horizontal strip from taking the parent\'s height', () => {
    expect(src).toMatch(/strip: \{ flexGrow: 0 \}/);
  });
});

describe('U-04 · Afford answers where you are typing', () => {
  const src = fs.readFileSync('app/(money)/afford.tsx', 'utf8');
  it('puts a live verdict line straight under the amount, before the questions', () => {
    const amount = src.indexOf('accessibilityLabel="Purchase amount"');
    const live = src.indexOf('styles.liveLine');
    const questions = src.indexOf('title="How often"');
    expect(amount).toBeGreaterThan(0);
    expect(live).toBeGreaterThan(amount);
    expect(questions).toBeGreaterThan(live);
  });
  it('asks the three questions as one card of rows', () => {
    expect(src).toMatch(/<Card clip>[\s\S]*title="How often"[\s\S]*title="Category"[\s\S]*title="Can wait"[\s\S]*<\/Card>/);
  });
});

describe('U-25/U-41 · a ⌄ only on chips that pick one value from a list', () => {
  /** Category, date and pay method in Add (`U-41`); never details, filters or pills. */
  const PICKERS = new Set(['src/components/finance/CategoryField.tsx', 'src/components/finance/add/CategoryDatePills.tsx', 'src/components/finance/add/DetailChips.tsx',
    // Split by items' Paid from: the same pay-method picker as Add (`U-69`).
    'app/add/itemized.tsx',
    // The Budget tab's period: one value from three (`U-89`).
    'src/components/finance/budget/BudgetList.tsx']);
  const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? files(`${dir}/${e.name}`) : /\.tsx$/.test(e.name) ? [`${dir}/${e.name}`] : []);
  it('sets chevron on no other chip', () => {
    const bad: string[] = [];
    for (const f of [...files('app'), ...files('src/components')]) {
      if (PICKERS.has(f)) continue;
      for (const m of fs.readFileSync(f, 'utf8').matchAll(/<Chip\b[^>]*?\bchevron\b/g)) bad.push(f + ':' + m.index);
    }
    expect(bad).toEqual([]);
  });
  it('keeps the pills that dropped it without it', () => {
    for (const f of ['src/components/finance/review/ReviewRowCard.tsx', 'src/components/finance/budget/BudgetAmountRow.tsx', 'src/components/ui/FilterBar.tsx']) {
      expect({ f, arrow: /chevron-down|\bchevron\b/.test(fs.readFileSync(f, 'utf8')) }).toEqual({ f, arrow: false });
    }
  });
});

describe('U-27 · every screen header uses the one icon button', () => {
  /** Screen headers whose right slot is a labelled control, where the words carry the state. */
  const LABELLED = new Set(['app/(money)/reports.tsx', 'app/(money)/report-transactions.tsx']);
  function files(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? files(`${dir}/${e.name}`) : /\.tsx$/.test(e.name) ? [`${dir}/${e.name}`] : []);
  }
  it('hand-rolls no header icon', () => {
    const bad: string[] = [];
    for (const f of files('app')) {
      if (LABELLED.has(f)) continue;
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/right=\{/g)) {
        const block = src.slice(m.index!, m.index! + 400);
        if (/<TouchableOpacity[\s\S]{0,200}<Feather/.test(block.split('/>\n')[0] + block)) {
          if (!/HeaderIconButton/.test(block.slice(0, 200))) bad.push(f);
        }
      }
      if (/const (headerRight|importButton) = \([\s\S]{0,200}<Feather/.test(src)) bad.push(f);
    }
    expect([...new Set(bad)]).toEqual([]);
  });
});

describe('U-32 · Safe to spend names the year', () => {
  it('uses the full date on the tile and in its sheet', () => {
    expect(fs.readFileSync('src/components/finance/home/HomeTiles.tsx', 'utf8')).toMatch(/until \$\{fullDate\(sts\.untilMs\)\}/);
    expect(fs.readFileSync('src/components/finance/home/StsSheet.tsx', 'utf8')).toMatch(/const until = fullDate\(sts\.untilMs\)/);
  });
});

describe('OV-27 · a Recurring tab adds a recurring entry', () => {
  it('opens Add with Repeat on, from a group and from Personal', () => {
    expect(fs.readFileSync('app/(people)/group/[id].tsx', 'utf8')).toMatch(/<RecurringTab[\s\S]*?onAdd=\{[\s\S]{0,160}?repeat=1/);
    const personal = fs.readFileSync('app/(people)/personal.tsx', 'utf8');
    expect(personal).toMatch(/<RecurringTab[\s\S]*?onAdd=\{\(\) => addPersonal\(true\)\}/);
    expect(personal).toMatch(/repeat \? '&repeat=1' : ''/);
    expect(fs.readFileSync('src/hooks/useAddTxnForm.ts', 'utf8')).toMatch(/useState\(paramRepeat === '1'\)/);
  });
});

describe('U-30 · the two Home tiles share the row equally', () => {
  it('puts flex on a plain wrapper, not on PressableScale\'s style', () => {
    const src = fs.readFileSync('src/components/finance/home/HomeTiles.tsx', 'utf8');
    expect(src).toMatch(/<View style=\{styles\.cell\}>\s*<PressableScale/);
    expect(src).toMatch(/cell: \{ flex: 1/);
    expect(src).not.toMatch(/tile: \{\s*flex: 1/);
  });
});


describe('U-30b · flex never sits on a PressableScale style — it styles an inner view, so it cannot size the pressable', () => {
  it('finds none', () => {
    const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? files(`${dir}/${e.name}`) : /\.tsx$/.test(e.name) ? [`${dir}/${e.name}`] : []);
    const bad: string[] = [];
    for (const f of [...files('app'), ...files('src/components')]) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/<PressableScale[^>]*?style=\{\[?styles\.(\w+)/g)) {
        const st = new RegExp(`\\n\\s+${m[1]}: \\{([^}]*)\\}`).exec(src);
        if (st && /\bflex: 1\b/.test(st[1])) bad.push(`${f} styles.${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('U-42 · Review picks categories from the same tile grid as Add', () => {
  it('both render CategoryTileGrid; only the multi-select one shows checks', () => {
    const add = fs.readFileSync('src/components/finance/CategoryPicker.tsx', 'utf8');
    const review = fs.readFileSync('src/components/finance/review/CategoryFilterSheet.tsx', 'utf8');
    expect(add).toMatch(/<CategoryTileGrid/);
    expect(review).toMatch(/<CategoryTileGrid[\s\S]*?showCheck/);
    expect(add).not.toMatch(/showCheck/);
    expect(review).not.toMatch(/check-square/);
  });
});

describe('U-39 · a Home tile says it opens something', () => {
  it('carries a small arrow in its top-right', () => {
    expect(fs.readFileSync('src/components/finance/home/HomeTiles.tsx', 'utf8')).toMatch(/<Feather name="arrow-up-right"/);
  });
});

describe('U-43 · Import shows one way in at a time', () => {
  const src = fs.readFileSync('app/(ledger)/import.tsx', 'utf8');
  it('switches File / Paste with a segmented control, and the paste source is one too', () => {
    expect(src).toMatch(/<TabPills\s+tabs=\{\[\{ key: 'file'/);
    expect(src).toMatch(/<TabPills\s+tabs=\{\[\{ key: 'gpay'/);
    expect(src).not.toMatch(/styles\.sourceChip/);
  });
  it('says what it does in one line', () => {
    expect(src).toMatch(/<Text style=\{styles\.intro\}>[^<]{0,90}<\/Text>/);
  });
});

describe('U-45 · an asset movement is never tinted as income or spending', () => {
  it('the ledger row gives asset movements the settle tint', () => {
    const src = fs.readFileSync('src/components/finance/TransactionRow.tsx', 'utf8');
    expect(src).toMatch(/forceColor=\{txn\.asset_id && settle \? settle\.tint : undefined\}/);
  });
  it("the asset's own page signs from the asset's side", () => {
    expect(fs.readFileSync('app/(money)/asset/[id].tsx', 'utf8')).toMatch(/assetNames=\{assetNames\}\s+assetSide/);
  });
  it('the Assets list is a sum, with no Move button per row', () => {
    const src = fs.readFileSync('src/components/finance/plan/AssetsSection.tsx', 'utf8');
    expect(src).toMatch(/<SumLine op="=" label="Worth"/);
    expect(src).not.toMatch(/label="Move" /);
  });
});

describe('U-22/U-23 · one people control and one group control', () => {
  it('every group chooser is GroupGrid', () => {
    for (const f of ['src/components/finance/add/DestinationSheet.tsx', 'src/components/finance/review/ReviewDestSheet.tsx', 'src/components/finance/review/BulkGroupSheet.tsx']) {
      expect(fs.readFileSync(f, 'utf8')).toMatch(/<GroupGrid/);
    }
    expect(fs.existsSync('src/components/finance/review/DestOption.tsx')).toBe(false);
  });
  it('every people chooser is PersonPicker, and it is a grid, not a row list', () => {
    for (const f of ['src/components/finance/add/DestinationSheet.tsx', 'src/components/finance/review/CounterpartySheet.tsx', 'src/components/finance/CombineSameSheet.tsx', 'app/(people)/group/[id]/members.tsx']) {
      expect(fs.readFileSync(f, 'utf8')).toMatch(/<PersonPicker/);
    }
    const src = fs.readFileSync('src/components/finance/PersonPicker.tsx', 'utf8');
    expect(src).not.toMatch(/FlatList/);
    expect(src).toMatch(/width: '25%'/);
  });
});

describe('U-47 · the money editor reconciles like the card outside', () => {
  it('both draw the one MoneySum', () => {
    expect(fs.readFileSync('src/components/finance/plan/TotalMoneyCard.tsx', 'utf8')).toMatch(/<MoneySum/);
    expect(fs.readFileSync('src/components/finance/plan/MoneyEditorSheet.tsx', 'utf8')).toMatch(/<MoneySum/);
  });
  it('has no button in the middle of the editor', () => {
    expect(fs.readFileSync('src/components/finance/plan/MoneyEditorSheet.tsx', 'utf8')).not.toMatch(/SecondaryButton/);
  });
});

describe('W1-18 · member rows carry their balance, not icon buttons', () => {
  const src = fs.readFileSync('app/(people)/group/[id]/members.tsx', 'utf8');
  it('opens one actions sheet from the row', () => {
    expect(src).toMatch(/onPress=\{\(\) => setActionsFor\(item\)\}/);
    expect(src).toMatch(/title="Remove from group" danger/);
  });
  it('has no shield or pencil button on the row itself', () => {
    expect(src).not.toMatch(/<Feather\s+name=\{roleOf/);
    expect(src).not.toMatch(/name="edit-2" size=\{15\}/);
  });
});

describe('W1-06 · every pay-method icon comes from PayMethodGlyph', () => {
  it('no Feather-name map for pay methods remains', () => {
    expect(fs.readFileSync('src/constants/enums.ts', 'utf8')).not.toMatch(/PAY_METHOD_ICON/);
  });
});

describe('a section box opens and closes without tearing', () => {
  it('renders its body at once: no exit fade, no per-body layout transition', () => {
    const src = fs.readFileSync('src/components/ui/SectionCard.tsx', 'utf8');
    // `Collapse` faded a closing body in place while the cards below jumped under it, and gave
    // every other open body a layout transition of its own; a Budget tab flickered on each tap.
    expect(src).toMatch(/\{expanded && children\}/);
    expect(src).not.toMatch(/from '\.\/anim\/Collapse'|LayoutAnimation\.configureNext|\blayout=\{/);
  });
});

describe('a scrolling sheet runs to its own bottom edge', () => {
  it('keeps the bottom space inside the scroll content, not on the sheet around it', () => {
    const src = fs.readFileSync('src/components/ui/DraggableSheet.tsx', 'utf8');
    // On the sheet, the scroll area stopped short and a long list was cut by a hard line above
    // an empty band.
    expect(src).toMatch(/!scroll && \{ paddingBottom: bottomPad \}/);
    expect(src).toMatch(/contentContainerStyle=\{\[styles\.content, \{ paddingBottom: bottomPad \}\]\}/);
  });
});

describe('CP-1 · no em dash reaches the screen through an escape', () => {
  const fs = jest.requireActual('fs') as typeof import('fs');
  const path = jest.requireActual('path') as typeof import('path');
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of fs.readdirSync(dir)) {
      const full = path.join(dir, e);
      if (fs.statSync(full).isDirectory()) walk(full, out); else if (full.endsWith('.tsx')) out.push(full);
    }
    return out;
  };
  it('Help had 31 of them, written as \\u2014 where a scan for the character never looked', () => {
    const offenders = [...walk('app'), ...walk('src/components')].filter(f => fs.readFileSync(f, 'utf8').includes('\\u2014'));
    expect(offenders).toEqual([]);
  });
});
