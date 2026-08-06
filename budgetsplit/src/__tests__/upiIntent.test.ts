import { buildUpiUri, isValidVpa, parseUpiQr, parseAnyUpiQr, newUpiRef, UpiApp, UPI_APPS, GENERIC_UPI_APP } from '../lib/upiIntent';

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
    expect(uri).toBe('upi://pay?pa=prem%40ybl&pn=Prem&am=123456.78&cu=INR&mode=04');
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

  it('omits pn rather than inventing a payee name', () => {
    // NPCI requires UPI apps to display the payee's bank-registered name, resolved from
    // the VPA — a name we supply is not shown, so a placeholder is a fabricated name
    // attached to a real payment and buys nothing. This used to send `pn=Payee`.
    expect(buildUpiUri({ vpa: 'a@ybl', name: '  ', amountPaise: 500 })).not.toContain('pn=');
    expect(buildUpiUri({ vpa: 'a@ybl', amountPaise: 500 })).not.toContain('pn=');
  });

  it('sends pn when the name is real', () => {
    expect(buildUpiUri({ vpa: 'a@ybl', name: 'Asha Rao', amountPaise: 500 })).toContain('pn=Asha%20Rao');
  });

  it('always sends am, because withholding it helped nothing', () => {
    // There was an `omitAmount` option here that left `am` off so the payer typed the amount
    // in their own app — the last lever with a mechanism behind it, since it was the only
    // one that moved *who supplied the amount*. PhonePe, Paytm and Amazon Pay each gave the
    // identical error they gave with the amount pre-filled. Removed, and pinned so it is not
    // quietly reintroduced as a fix.
    expect(buildUpiUri({ vpa: 'a@ybl', amountPaise: 500 })).toContain('am=5.00');
    expect(buildUpiUri({ vpa: 'a@ybl', amountPaise: 500 }, UpiApp.Cred)).toContain('am=5.00');
  });
});

