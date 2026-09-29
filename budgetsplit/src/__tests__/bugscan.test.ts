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
    expect(src).toMatch(/router\.push\('\/import'\)[\s\S]{0,120}Import more data/);
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
  it('Reports and export are on Insights, not in Settings', () => {
    expect(fs.readFileSync('app/(tabs)/insights.tsx', 'utf8')).toMatch(/Export all data/);
    const settings = fs.readFileSync('app/(system)/settings/index.tsx', 'utf8');
    expect(settings).not.toMatch(/Reports & export|Export all data/);
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
    for (const f of ['app/(ledger)/search.tsx', 'app/(people)/personal.tsx', 'src/components/finance/group/TransactionsTab.tsx']) {
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
  it('Review and the shared bar use the one FiltersButton', () => {
    expect(fs.readFileSync('app/(ledger)/review.tsx', 'utf8')).toMatch(/<FiltersButton/);
    expect(fs.readFileSync('src/components/ui/FilterBar.tsx', 'utf8')).toMatch(/<FiltersButton/);
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
    expect(fs.readFileSync('app/(tabs)/insights.tsx', 'utf8')).toMatch(/Month-end forecast/);
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
    expect(src.indexOf('Add a new friend')).toBeLessThan(src.indexOf('allPersons.map'));
  });
});

describe('B4 · the shared rows and chips give the full text on long-press', () => {
  const fs = jest.requireActual('fs') as typeof import('fs');
  it('ListRow and a width-capped Chip use fullTextOnHold', () => {
    expect(fs.readFileSync('src/components/ui/ListRow.tsx', 'utf8')).toMatch(/fullTextOnHold\(title\)/);
    expect(fs.readFileSync('src/components/ui/Chip.tsx', 'utf8')).toMatch(/fullTextOnHold\(label\)/);
  });
});
