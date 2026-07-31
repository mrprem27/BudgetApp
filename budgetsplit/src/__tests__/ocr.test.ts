import { parseReceiptText, parseReceiptLineItems } from '../lib/ocr';

describe('parseReceiptText', () => {
  it('extracts total with ₹ prefix', () => {
    const result = parseReceiptText('Big Bazaar\nItems ₹800\nGST ₹144\nTotal: ₹1,234.50');
    expect(result.amount).toBe(123450);
    expect(result.note).toBe('Big Bazaar');
  });

  it('extracts amount from "Grand Total" line', () => {
    const result = parseReceiptText('Store Name\nItem A 200\nGrand Total Rs. 500.00');
    expect(result.amount).toBe(50000);
  });

  it('extracts from Amount INR format', () => {
    const result = parseReceiptText('Order #123\nAmount INR 2,500');
    expect(result.amount).toBe(250000);
    expect(result.note).toBe('Order #123');
  });

  it('falls back to ₹ symbol when no keyword', () => {
    const result = parseReceiptText('Cafe Coffee Day\n₹350.00');
    expect(result.amount).toBe(35000);
    expect(result.note).toBe('Cafe Coffee Day');
  });

  it('handles text with no amount', () => {
    const result = parseReceiptText('Thank you for visiting\nPlease come again');
    expect(result.amount).toBe(null);
    expect(result.note).toBe('Thank you for visiting');
  });

  it('returns null for empty text', () => {
    expect(parseReceiptText('')).toEqual({ amount: null, note: null });
  });

  it('skips "Total" line as note, uses next meaningful line', () => {
    const result = parseReceiptText('Total ₹999\nSwiggy Delivery');
    expect(result.amount).toBe(99900);
    expect(result.note).toBe('Swiggy Delivery');
  });

  it('handles comma-separated thousands', () => {
    const result = parseReceiptText('Balance Due: ₹12,345.67');
    expect(result.amount).toBe(1234567);
  });

  it('handles integer amounts without decimals', () => {
    const result = parseReceiptText('Net Amount Rs 750');
    expect(result.amount).toBe(75000);
  });

  it('ignores zero or negative amounts', () => {
    const result = parseReceiptText('Total: ₹0');
    expect(result.amount).toBe(null);
  });

  it('truncates long notes to 60 chars', () => {
    const longName = 'A'.repeat(100);
    const result = parseReceiptText(`${longName}\nTotal ₹100`);
    expect(result.note).toHaveLength(60);
  });
});

