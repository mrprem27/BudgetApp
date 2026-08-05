import { buildUpiUri, isValidVpa, UpiApp, UPI_APPS } from '../lib/upiIntent';

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

describe('per-app URIs', () => {
  const req = { vpa: 'friend@okhdfcbank', name: 'Asha', amountPaise: 125050, note: 'Dinner' };

  it('defaults to the NPCI-standard scheme', () => {
    expect(buildUpiUri(req)).toMatch(/^upi:\/\/pay\?/);
    expect(buildUpiUri(req, UpiApp.Generic)).toBe(buildUpiUri(req));
  });

  it('swaps only the scheme and path, never the parameters', () => {
    const generic = buildUpiUri(req)!;
    for (const app of UPI_APPS) {
      const uri = buildUpiUri(req, app.key)!;
      expect(uri.startsWith(app.prefix + '?')).toBe(true);
      expect(uri.split('?')[1]).toBe(generic.split('?')[1]);
    }
  });

  it('rejects a bad request the same way for every app', () => {
    for (const app of UPI_APPS) {
      expect(buildUpiUri({ ...req, vpa: 'nope' }, app.key)).toBeNull();
      expect(buildUpiUri({ ...req, amountPaise: 0 }, app.key)).toBeNull();
    }
  });

  it('gives every app a distinct scheme and a probe that matches it', () => {
    const prefixes = UPI_APPS.map(a => a.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    for (const a of UPI_APPS) expect(a.prefix.startsWith(a.probe)).toBe(true);
  });

  it('keeps the amount in rupees with two decimals across apps', () => {
    // 125050 paise = ₹1250.50 — the paise/rupee boundary lives in this one function.
    for (const app of UPI_APPS) expect(buildUpiUri(req, app.key)).toContain('am=1250.50');
  });
});
