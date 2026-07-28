import {
  isPaytmWorkbook, parsePaytmWorkbook,
  isPaytmCsv, parsePaytmCsv,
  isPaytmStatement, parsePaytmStatement,
} from '../lib/paytmParse';
import type { Sheet } from '../lib/xlsx';

/**
 * Fixtures mirror the real Paytm export's shapes (column set, tag spelling,
 * amount formatting, PDF fragment order) with the counterparties renamed.
 */

const HEADER = [
  'Date', 'Time', 'Transaction Details', 'Other Transaction Details (UPI ID or A/c No)',
  'Your Account', 'Amount', 'UPI Ref No.', 'Order ID', 'Remarks', 'Tags', 'Comment',
];

const row = (
  date: string, time: string, details: string, other: string,
  account: string, amount: string, ref = '', remarks = '', tag = '',
) => [date, time, details, other, account, amount, ref, '', remarks, tag, ''];

const historySheet = (rows: string[][]): Sheet => ({
  name: 'Passbook Payment History',
  rows: [HEADER, ...rows],
});

const summarySheet: Sheet = {
  name: 'Summary',
  rows: [
    ['ACCOUNT HOLDER'],
    ['Paytm Statement for :', "10 JUN'26 - 24 JUL'26"],
    ['Money Paid (Amount in Rs.)', '-1,000.00'],
  ],
};

describe('Paytm workbook (.xlsx)', () => {
  const sheets = [summarySheet, historySheet([
    row('24/07/2026', '20:33:55', 'Money sent to A Friend', '99990@ibl on PhonePe', 'ICICI Bank - 21', '-68.00', '311049826294', '', '#💵 Money Transfer'),
    row('23/07/2026', '19:52:59', 'Paid to Corner Store', 'q391947193@ybl on PhonePe', 'State Bank Of India - 43', '-75.50', '620438986166', '', '#🛒 Groceries'),
    row('19/07/2026', '18:23:22', 'Paid to Some Diner', 'diner@ptybl on Paytm', 'ICICI Bank Rupay Credit Card - 00', '-1,456.00', '', '', '#🥘 Food'),
    row('17/07/2026', '02:57:42', 'Received from A Relative', '8299337536@ptyes on Paytm', 'State Bank Of India - 43', '+20,000.00', '310552661826', '', '#💵 Money Received'),
    row('12/06/2026', '22:50:25', 'Transferred to Self, State Bank Of India - 9943', '77349@ptyes on Paytm', 'ICICI Bank - 21', '3,000.00', '208324336976', '', '#💵 Self Transfer'),
    row('10/07/2026', '21:46:01', 'Automatic payment for Apple Media Services', 'appleservices.bdsi@hdfcbank', 'ICICI Bank - 21', '-99.00', '103648228580', '', '#🏦 Services'),
  ])];

  it('detects a Paytm workbook', () => {
    expect(isPaytmWorkbook(sheets)).toBe(true);
    expect(isPaytmWorkbook([summarySheet])).toBe(false);
  });

  it('parses the history sheet, not the summary sheet', () => {
    const { rows, skipped } = parsePaytmWorkbook(sheets);
    expect(rows).toHaveLength(6);
    expect(skipped).toBe(0);
  });

  it('reads amount, date and time exactly', () => {
    const r = parsePaytmWorkbook(sheets).rows[1];
    expect(r.amount).toBe(7550);
    expect(new Date(r.date).getFullYear()).toBe(2026);
    expect(new Date(r.date).getMonth()).toBe(6); // July
    expect(new Date(r.date).getDate()).toBe(23);
    expect(new Date(r.date).getHours()).toBe(19);
    expect(new Date(r.date).getMinutes()).toBe(52);
  });

  it('strips the "Paid to" / "Money sent to" prefix from the description', () => {
    const rows = parsePaytmWorkbook(sheets).rows;
    expect(rows[0].description).toBe('A Friend');
    expect(rows[1].description).toBe('Corner Store');
    expect(rows[5].description).toBe('Apple Media Services');
  });

  it('collapses whitespace runs so a payee reads the same in every export', () => {
    // The Excel export keeps a double space that the PDF text layer drops; both
    // must produce one payee, or Review treats them as two merchants.
    const spaced = historySheet([
      row('15/07/2026', '11:18:08', 'Received from Dr.  PRIYANKA   YADAV', '702@idfcfirst', 'State Bank Of India - 43', '+7,000.00'),
    ]);
    expect(parsePaytmWorkbook([spaced]).rows[0].description).toBe('Dr. PRIYANKA YADAV');
  });

  it('maps Paytm tags onto app categories', () => {
    const rows = parsePaytmWorkbook(sheets).rows;
    expect(rows[1].category).toBe('Groceries');
    expect(rows[2].category).toBe('Eating Out');
    expect(rows[5].category).toBe('Other'); // "# Services" is a vague Paytm bucket
  });

  it('treats Money Transfer / Received / Self Transfer as transfers, not spend', () => {
    const rows = parsePaytmWorkbook(sheets).rows;
    expect(rows[0]).toMatchObject({ kind: 'settlement', category: 'Repayment', direction: 'debit' });
    expect(rows[3]).toMatchObject({ kind: 'settlement', category: 'Repayment', direction: 'credit' });
    expect(rows[4]).toMatchObject({ kind: 'settlement', category: 'Repayment' });
  });

  it('classifies merchant rows as expense with the right direction', () => {
    const rows = parsePaytmWorkbook(sheets).rows;
    expect(rows[1]).toMatchObject({ kind: 'expense', direction: 'debit' });
  });

  it('detects the pay method from the funding account and the wording', () => {
    const rows = parsePaytmWorkbook(sheets).rows;
    expect(rows[1].payMethod).toBe('upi');   // bank account
    expect(rows[2].payMethod).toBe('card');  // Rupay Credit Card
    expect(rows[5].payMethod).toBe('autopay'); // "Automatic payment for …"
  });

  it('keeps the UPI ref and tag in raw for the Review inbox', () => {
    const r = parsePaytmWorkbook(sheets).rows[1];
    expect(r.raw).toContain('UPI Ref No: 620438986166');
    expect(r.raw).toContain('Groceries');
  });

  it('locates columns by header name, not position', () => {
    const reordered: Sheet = {
      name: 'Passbook Payment History',
      rows: [
        ['Amount', 'Tags', 'Date', 'Transaction Details', 'Time'],
        ['-250.00', '#⛽️ Fuel', '01/07/2026', 'Paid to A Petrol Pump', '08:00:00'],
      ],
    };
    const r = parsePaytmWorkbook([reordered]).rows[0];
    expect(r).toMatchObject({ amount: 25000, category: 'Fuel', description: 'A Petrol Pump' });
  });

  it('skips footer and spacer rows instead of inventing transactions', () => {
    const withJunk = historySheet([
      row('24/07/2026', '20:33:55', 'Paid to Corner Store', '', 'ICICI Bank - 21', '-68.00'),
      [], ['', '', '', '', '', ''],
      ['Notes:', '', 'Self transfer payments are not included', '', '', ''],
    ]);
    const { rows, skipped } = parsePaytmWorkbook([withJunk]);
    expect(rows).toHaveLength(1);
    expect(skipped).toBe(3);
  });

  it('never throws on an empty or malformed sheet', () => {
    expect(parsePaytmWorkbook([])).toEqual({ rows: [], skipped: 0 });
    expect(parsePaytmWorkbook([{ name: 'X', rows: [] }])).toEqual({ rows: [], skipped: 0 });
  });
});

