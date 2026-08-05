import { buildUpiUri, isValidVpa } from '../lib/upiIntent';

describe('isValidVpa', () => {
  it('accepts ordinary handles', () => {
    expect(isValidVpa('prem@okhdfcbank')).toBe(true);
    expect(isValidVpa('9876543210@ybl')).toBe(true);
    expect(isValidVpa('a.b-c_d@upi')).toBe(true);
  });

  it('rejects anything that is not handle@bank', () => {
    for (const bad of ['', 'prem', 'prem@', '@ybl', 'prem@@ybl', 'prem ybl', 'prem@y bl']) {
      expect(isValidVpa(bad)).toBe(false);
    }
  });
});

describe('buildUpiUri', () => {
  it('builds a payable URI with rupees at the boundary', () => {
    // 12345678 paise = ₹1,23,456.78 — the only place money stops being paise.
    const uri = buildUpiUri({ vpa: 'prem@ybl', name: 'Prem', amountPaise: 12345678 });
    expect(uri).toBe('upi://pay?pa=prem%40ybl&pn=Prem&am=123456.78&cu=INR');
  });

  it('always emits two decimals', () => {
    expect(buildUpiUri({ vpa: 'a@ybl', name: 'A', amountPaise: 100 })).toContain('am=1.00');
    expect(buildUpiUri({ vpa: 'a@ybl', name: 'A', amountPaise: 50 })).toContain('am=0.50');
    expect(buildUpiUri({ vpa: 'a@ybl', name: 'A', amountPaise: 1 })).toContain('am=0.01');
  });

  it('encodes the note and the name', () => {
    const uri = buildUpiUri({ vpa: 'a@ybl', name: 'Aarav K', amountPaise: 500, note: 'Goa trip & food' })!;
    expect(uri).toContain('pn=Aarav%20K');
    expect(uri).toContain('tn=Goa%20trip%20%26%20food');
  });

  it('omits the note when blank', () => {
    expect(buildUpiUri({ vpa: 'a@ybl', name: 'A', amountPaise: 500, note: '   ' })).not.toContain('tn=');
  });

  it('refuses to build rather than emit a broken URI', () => {
    expect(buildUpiUri({ vpa: 'nope', name: 'A', amountPaise: 500 })).toBeNull();
    expect(buildUpiUri({ vpa: 'a@ybl', name: 'A', amountPaise: 0 })).toBeNull();
    expect(buildUpiUri({ vpa: 'a@ybl', name: 'A', amountPaise: -100 })).toBeNull();
    expect(buildUpiUri({ vpa: 'a@ybl', name: 'A', amountPaise: NaN })).toBeNull();
  });

  it('falls back to a placeholder name rather than an empty pn', () => {
    expect(buildUpiUri({ vpa: 'a@ybl', name: '  ', amountPaise: 500 })).toContain('pn=Payee');
  });
});