describe('per-app URIs', () => {
  const req = { vpa: 'friend@okhdfcbank', name: 'Asha', amountPaise: 125050, note: 'Dinner' };

  it('defaults to the NPCI-standard scheme', () => {
    expect(buildUpiUri(req)).toMatch(/^upi:\/\/pay\?/);
    expect(buildUpiUri(req, UpiApp.Generic)).toBe(buildUpiUri(req));
  });

  it('always sends the payee, amount and currency, whatever the app', () => {
    // The optional fields now vary per app — see UpiPayloadQuirks — but the ones that
    // decide where the money goes never do.
    for (const app of UPI_APPS) {
      const uri = buildUpiUri(req, app.key)!;
      expect(uri.startsWith(app.prefix + '?')).toBe(true);
      expect(uri).toContain('pa=friend%40okhdfcbank');
      expect(uri).toContain('am=1250.50');
      expect(uri).toContain('cu=INR');
    }
  });

  it('varies only the optional fields between apps', () => {
    // CRED failed once `mode` arrived; Airtel paid with it. Both cannot be served by one
    // payload, so this asserts the difference exists rather than pretending it doesn't.
    const cred = buildUpiUri(req, UpiApp.Cred)!;
    const airtel = buildUpiUri({ ...req, ref: 'BSX' }, UpiApp.Airtel)!;
    expect(cred).not.toContain('mode=');
    expect(airtel).toContain('mode=');
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
    // `mode` is not read back onto the object — we always emit our own. See buildUpiUri.
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
      .toEqual({ vpa: 'asha@okhdfcbank', name: 'Asha', kind: 'person', canHandoff: true });
  });

  it('reads a shop code as a merchant, with its fixed amount', () => {
    expect(parseAnyUpiQr(shopQr('chaistop@okhdfcbank', 'Chai Stop', '45.50')))
      .toEqual({ vpa: 'chaistop@okhdfcbank', name: 'Chai Stop', amountPaise: 4550, kind: 'merchant', canHandoff: true });
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

describe('a scanned code is re-emitted, not rebuilt', () => {
  const tlv = (t: string, v: string) => `${t}${String(v.length).padStart(2, '0')}${v}`;

  // Rebuilding a bare pa/pn/am/cu URI strips the fields that tell the PSP this is the
  // request the payee actually published — signature, mode, originator, category. The
  // result is indistinguishable from a regenerated QR, which is what a risk decline is
  // for. Observed on device as "payment failed — UPI risk policy" after PIN entry.
  it('keeps the extra parameters a person QR carried', () => {
    const scanned = parseUpiQr('upi://pay?pa=asha@okhdfcbank&pn=Asha&sign=ABC123&mode=01&orgid=159761');
    expect(scanned?.params).toEqual({ sign: 'ABC123', orgid: '159761' });
  });

  it('drops the code’s own mode instead of forwarding it', () => {
    // A UPI QR routinely says `mode=01` ("QR Code"). Passing that on told the receiving
    // app the payment came from a QR *it* scanned — so PhonePe applied its gallery-image
    // rules and refused ₹2 against a ₹2,000 cap. `mode` describes how the transaction
    // reached the receiving app, and what reaches it is an intent.
    const scanned = parseUpiQr('upi://pay?pa=asha@okhdfcbank&pn=Asha&mode=01')!;
    expect(scanned.params?.mode).toBeUndefined();
    expect(buildUpiUri({ ...scanned, amountPaise: 200 })).toContain('mode=04');
    expect(buildUpiUri({ ...scanned, amountPaise: 200 })).not.toContain('mode=01');
  });

  it('does not re-carry the fields we set ourselves', () => {
    const scanned = parseUpiQr('upi://pay?pa=asha@okhdfcbank&pn=Asha&am=10.00&cu=INR&tn=lunch&mode=01');
    // `am` especially: the user's amount must win over whatever the code suggested.
    expect(scanned?.params).toBeUndefined();
  });

  it('omits params entirely when the code carried nothing extra', () => {
    expect(parseUpiQr('upi://pay?pa=asha@okhdfcbank&pn=Asha')).toEqual({ vpa: 'asha@okhdfcbank', name: 'Asha' });
  });

  it('puts them back on the outgoing URI', () => {
    const uri = buildUpiUri({
      vpa: 'asha@okhdfcbank', name: 'Asha', amountPaise: 4500,
      passthrough: { sign: 'ABC123', orgid: '159761' }, mode: '01',
    });
    expect(uri).toContain('sign=ABC123');
    expect(uri).toContain('orgid=159761');
    expect(uri).toContain('mode=01');
  });

  it('emits exactly one mode, never the scanned one twice', () => {
    // `mode` travels via its own field rather than passthrough. Were it in both, the
    // URI would carry two — and a passthrough copy must not override the real one.
    const uri = buildUpiUri({
      vpa: 'asha@okhdfcbank', name: 'Asha', amountPaise: 4500,
      passthrough: { mode: '99' }, mode: '01',
    })!;
    expect(uri.match(/[?&]mode=/g)).toHaveLength(1);
    expect(uri).toContain('mode=01');
    expect(uri).not.toContain('mode=99');
  });

  it('cannot be used to redirect the money', () => {
    // The passthrough comes off a scanned code, so it is not trusted to name the payee,
    // the amount or the currency — those are appended before it and must win.
    const uri = buildUpiUri({
      vpa: 'asha@okhdfcbank', name: 'Asha', amountPaise: 4500,
      passthrough: { pa: 'attacker@evil', am: '99999.00', cu: 'USD' },
    });
    expect(uri).toContain('pa=asha%40okhdfcbank');
    expect(uri).toContain('am=45.00');
    expect(uri).not.toContain('attacker');
    expect(uri).not.toContain('99999');
    expect(uri).not.toContain('USD');
  });

  it('adds no note of its own — the payee never wrote one', () => {
    expect(buildUpiUri({ vpa: 'asha@okhdfcbank', name: 'Asha', amountPaise: 4500 })).not.toContain('tn=');
  });

  it('forwards a shop code’s merchant category as mc', () => {
    const shop =
      tlv('00', '01') +
      tlv('26', tlv('00', 'in.gov.upi') + tlv('01', 'chaistop@okhdfcbank')) +
      tlv('52', '5814') + tlv('53', '356') + tlv('59', 'Chai Stop');
    expect(parseAnyUpiQr(shop)?.params).toEqual({ mc: '5814' });
  });

  it('drops a merchant category that is not four digits rather than forwarding a guess', () => {
    const shop =
      tlv('00', '01') +
      tlv('26', tlv('00', 'in.gov.upi') + tlv('01', 'chaistop@okhdfcbank')) +
      tlv('52', '58') + tlv('53', '356') + tlv('59', 'Chai Stop');
    expect(parseAnyUpiQr(shop)?.params).toBeUndefined();
  });
});

describe('the app list stays internally consistent', () => {
  it('gives every UpiApp member a usable prefix', () => {
    // PREFIX is derived from UPI_APPS, so an enum member nobody added to the list has
    // no prefix — and buildUpiUri would otherwise emit "undefined?pa=…".
    for (const key of Object.values(UpiApp)) {
      expect(buildUpiUri({ vpa: 'asha@okhdfcbank', name: 'Asha', amountPaise: 100 }, key)).not.toBeNull();
    }
  });

  it('keeps every app key unique', () => {
    const keys = UPI_APPS.map(a => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('points each app at its own scheme', () => {
    for (const a of UPI_APPS) expect(a.prefix.startsWith(a.probe)).toBe(true);
  });
});

describe('a code we cannot re-emit honestly is recorded, not paid', () => {
  const tlv = (t: string, v: string) => `${t}${String(v.length).padStart(2, '0')}${v}`;
  const shop = (upiTemplate: string) =>
    tlv('00', '01') + tlv('26', upiTemplate) + tlv('53', '356') + tlv('59', 'Chai Stop');
  const minimal = tlv('00', 'in.gov.upi') + tlv('01', 'chaistop@okhdfcbank');

  it('hands off a plain shop code', () => {
    expect(parseAnyUpiQr(shop(minimal))?.canHandoff).toBe(true);
  });

  it('refuses to hand off a code carrying anything we do not decode', () => {
    // UPI 2.0 signs merchant QRs and PSPs verify `sign`. We cannot forward a signature
    // we never decoded — and adding an amount would invalidate it even if we could,
    // because it is computed over the other parameters. Declining after the user has
    // entered their PIN is the worst way to discover that.
    expect(parseAnyUpiQr(shop(minimal + tlv('05', 'SIGNATUREBLOB')))?.canHandoff).toBe(false);
  });

  it('still reads the payee and amount off a code it will not hand off', () => {
    // The scan is not wasted: this is what makes record-only worth offering at all.
    const signed = parseAnyUpiQr(
      tlv('00', '01') +
      tlv('26', minimal + tlv('05', 'SIG')) +
      tlv('53', '356') + tlv('54', '45.50') + tlv('59', 'Chai Stop'),
    );
    expect(signed).toMatchObject({ vpa: 'chaistop@okhdfcbank', name: 'Chai Stop', amountPaise: 4550, canHandoff: false });
  });

  it('always hands off a person code — those are unsigned', () => {
    expect(parseAnyUpiQr('upi://pay?pa=asha@okhdfcbank&pn=Asha')?.canHandoff).toBe(true);
    expect(parseAnyUpiQr('upi://pay?pa=asha@okhdfcbank&pn=Asha&sign=X&mode=01')?.canHandoff).toBe(true);
  });
});

describe('UPI app schemes match their published values', () => {
  const spec = (k: UpiApp) => UPI_APPS.find(a => a.key === k);

  // `cred://` is a real CRED scheme, so the row appeared and the app launched — but
  // CRED's UPI entry point is `credpay://`, so our parameters went nowhere and it
  // opened blank. A wrong scheme hides a row; a wrong path wastes the user's trip.
  it('uses credpay for CRED, not cred', () => {
    expect(spec(UpiApp.Cred)?.probe).toBe('credpay://');
    expect(spec(UpiApp.Cred)?.prefix).toBe('credpay://upi/pay');
  });

  it('uses whatsapp-consumer for WhatsApp', () => {
    expect(spec(UpiApp.WhatsApp)?.probe).toBe('whatsapp-consumer://');
  });

  it('uses navipay for Navi and myairtel for Airtel', () => {
    expect(spec(UpiApp.Navi)?.probe).toBe('navipay://');
    expect(spec(UpiApp.Airtel)?.probe).toBe('myairtel://');
  });

  it('carries no app absent from every maintained UPI-intent list', () => {
    // These were invented outright rather than mis-sourced — they are not UPI intent
    // targets at all, so no path would have made them work.
    const invented = ['slice://', 'groww://', 'jupiter://', 'imobileapp://', 'payzapp://', 'axispay://'];
    for (const p of invented) expect(UPI_APPS.some(a => a.probe === p)).toBe(false);
  });
});

describe('tr and mode — the fields whose absence PSPs punished', () => {
  const req = { vpa: 'asha@okhdfcbank', name: 'Asha', amountPaise: 200 };

  // PhonePe refused a ₹2 payment citing a ₹2,000 gallery-QR cap. That message is a
  // generic parse/typing failure, not a limit — the documented causes being a missing
  // unique `tr` and an improperly flagged transaction type.
  it('declares itself an intent by default', () => {
    expect(buildUpiUri(req)).toContain('mode=04');
  });

  it('lets a scanned code declare its own origin instead', () => {
    // A merchant QR calling itself `01` is describing where it really came from.
    expect(buildUpiUri({ ...req, mode: '01' })).toContain('mode=01');
  });

  it('carries the reference when one is supplied and the payment warrants it', () => {
    expect(buildUpiUri({ ...req, kind: 'merchant', ref: 'BSABC123' })).toContain('tr=BSABC123');
  });

  it('omits tr rather than sending an empty one', () => {
    expect(buildUpiUri({ ...req, kind: 'merchant', ref: '   ' })).not.toContain('tr=');
    expect(buildUpiUri({ ...req, kind: 'merchant' })).not.toContain('tr=');
  });

  it('keeps ours ahead of anything the scanned code carried', () => {
    // Order is the whole defence: a hostile QR must not be able to displace the payee.
    const uri = buildUpiUri({ ...req, kind: 'merchant', ref: 'BSX', passthrough: { pa: 'attacker@evil' } })!;
    expect(uri.indexOf('pa=asha')).toBeLessThan(uri.indexOf('tr=BSX'));
    expect(uri).not.toContain('attacker');
  });
});

describe('newUpiRef', () => {
  it('is alphanumeric and within the 35-character spec limit', () => {
    const ref = newUpiRef();
    expect(ref).toMatch(/^[A-Z0-9]+$/);
    expect(ref.length).toBeLessThanOrEqual(35);
  });

  it('never repeats — a reused reference reads as a duplicate transaction', () => {
    const refs = new Set(Array.from({ length: 500 }, () => newUpiRef()));
    expect(refs.size).toBe(500);
  });

  it('survives a round trip through the URI unchanged', () => {
    const ref = newUpiRef();
    expect(buildUpiUri({ vpa: 'a@ybl', name: 'A', amountPaise: 100, kind: 'merchant', ref })).toContain(`tr=${ref}`);
  });
});

describe('deep-link paths follow the shape that worked on device', () => {
  it('routes apps through upi/pay unless the vendor documents otherwise', () => {
    // credpay://upi/pay completed a real payment, so that is the default shape. Paytm is
    // the documented exception — its own docs give a bare `pay`.
    for (const a of UPI_APPS) {
      if (a.key === UpiApp.Paytm) continue;
      expect(a.prefix.endsWith('://upi/pay')).toBe(true);
    }
    expect(UPI_APPS.find(a => a.key === UpiApp.Paytm)?.prefix).toBe('paytmmp://pay');
  });

  it('pins the one path proven end to end', () => {
    expect(UPI_APPS.find(a => a.key === UpiApp.Cred)?.prefix).toBe('credpay://upi/pay');
  });

  it('leaves the generic link alone — it populated correctly as-is', () => {
    expect(buildUpiUri({ vpa: 'a@ybl', name: 'A', amountPaise: 100 })).toMatch(/^upi:\/\/pay\?/);
  });
});

describe('the payload matches the kind of payment it actually is', () => {
  const person = { vpa: 'asha@okhdfcbank', name: 'Asha', amountPaise: 200, kind: 'person' as const };

  // `tr` is documented mandatory for *merchant* payments. On a P2P transfer it makes the
  // intent merchant-shaped while still carrying no `mc` and no `sign` — a malformed
  // merchant payment rather than a well-formed personal one. Confirmed on device: CRED
  // paid on `pa/pn/am/cu` and failed once `tr`+`mode` were added, path unchanged.
  it('sends no tr on a person-to-person transfer', () => {
    expect(buildUpiUri(person)).not.toContain('tr=');
  });

  it('sends tr on a merchant payment, where it belongs', () => {
    expect(buildUpiUri({ ...person, kind: 'merchant', ref: 'BSX1' })).toContain('tr=BSX1');
  });

  it('declares the initiation mode either way', () => {
    // `mode` describes how the payment was started, which is true of both kinds, and it
    // carries no merchant implication — so it is the half of the fix that stays.
    expect(buildUpiUri(person)).toContain('mode=04');
    expect(buildUpiUri({ ...person, kind: 'merchant' })).toContain('mode=04');
  });

  it('pins the exact person-to-person URI', () => {
    // The payload CRED paid with, plus `mode` — which is the one field still under
    // suspicion, since CRED broke when `tr` and `mode` arrived together. If CRED still
    // fails, drop `mode` here next and this line is where to do it.
    expect(buildUpiUri(person)).toBe('upi://pay?pa=asha%40okhdfcbank&pn=Asha&am=2.00&cu=INR&mode=04');
  });
});

describe('per-app payload quirks', () => {
  const req = { vpa: 'asha@okhdfcbank', name: 'Asha', amountPaise: 200, kind: 'person' as const, ref: 'BSREF1' };

  // CRED and Airtel moved in *opposite* directions across the same payload change, which
  // is why one payload for all of them is not achievable: CRED paid on a bare
  // pa/pn/am/cu and failed once mode+tr arrived, Airtel paid with both present.
  it('gives CRED exactly the payload it paid with', () => {
    const uri = buildUpiUri(req, UpiApp.Cred)!;
    expect(uri).toBe('credpay://upi/pay?pa=asha%40okhdfcbank&pn=Asha&am=2.00&cu=INR');
  });

  it('gives Airtel the payload it paid with, tr included on a personal transfer', () => {
    const uri = buildUpiUri(req, UpiApp.Airtel)!;
    expect(uri).toContain('mode=04');
    expect(uri).toContain('tr=BSREF1');
  });

  it('leaves an app without quirks on the default payload', () => {
    const uri = buildUpiUri(req, UpiApp.PhonePe)!;
    expect(uri).toContain('mode=04');
    expect(uri).not.toContain('tr='); // person-to-person
  });

  it('still sends tr to a quirk-free app on a merchant payment', () => {
    expect(buildUpiUri({ ...req, kind: 'merchant' }, UpiApp.PhonePe)).toContain('tr=BSREF1');
  });

  it('covers every UpiApp member, so no app silently loses its prefix', () => {
    for (const key of Object.values(UpiApp)) {
      expect(buildUpiUri({ vpa: 'a@ybl', name: 'A', amountPaise: 100 }, key)).not.toBeNull();
    }
  });
});

describe('provenance is recorded, not assumed', () => {
  // This field exists because the distinction kept collapsing in review: an inference
  // was written up as a finding more than once. A type is harder to contradict than a
  // comment.
  it('marks as device-proven only what a device actually did', () => {
    // `device` means the *path* was observed working — the app opened on our URI with the
    // payee and amount populated. It does **not** mean the payment completes. Amazon Pay
    // and WhatsApp both belong here and both still fail: Amazon Pay resolves the handle,
    // green-ticks the banking name and is then declined by its own PSP after submission;
    // WhatsApp cannot verify the handle even through the generic `upi://pay` spec URI.
    // Keeping them at `unverified` would have implied our link was still suspect, which
    // the device evidence contradicts. Where a working path and a working payment diverge
    // is recorded per row above and in docs/FEATURES_AND_FLOWS.md.
    const proven = [...UPI_APPS, GENERIC_UPI_APP].filter(a => a.provenance === 'device').map(a => a.key);
    expect(proven.sort()).toEqual(
      [UpiApp.Airtel, UpiApp.AmazonPay, UpiApp.Cred, UpiApp.Generic, UpiApp.WhatsApp].sort(),
    );
  });

  it('gives every app a provenance', () => {
    for (const a of [...UPI_APPS, GENERIC_UPI_APP]) {
      expect(['device', 'documented', 'unverified']).toContain(a.provenance);
    }
  });

  it('blocks every app that refused after all four levers were pulled', () => {
    // `blocked` claims retrying cannot work, so the bar is every payload lever pulled with
    // an identical failure each time: path, `mode`, `tr`, `pn`, and finally withholding
    // `am` so the payer typed the amount in the app itself.
    //
    // This list previously required vendor documentation and so held only PhonePe and
    // Paytm. That bar was wrong. Amazon Pay and WhatsApp publish nothing and fail just as
    // consistently — Amazon Pay declines after submission on a URI it demonstrably parsed
    // and validated; WhatsApp fails to verify the payee even through the generic `upi://pay`
    // spec URI. Requiring a citation would have meant offering two apps we know refuse
    // every payment, which serves the documentation rather than the user.
    const blocked = UPI_APPS.filter(a => a.blocked).map(a => a.key);
    expect(blocked.sort()).toEqual(
      [UpiApp.AmazonPay, UpiApp.Paytm, UpiApp.PhonePe, UpiApp.WhatsApp].sort(),
    );
    for (const a of UPI_APPS) {
      if (!a.blocked) continue;
      // Blocking an app nobody has run would be a guess with real consequences — it hides
      // that app from the picker. Every one of these has been watched failing.
      expect(a.provenance).not.toBe('unverified');
      // Shown to the user verbatim, so it has to read as a sentence and name the app.
      expect(a.blocked).toMatch(/^[A-Z].*\.$/);
      expect(a.blocked).toContain(a.label);
    }
  });

  it('leaves at least one way to hand off a payment', () => {
    // Blocking is subtraction from the picker, and subtraction can reach zero. If a change
    // ever blocks everything, Scan & Pay silently becomes record-only — worth failing here
    // rather than discovering it on a device.
    expect(UPI_APPS.filter(a => !a.blocked).length).toBeGreaterThan(0);
    expect(GENERIC_UPI_APP.blocked).toBeUndefined();
  });

  it('never marks a payload quirk on an app nobody has run', () => {
    // A quirk is a claim about observed behaviour. Inventing one would be the same
    // mistake as the guessed deep-link paths, with less to show for it.
    //
    // `unverified` is the precise test, not `device`: provenance records whether the
    // path *worked*, and an app can be thoroughly observed while still failing —
    // PhonePe was watched resolving the payee's name from the handle and ignoring ours,
    // which justifies dropping `pn` for it even though it has never completed a payment.
    // What must never carry a quirk is an app nobody has opened at all.
    for (const a of UPI_APPS) {
      if (a.payload) expect(a.provenance).not.toBe('unverified');
    }
  });
});
