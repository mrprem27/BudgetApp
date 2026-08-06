import { parseMerchantQr } from '../lib/emvQr';

/** Build a `TTLLVALUE` triplet with a correct 2-digit length header. */
const tlv = (tag: string, value: string) => `${tag}${String(value.length).padStart(2, '0')}${value}`;

/** A UPI merchant-account template (tag 26) wrapping the GUID + VPA. */
const upiTemplate = (vpa: string) => tlv('26', tlv('00', 'in.gov.upi') + tlv('01', vpa));

function merchantQr(parts: { vpa?: string; name?: string; city?: string; amount?: string; currency?: string } = {}) {
  const { vpa = 'chaistop@okhdfcbank', name, city, amount, currency = '356' } = parts;
  return (
    tlv('00', '01') +
    tlv('01', '11') +
    (vpa ? upiTemplate(vpa) : '') +
    tlv('53', currency) +
    (amount ? tlv('54', amount) : '') +
    tlv('58', 'IN') +
    (name ? tlv('59', name) : '') +
    (city ? tlv('60', city) : '')
  );
}

describe('parseMerchantQr — the happy path', () => {
  it('pulls the VPA out of the UPI account template', () => {
    expect(parseMerchantQr(merchantQr())).toEqual({ vpa: 'chaistop@okhdfcbank', reproducible: true });
  });

  it('carries merchant name and city through', () => {
    expect(parseMerchantQr(merchantQr({ name: 'Chai Stop', city: 'Mumbai' })))
      .toEqual({ vpa: 'chaistop@okhdfcbank', name: 'Chai Stop', city: 'Mumbai', reproducible: true });
  });

  it('reads a fixed amount as paise, not rupees', () => {
    // Tag 54 is decimal rupees; everything internal is integer paise.
    expect(parseMerchantQr(merchantQr({ amount: '100.00' }))?.amountPaise).toBe(10000);
    expect(parseMerchantQr(merchantQr({ amount: '1' }))?.amountPaise).toBe(100);
    expect(parseMerchantQr(merchantQr({ amount: '12.35' }))?.amountPaise).toBe(1235);
  });

  it('leaves the amount unset on an open-amount code, the common case', () => {
    expect(parseMerchantQr(merchantQr())).not.toHaveProperty('amountPaise');
  });

  it('finds the UPI template wherever it sits in the 26–51 range', () => {
    const at = (tag: string) =>
      tlv('00', '01') + tlv(tag, tlv('00', 'in.gov.upi') + tlv('01', 'x@ybl')) + tlv('53', '356');
    for (const tag of ['26', '27', '38', '51']) {
      expect(parseMerchantQr(at(tag))?.vpa).toBe('x@ybl');
    }
  });
});

describe('parseMerchantQr — fails closed', () => {
  it('rejects a length header that runs past the end', () => {
    // Truncated scan. A partial read here is a wrong payee.
    const good = merchantQr();
    expect(parseMerchantQr(good.slice(0, good.length - 5))).toBeNull();
  });

  it('rejects a trailing fragment too short to be a header', () => {
    expect(parseMerchantQr(merchantQr() + '5')).toBeNull();
  });

  it('rejects a non-numeric tag', () => {
    expect(parseMerchantQr('0002' + '01' + 'XX02ab')).toBeNull();
  });

  it('rejects a code with no UPI template at all', () => {
    // A card-network-only BharatQR: valid EMV, just not payable over UPI.
    const cardOnly = tlv('00', '01') + tlv('26', tlv('00', 'com.visa') + tlv('01', '1234')) + tlv('53', '356');
    expect(parseMerchantQr(cardOnly)).toBeNull();
  });

  it('rejects a template whose VPA is not a VPA', () => {
    expect(parseMerchantQr(merchantQr({ vpa: 'not-a-vpa' }))).toBeNull();
  });

  it('refuses a non-INR code rather than paying an unknown amount', () => {
    expect(parseMerchantQr(merchantQr({ currency: '840' }))).toBeNull();
  });

  it('ignores a malformed amount instead of guessing', () => {
    // Better to have the user type it than to send the wrong figure.
    expect(parseMerchantQr(merchantQr({ amount: 'abc' }))).not.toHaveProperty('amountPaise');
    expect(parseMerchantQr(merchantQr({ amount: '0' }))).not.toHaveProperty('amountPaise');
  });

  it('rejects anything that is not an EMV payload', () => {
    for (const junk of ['', 'upi://pay?pa=a@b', 'https://example.com', 'hello', '0102']) {
      expect(parseMerchantQr(junk)).toBeNull();
    }
  });

  it('takes the FIRST occurrence of a duplicated tag', () => {
    // A trailing duplicate must not be able to override the real payee.
    const forged = tlv('00', '01') + upiTemplate('real@okhdfcbank') + upiTemplate('attacker@ybl') + tlv('53', '356');
    expect(parseMerchantQr(forged)?.vpa).toBe('real@okhdfcbank');
  });
});
