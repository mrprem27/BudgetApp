import { splitPhone, joinPhone } from '../lib/phone';

describe('splitPhone', () => {
  it('defaults to +91 for nothing, and for a number saved without a code', () => {
    expect(splitPhone(null)).toEqual({ code: '91', local: '' });
    expect(splitPhone('98765 43210')).toEqual({ code: '91', local: '98765 43210' });
  });
  it('reads a stored code', () => {
    expect(splitPhone('+91 98765 43210')).toEqual({ code: '91', local: '98765 43210' });
    expect(splitPhone('+44 7700 900123')).toEqual({ code: '44', local: '7700 900123' });
    expect(splitPhone('+919876543210')).toEqual({ code: '91', local: '9876543210' });
  });
  it('keeps a + number it cannot split whole, with no code', () => {
    expect(splitPhone('+447700900123')).toEqual({ code: '', local: '+447700900123' });
  });
});

describe('joinPhone', () => {
  it('stores the code with the number, dropping a trunk 0', () => {
    expect(joinPhone({ code: '91', local: '098765 43210' })).toBe('+91 98765 43210');
  });
  it('stores nothing when there is no number, whatever the code', () => {
    expect(joinPhone({ code: '91', local: '  ' })).toBe('');
  });
  it('round-trips', () => {
    for (const s of ['+91 98765 43210', '+44 7700 900123', '+447700900123']) {
      expect(joinPhone(splitPhone(s))).toBe(s);
    }
  });
});

describe('no doubled code', () => {
  it('a pasted +91 number keeps one code', () => {
    expect(joinPhone({ code: '91', local: '+91 98765 43210' })).toBe('+91 98765 43210');
  });
  it('a legacy number saved with 91 but no + reads its code', () => {
    expect(splitPhone('919876543210')).toEqual({ code: '91', local: '9876543210' });
    expect(joinPhone(splitPhone('919876543210'))).toBe('+91 9876543210');
  });
});