describe('Paytm CSV', () => {
  const csv = [
    HEADER.join(','),
    '24/07/2026,20:33:55,Money sent to A Friend,99990@ibl on PhonePe,ICICI Bank - 21,-68.00,311049826294,,,#💵 Money Transfer,',
    '23/07/2026,19:52:59,"Paid to Corner Store, Andheri",q391947193@ybl,State Bank Of India - 43,"-1,075.50",620438986166,,,#🛒 Groceries,',
  ].join('\n');

  it('detects and parses a Paytm CSV', () => {
    expect(isPaytmCsv(csv)).toBe(true);
    const { rows } = parsePaytmCsv(csv);
    expect(rows).toHaveLength(2);
  });

  it('honours quoted fields containing commas', () => {
    const r = parsePaytmCsv(csv).rows[1];
    expect(r.description).toBe('Corner Store, Andheri');
    expect(r.amount).toBe(107550);
  });

  it('does not claim unrelated CSVs', () => {
    expect(isPaytmCsv('Date,Group,Category,Kind,Amount,Note\n2026-06-01,X,Food,expense,100,hi')).toBe(false);
    expect(isPaytmCsv('')).toBe(false);
  });
});

describe('Paytm PDF text', () => {
  // pdf.js flattens the table: fragments arrive in reading order with no
  // reliable line breaks, and row dates carry no year.
  const PDF = `Page  of  1 17 For any queries, Contact Us ACCOUNT HOLDER
    Paytm Statement for 10 JUN'26 - 24 JUL'26 Total Money Paid - Rs.117,682.19 103 Payments made
    Total Money Received + Rs.71,000 6 Payments received
    Passbook Payments History Date &  Time Transaction Details Notes & Tags Your Account Amount
    24 Jul 8:33 PM Money sent to A Friend UPI ID:  99990@ibl   on UPI Ref No: 311049826294   Tag: # Money Transfer ICICI Bank -  21 - Rs.68
    23 Jul 7:52 PM Paid to Corner Store UPI ID:  q391947193@ybl   on UPI Ref No: 620438986166   Tag: # Groceries State Bank Of India - 43 - Rs.75.50
    19 Jul 6:23 PM Paid to Some Diner UPI ID:  diner@ptybl   on UPI Ref No: 210000000001   Tag: # Food ICICI Bank  Rupay Credit  Card - 00 - Rs.1,456
    17 Jul 2:57 AM Received from A Relative UPI ID:  8299337536@ptyes   on UPI Ref No: 310552661826   Tag: # Money Received State Bank Of India - 43 + Rs.20,000
    12 Jun 10:50 PM Transferred to Self, State Bank Of India  - 9943 UPI ID:  77349@ptyes   on UPI Ref No: 208324336976   Tag: # Self Transfer ICICI Bank -  21 Rs.3,000
    11 Jun 9:25 PM Automatic payment of ₹99 setup for  Apple Media Services UPI ID:  appleservices.bdsi@hdfcbank UPI Ref No: 103467318478   Tag: # Services ICICI Bank -  21 - Rs.99`;

  const NOW = new Date(2026, 6, 25).getTime();

  it('detects a Paytm statement', () => {
    expect(isPaytmStatement(PDF)).toBe(true);
    expect(isPaytmStatement('Google Pay transaction statement\nUPI Transaction ID: 1')).toBe(false);
  });

  it('finds every transaction and no page furniture', () => {
    const { rows } = parsePaytmStatement(PDF, NOW);
    expect(rows).toHaveLength(6);
    expect(rows.map(r => r.amount)).toEqual([6800, 7550, 145600, 2000000, 300000, 9900]);
  });

  it('never reads the header summary totals as a transaction', () => {
    const amounts = parsePaytmStatement(PDF, NOW).rows.map(r => r.amount);
    expect(amounts).not.toContain(11768219);
    expect(amounts).not.toContain(7100000);
  });

  it('resolves the missing year from the statement period', () => {
    const rows = parsePaytmStatement(PDF, NOW).rows;
    expect(new Date(rows[0].date).getFullYear()).toBe(2026);
    expect(new Date(rows[0].date).getMonth()).toBe(6);  // 24 Jul
    expect(new Date(rows[4].date).getMonth()).toBe(5);  // 12 Jun
  });

  it('resolves years across a year boundary', () => {
    const spanning = PDF
      .replace("10 JUN'26 - 24 JUL'26", "10 DEC'25 - 24 JAN'26")
      .replace('24 Jul 8:33 PM', '24 Jan 8:33 PM')
      .replace('12 Jun 10:50 PM', '12 Dec 10:50 PM');
    const rows = parsePaytmStatement(spanning, NOW).rows;
    expect(new Date(rows[0].date).getFullYear()).toBe(2026); // 24 Jan
    expect(new Date(rows[4].date).getFullYear()).toBe(2025); // 12 Dec
  });

  it('reads the time of day', () => {
    const d = new Date(parsePaytmStatement(PDF, NOW).rows[0].date);
    expect(d.getHours()).toBe(20);
    expect(d.getMinutes()).toBe(33);
  });

  it('agrees with the workbook on kind, category and pay method', () => {
    const rows = parsePaytmStatement(PDF, NOW).rows;
    expect(rows[0]).toMatchObject({ description: 'A Friend', kind: 'settlement', category: 'Repayment', direction: 'debit' });
    expect(rows[1]).toMatchObject({ description: 'Corner Store', kind: 'expense', category: 'Groceries', payMethod: 'upi' });
    expect(rows[2]).toMatchObject({ description: 'Some Diner', kind: 'expense', category: 'Eating Out', payMethod: 'card' });
    expect(rows[3]).toMatchObject({ description: 'A Relative', kind: 'settlement', direction: 'credit' });
    expect(rows[5]).toMatchObject({ description: 'Apple Media Services', payMethod: 'autopay', category: 'Other' });
  });

  it('reads an unsigned amount (self transfer) without dropping the row', () => {
    const r = parsePaytmStatement(PDF, NOW).rows[4];
    expect(r).toMatchObject({ amount: 300000, kind: 'settlement', direction: 'unknown' });
  });

  it('does not let a tag absorb the account text that follows it', () => {
    // "Tag: # Groceries State Bank Of India - 43" must still resolve to Groceries.
    expect(parsePaytmStatement(PDF, NOW).rows[1].category).toBe('Groceries');
  });

  it('falls back to a non-future year with no period header', () => {
    const noPeriod = PDF.replace("10 JUN'26 - 24 JUL'26", '');
    const rows = parsePaytmStatement(noPeriod, NOW).rows;
    expect(rows.every(r => r.date <= NOW + 24 * 3600 * 1000)).toBe(true);
  });

  it('never throws on empty or junk text', () => {
    expect(parsePaytmStatement('', NOW)).toEqual({ rows: [], skipped: 0 });
    expect(parsePaytmStatement('nothing to see here', NOW).rows).toEqual([]);
  });
});
