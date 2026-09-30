import { normalizeItems } from '../../../server/receipt-ocr-proxy/normalize';
import { computeItemSubtotal } from '../lib/itemized';
import { parseToPaise } from '../lib/money';

/**
 * The receipt proxy (`server/receipt-ocr-proxy`) sent the printed LINE TOTAL as `unitPrice`, and
 * the app multiplies it by qty: a ₹1,280 bill (4 naan, 2 paneer, 1 dal, 3 chai) read as ₹2,880.
 * This is what Gemini actually returned for that receipt, now read as a line total.
 */
const GEMINI = [
  { name: 'Butter Naan', qty: '4', amount: '240.00' },
  { name: 'Paneer Tikka', qty: '2', amount: '640.00' },
  { name: 'Dal Makhani', qty: '1', amount: '280.00' },
  { name: 'Masala Chai', qty: '3', amount: '120.00' },
];

const billOf = (items: ReturnType<typeof normalizeItems>) =>
  items.reduce((s, i) => s + computeItemSubtotal({ ...i, id: 'x', assignedTo: [] } as never), 0);

describe('receipt proxy: a printed amount is the line total', () => {
  it('adds up to the receipt, not qty times the line total', () => {
    const items = normalizeItems(GEMINI);
    expect(items[0]).toEqual({ name: 'Butter Naan', qty: '4', unitPrice: '60.00' });
    expect(billOf(items)).toBe(parseToPaise('1280'));
  });

  it('keeps an uneven line whole, quantity in the name, so the bill still adds to the paisa', () => {
    expect(normalizeItems([{ name: 'Samosa', qty: '3', amount: '100' }]))
      .toEqual([{ name: 'Samosa ×3', qty: '1', unitPrice: '100.00' }]);
  });

  it('reads a missing or odd quantity as 1, strips ₹ and commas, drops empty and zero lines', () => {
    expect(normalizeItems([
      { name: 'Thali', qty: '', amount: '₹1,250.50' },
      { name: '', qty: '1', amount: '10' },
      { name: 'Free water', qty: '1', amount: '0' },
      { name: 'Bad', qty: '1', amount: 'n/a' },
    ])).toEqual([{ name: 'Thali', qty: '1', unitPrice: '1250.50' }]);
    expect(normalizeItems('not an array')).toEqual([]);
  });
});
