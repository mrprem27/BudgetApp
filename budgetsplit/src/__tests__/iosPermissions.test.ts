import appJson from '../../app.json';
import { UPI_APPS } from '../lib/upiIntent';

const expo = appJson.expo as unknown as {
  ios: { infoPlist: Record<string, unknown> };
  plugins: Array<string | [string, Record<string, unknown>]>;
};

/** Config for a plugin registered as `[name, opts]`, or null when it has no options. */
function pluginOpts(name: string): Record<string, unknown> | null {
  for (const p of expo.plugins) {
    if (Array.isArray(p) && p[0] === name) return p[1];
  }
  return null;
}

describe('iOS can actually reach the UPI apps it offers', () => {
  // `Linking.canOpenURL` answers `false` for any scheme missing from
  // LSApplicationQueriesSchemes, whatever is installed. So a UPI app added to
  // UPI_APPS without its scheme here doesn't error — it just never appears in the
  // picker, on real phones only, which is close to undiagnosable from a simulator.
  it('declares a query scheme for every app in the picker', () => {
    const declared = expo.ios.infoPlist.LSApplicationQueriesSchemes as string[];
    for (const app of UPI_APPS) {
      const scheme = app.probe.replace('://', '');
      expect(declared).toContain(scheme);
    }
  });

  it('declares the generic upi scheme, which the Android path and settle-up use', () => {
    expect(expo.ios.infoPlist.LSApplicationQueriesSchemes).toContain('upi');
  });

  it('keeps every probe a bare scheme — canOpenURL matches on scheme alone', () => {
    for (const app of UPI_APPS) expect(app.probe).toMatch(/^[a-z][a-z0-9.+-]*:\/\/$/);
  });
});

describe('camera purpose string describes what the camera is used for', () => {
  const infoPlist = expo.ios.infoPlist.NSCameraUsageDescription as string;

  // Apple's review guideline 5.1.1 wants the purpose string to match actual use, and
  // beyond review it is the only explanation the user gets at the prompt. Scan & Pay
  // asks for the camera to read a payment code; a receipts-only string is wrong at
  // the exact moment money is about to move.
  it('mentions scanning a code, not only photographing receipts', () => {
    expect(infoPlist.toLowerCase()).toMatch(/\bqr\b|\bscan/);
  });

  it('still mentions receipts, which is the other real use', () => {
    expect(infoPlist.toLowerCase()).toContain('receipt');
  });

  // Three places can set this and only one survives: an explicit ios.infoPlist entry
  // wins over any plugin's. Keeping them identical means the one that wins is also
  // the one that was reviewed, whichever that turns out to be.
  it('matches the strings the camera plugins would supply', () => {
    for (const name of ['expo-camera', 'expo-image-picker']) {
      expect(pluginOpts(name)?.cameraPermission).toBe(infoPlist);
    }
  });
});
