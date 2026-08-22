import { canRemind, waNumber, reminderText, whatsappUrl } from '../lib/whatsappReminder';

describe('canRemind', () => {
  it('only ever nudges someone who owes YOU', () => {
    // Reminding someone about money you owe them is not a reminder, it is an
    // apology — and one button next to the other would eventually send one.
    expect(canRemind(5000, '919876543210')).toBe(true);
    expect(canRemind(-5000, '919876543210')).toBe(false);
    expect(canRemind(0, '919876543210')).toBe(false);
  });

  it('needs a number to send to', () => {
    expect(canRemind(5000, null)).toBe(false);
    expect(canRemind(5000, '   ')).toBe(false);
  });
});

describe('waNumber', () => {
  it('strips everything a human typed for a human', () => {
    expect(waNumber('+91 98765 43210')).toBe('919876543210');
    expect(waNumber('+91-98765-43210')).toBe('919876543210');
  });

  it('refuses a number with no country code rather than guessing one', () => {
    // Silently prepending 91 would send a stranger a message about money. Ten
    // digits is exactly the common Indian case, so this is the likely path, not
    // an edge case.
    expect(waNumber('9876543210')).toBeNull();
    expect(waNumber('')).toBeNull();
  });
});

describe('reminderText', () => {
  const base = { name: 'Rohit', amountPaise: 240000 };

  it('leads with the amount and the person', () => {
    expect(reminderText(base)).toContain('Hi Rohit');
    expect(reminderText(base)).toContain('₹2,400.00');
  });

  it('says what it is for when it can', () => {
    // "You owe me ₹2,400" invites an argument; a breakdown invites a payment.
    const s = reminderText({ ...base, groups: [
      { name: 'Goa Trip', amount: 160000 },
      { name: 'Flat', amount: 80000 },
    ] });
    expect(s).toContain('Goa Trip ₹1,600.00');
    expect(s).toContain('Flat ₹800.00');
  });

  it('skips a group that owes nothing', () => {
    const s = reminderText({ ...base, groups: [{ name: 'Settled', amount: 0 }] });
    expect(s).not.toContain('Settled');
  });

  it('offers a pay link when there is one, and says nothing when there is not', () => {
    expect(reminderText({ ...base, payLink: 'upi://pay?pa=me@bank' })).toContain('upi://pay?pa=me@bank');
    expect(reminderText(base)).not.toContain('upi://');
  });
});

describe('whatsappUrl', () => {
  it('encodes the message so a newline or an ampersand cannot break the link', () => {
    const url = whatsappUrl('+919876543210', 'a & b\nc')!;
    expect(url.startsWith('https://wa.me/919876543210?text=')).toBe(true);
    expect(url).not.toContain('\n');
    expect(url).toContain('%26');
  });

  it('returns null when the number is unusable, so the caller can fall back', () => {
    // Not an error — a share sheet still works, and losing the reminder over a
    // missing country code would be worse than letting the user pick the app.
    expect(whatsappUrl('9876543210', 'hi')).toBeNull();
  });

  /** It is a message, never a collect request — NPCI banned P2P collect outright. */
  it('never builds anything that could pull money', () => {
    const url = whatsappUrl('+919876543210', reminderText({
      name: 'R', amountPaise: 100, payLink: 'upi://pay?pa=me@bank&am=1',
    }))!;
    expect(url).not.toContain('upi://collect');
    expect(decodeURIComponent(url)).toContain('upi://pay');
  });
});
