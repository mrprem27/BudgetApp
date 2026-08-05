import { buildUpiUri, isValidVpa, parseUpiQr, parseAnyUpiQr, UpiApp, UPI_APPS } from '../lib/upiIntent';

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

describe('parseUpiQr — reading a friend’s UPI QR', () => {
  it('extracts the handle and name from a standard P2P QR', () => {
    expect(parseUpiQr('upi://pay?pa=asha@okhdfcbank&pn=Asha%20Rao&cu=INR'))
      .toEqual({ vpa: 'asha@okhdfcbank', name: 'Asha Rao' });
  });

  it('returns just the handle when the QR carries no name', () => {
    expect(parseUpiQr('upi://pay?pa=asha@okicici')).toEqual({ vpa: 'asha@okicici' });
  });

  it('accepts a bare VPA, which some apps encode instead of a URI', () => {
    expect(parseUpiQr('asha@okaxis')).toEqual({ vpa: 'asha@okaxis' });
  });

  it('tolerates whitespace around the decoded payload', () => {
    expect(parseUpiQr('  upi://pay?pa=asha@okhdfcbank  ')).toEqual({ vpa: 'asha@okhdfcbank' });
  });

  it('reads any app’s scheme, since the parameters are identical', () => {
    expect(parseUpiQr('phonepe://pay?pa=asha@ybl&pn=Asha')).toEqual({ vpa: 'asha@ybl', name: 'Asha' });
  });

  it('ignores an amount baked into the QR', () => {
    // We are capturing a person, not accepting their payment request — carrying `am`
    // through would silently pre-fill a settle-up with someone else's figure.
    expect(parseUpiQr('upi://pay?pa=asha@okhdfcbank&pn=Asha&am=500.00'))
      .toEqual({ vpa: 'asha@okhdfcbank', name: 'Asha' });
  });

  it('rejects a QR whose handle is not a VPA', () => {
    expect(parseUpiQr('upi://pay?pa=not-a-vpa&pn=X')).toBeNull();
    expect(parseUpiQr('upi://pay?pn=Asha')).toBeNull();
  });

  it('rejects anything that is not a UPI code at all', () => {
    // A wrong payee is the one error that must not happen when money follows.
    for (const junk of ['', '   ', 'https://example.com', 'WIFI:S:home;P:pw;;', '1234567890']) {
      expect(parseUpiQr(junk)).toBeNull();
    }
  });

  it('rejects an EMV/BharatQR merchant code rather than half-reading it', () => {
    expect(parseUpiQr('00020101021226580011in.gov.upi0119asha@okhdfcbank5204')).toBeNull();
  });

  it('round-trips with buildUpiUri', () => {
    const uri = buildUpiUri({ vpa: 'asha@okhdfcbank', name: 'Asha Rao', amountPaise: 12345 })!;
    expect(parseUpiQr(uri)).toEqual({ vpa: 'asha@okhdfcbank', name: 'Asha Rao' });
  });
});

describe('parseAnyUpiQr — routing person vs merchant', () => {
  const tlv = (t: string, v: string) => `${t}${String(v.length).padStart(2, '0')}${v}`;
  const shopQr = (vpa = 'chaistop@okhdfcbank', name = 'Chai Stop', amount?: string) =>
    tlv('00', '01') +
    tlv('26', tlv('00', 'in.gov.upi') + tlv('01', vpa)) +
    tlv('53', '356') + (amount ? tlv('54', amount) : '') + tlv('59', name);

  it('reads a person code as a person', () => {
    expect(parseAnyUpiQr('upi://pay?pa=asha@okhdfcbank&pn=Asha'))
      .toEqual({ vpa: 'asha@okhdfcbank', name: 'Asha', kind: 'person' });
  });

  it('reads a shop code as a merchant, with its fixed amount', () => {
    expect(parseAnyUpiQr(shopQr('chaistop@okhdfcbank', 'Chai Stop', '45.50')))
      .toEqual({ vpa: 'chaistop@okhdfcbank', name: 'Chai Stop', amountPaise: 4550, kind: 'merchant' });
  });

  it('leaves the amount open when the shop code fixes none', () => {
    expect(parseAnyUpiQr(shopQr())?.amountPaise).toBeUndefined();
  });

  it('still returns null for a code that is neither', () => {
    expect(parseAnyUpiQr('https://example.com')).toBeNull();
  });

  it('does NOT change what parseUpiQr accepts', () => {
    // Adding a friend must keep rejecting shop codes — you cannot settle up with a
    // shop, and storing its VPA on a contact would be wrong.
    const shop = shopQr();
    expect(parseUpiQr(shop)).toBeNull();
    expect(parseAnyUpiQr(shop)).not.toBeNull();
  });
});
