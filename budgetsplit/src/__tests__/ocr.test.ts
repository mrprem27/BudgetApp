import { parseReceiptText } from '../lib/ocr';

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