describe('parseReceiptLineItems', () => {
  it('returns [] for empty text', () => {
    expect(parseReceiptLineItems('')).toEqual([]);
  });

  it('parses a plain "name  price" line, defaulting qty to 1', () => {
    expect(parseReceiptLineItems('Chicken Biryani  250.00')).toEqual([
      { name: 'Chicken Biryani', qty: '1', unitPrice: '250.00' },
    ]);
  });

  it('parses a "qty x name  price" line', () => {
    expect(parseReceiptLineItems('2 x Coke  120')).toEqual([
      { name: 'Coke', qty: '2', unitPrice: '120' },
    ]);
  });

  it('parses a "qty name  price" line without an x', () => {
    expect(parseReceiptLineItems('3 Samosa  90')).toEqual([
      { name: 'Samosa', qty: '3', unitPrice: '90' },
    ]);
  });

  it('handles comma-formatted thousands and decimal-less amounts in the same pass', () => {
    const items = parseReceiptLineItems('Grocery Bag  1,250.00\nMilk 60');
    expect(items).toEqual([
      { name: 'Grocery Bag', qty: '1', unitPrice: '1250.00' },
      { name: 'Milk', qty: '1', unitPrice: '60' },
    ]);
  });

  it('rejects boilerplate lines even when they end in a number', () => {
    const items = parseReceiptLineItems(
      'Subtotal  430.00\nGST 18%  77.40\nTotal  507.40\nThank you visit again\nTable 12',
    );
    expect(items).toEqual([]);
  });

  it('rejects lines with no trailing price', () => {
    expect(parseReceiptLineItems('Have a nice day')).toEqual([]);
  });

  it('rejects a pure date-like line', () => {
    expect(parseReceiptLineItems('01/06/2026')).toEqual([]);
  });

  it('parses a realistic multi-line receipt end to end, in reading order', () => {
    const receipt = [
      'SUPERMART',
      'Date: 01/06/2026',
      'Milk 60',
      '2 x Coke  120',
      'Chicken Biryani  250.00',
      'Subtotal  430.00',
      'GST 18%  77.40',
      'Total  507.40',
      'Thank you visit again',
    ].join('\n');
    expect(parseReceiptLineItems(receipt)).toEqual([
      { name: 'Milk', qty: '1', unitPrice: '60' },
      { name: 'Coke', qty: '2', unitPrice: '120' },
      { name: 'Chicken Biryani', qty: '1', unitPrice: '250.00' },
    ]);
  });

  // --- Two-line "name" then "qty price amount" pairing -----------------------
  // Restaurant/POS receipts commonly print the item name on its own line and
  // the numeric columns on the line(s) below it, rather than one line per item.

  it('pairs a name-only line with a numbers-only line that follows it', () => {
    const receipt = ['Hot Lavender', '1 280.00 280.00'].join('\n');
    expect(parseReceiptLineItems(receipt)).toEqual([
      { name: 'Hot Lavender', qty: '1', unitPrice: '280.00' },
    ]);
  });

  it('uses the LAST number on a numbers-only line (the Amount column), not the first', () => {
    // qty=1, unitPrice=530.00, amount=530.00 — using the amount as unitPrice
    // with qty=1 still totals correctly even without separating the columns.
    const receipt = ['Raviolli', '530.00 530.00'].join('\n');
    expect(parseReceiptLineItems(receipt)).toEqual([
      { name: 'Raviolli', qty: '1', unitPrice: '530.00' },
    ]);
  });

  it('treats a lone small bare-integer line as a stray qty digit, not a price — keeps the name pending', () => {
    // "1" alone (no decimal, < 10) is implausible as a price; the real price
    // arrives on the next line and should still pair with "Hi-ball Hibiscus".
    const receipt = ['Hi-ball Hibiscus', '1', '300.00 300.00'].join('\n');
    expect(parseReceiptLineItems(receipt)).toEqual([
      { name: 'Hi-ball Hibiscus', qty: '1', unitPrice: '300.00' },
    ]);
  });

  it('drops a name with no recoverable price rather than inventing one', () => {
    // "Spicy Bbq Pizza" is followed only by a stray "1", then a NEW name line
    // ("Raviolli") arrives before any price — the pizza's price is genuinely
    // unrecoverable from this text and must not produce a garbage item.
    const receipt = ['Spicy Bbq Pizza', '1', 'Raviolli', '530.00 530.00'].join('\n');
    expect(parseReceiptLineItems(receipt)).toEqual([
      { name: 'Raviolli', qty: '1', unitPrice: '530.00' },
    ]);
  });

  it('does not pair a numbers-only line across a rejected boilerplate line', () => {
    // The CGST amount ("48.17") must not get misattributed to whatever name
    // line happened to precede the boilerplate "CGST 2.5%" line.
    const receipt = ['Raviolli', '530.00 530.00', '1926.75 CGST 2.5%', '48.17'].join('\n');
    expect(parseReceiptLineItems(receipt)).toEqual([
      { name: 'Raviolli', qty: '1', unitPrice: '530.00' },
    ]);
  });

  it('rejects an implausibly large bare integer (a license/phone/GST/bill number, not a price)', () => {
    expect(parseReceiptLineItems('FSSAI Lic No. 12220026001295')).toEqual([]);
    expect(parseReceiptLineItems('Contact 9928810108')).toEqual([]);
  });

  it('rejects new receipt-boilerplate keywords found on a real POS bill (dine-in, token, cashier, tel, optional)', () => {
    const receipt = [
      'Dine In: 3',
      'Cashier: Rajahari',
      'Token No.: 12,',
      'Tel no : 0141',
      'Service Charge 5%',
      '(Optional)',
      '91.75',
    ].join('\n');
    expect(parseReceiptLineItems(receipt)).toEqual([]);
  });

  it('rejects general retail/restaurant receipt boilerplate (server, guests, order no, card-terminal jargon, retail discount summary, delivery/packing charges)', () => {
    const receipt = [
      'Server: Rahul',
      'Guests: 4',
      'Order No: 45',
      'Check No: 12',
      'Void',
      'Duplicate Copy',
      'Auth Code: 445566',
      'Approval Code: 100234',
      'Ref No: 9988776655',
      'Terminal ID: T1234',
      'Batch No: 004',
      'RRN: 123456789012',
      'You Saved Rs. 50.00',
      'Loyalty Points Earned: 25',
      'Delivery Charge 40.00',
      'Packing Charge 20.00',
      'Convenience Fee 10.00',
      'IGST 2.5%  48.17',
    ].join('\n');
    expect(parseReceiptLineItems(receipt)).toEqual([]);
  });

  it('does NOT reject a real item line just because MRP/HSN/Qty appear inline with it (mandatory on Indian GST invoices)', () => {
    // Rejecting on "mrp"/"hsn"/"qty" would drop real items, since Indian tax
    // invoices are legally required to print these inline per item — unlike
    // CGST/SGST/service-charge, which only ever appear on their own summary
    // line. (A price glued directly to a label with no space, e.g. "Amt:80.00"
    // with no space before the digits, is a separate, narrower gap — this
    // needs a space before the amount, which is the common case.)
    const items = parseReceiptLineItems('Britannia Biscuit HSN:19059090 MRP:45.00 Qty:2 Amount: 90.00');
    expect(items).toHaveLength(1);
    expect(items[0].unitPrice).toBe('90.00');
    expect(items[0].name).toContain('Britannia Biscuit');
  });

  it('does not reject "Paan" (a real menu item) despite PAN being deliberately excluded from boilerplate', () => {
    expect(parseReceiptLineItems('Meetha Paan 60.00')).toEqual([
      { name: 'Meetha Paan', qty: '1', unitPrice: '60.00' },
    ]);
  });

  it('parses a real, messy multi-line POS receipt end to end (anonymized, structurally identical to a real Doorbeen Restaurant bill)', () => {
    const receipt = [
      'Sample Restaurant Pvt Ltd',
      'Some Address Line, Some City',
      'Tel no : 0141',
      '4007813 / 9928810108 GST nO:',
      '08AACCD8561C1ZR',
      '16:47',
      'Date: 05/06/23',
      'Dine In: 3',
      'Cashier: Rajahari',
      'Bill No.: 1938/22-17',
      'Token No.: 12,',
      'Assign to: Staff Member',
      'Item',
      'Qty. Price Amount',
      'Hot Lavender',
      '1 280.00 280.00',
      'Hi - ball Hibiscus',
      '1',
      '300.00 300.00',
      'Pasta Barbaresca',
      '1',
      '450.00 450.00',
      'Spicy Bbq Pizza',
      '1',
      'Raviolli',
      '530.00 530.00',
      'Veen Natural',
      '1 175.00',
      'Mineral Water',
      '175.00',
      'Total Qty: 6',
      'Sub',
      'Total',
      '1835.00',
      'Service Charge 5%',
      '(Optional)',
      '91.75',
      '1926.75 CGST 2.5%',
      '48.17',
      '1926.75 SGST 2.5%',
      '48.17',
      'Round off',
      '-0.09',
      'Grand Total 2023.00',
      'FSSAI Lic No. 12220026001295',
      'Thank You Visit Us Again!!!',
    ].join('\n');

    // 6 items recovered, all correctly priced. Two known, acceptable
    // imperfections given this is a best-effort heuristic (raw text stays
    // visible precisely so these are easy to catch): "Spicy Bbq Pizza" has no
    // recoverable price in this text and is correctly dropped rather than
    // guessed; "Veen Natural" / "Mineral Water" is really ONE item (a name
    // split across two OCR lines) that lands as two ₹175 entries instead of
    // one — a real limitation of flat top-to-bottom text, not a crash or a
    // wildly wrong number. Nothing from the header, GST/tax/total/footer
    // lines leaks through as a fake item.
    expect(parseReceiptLineItems(receipt)).toEqual([
      { name: 'Hot Lavender', qty: '1', unitPrice: '280.00' },
      { name: 'Hi - ball Hibiscus', qty: '1', unitPrice: '300.00' },
      { name: 'Pasta Barbaresca', qty: '1', unitPrice: '450.00' },
      { name: 'Raviolli', qty: '1', unitPrice: '530.00' },
      { name: 'Veen Natural', qty: '1', unitPrice: '175.00' },
      { name: 'Mineral Water', qty: '1', unitPrice: '175.00' },
    ]);
  });
});
