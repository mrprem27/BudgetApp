import fs from 'fs';
import path from 'path';

/**
 * Android readiness (`docs/SPEC-ANDROID.md`). Nothing here runs on a phone: these are the
 * mistakes that are invisible on iOS and break Android, held by reading the source.
 */
const files: string[] = [];
(function walk(dir: string) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'assets') walk(full); }
    else if (/\.tsx?$/.test(e.name)) files.push(full);
  }
})('app');
(function walk(dir: string) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'assets') walk(full); }
    else if (/\.tsx?$/.test(e.name)) files.push(full);
  }
})('src');
const read = (f: string) => fs.readFileSync(f, 'utf8');

describe('nothing Apple-only is reached without a way round it', () => {
  it('the text reader loads as an optional module: a required one throws at import on Android', () => {
    const src = read('modules/expo-ocr/src/index.ts');
    expect(src).toMatch(/requireOptionalNativeModule\('ExpoOcr'\)/);
    expect(src).not.toMatch(/[^l]requireNativeModule\(/);
  });

  it('the iOS action sheet is called from one place, which has an Android answer', () => {
    const callers = files.filter(f => /ActionSheetIOS\.showActionSheetWithOptions/.test(read(f)));
    expect(callers).toEqual(['src/hooks/photoSource.ts']);
    expect(read('src/hooks/photoSource.ts')).toMatch(/Alert\.alert\('Add a photo'/);
  });

  it('with no reader on the phone, a scan goes to the cloud and falls back to nothing', () => {
    const src = read('src/lib/ocrProviders/index.ts');
    expect(src).toMatch(/return ocrAvailable \? withDeviceFallback\(geminiExtractor\) : geminiExtractor;/);
    expect(src).toMatch(/return ocrAvailable \|\| \(await settings\.ocrProvider\(\)\) !== 'device';/);
    // The scan button follows that answer, not the platform's name.
    const screen = read('app/add/itemized.tsx');
    expect(screen).toMatch(/const canScan = flags\.receiptScan && scanOk;/);
    expect(screen).not.toMatch(/Platform\.OS === 'ios' && flags\.receiptScan/);
  });
});

describe('what Android draws differently', () => {
  it('no text asks a loaded font for a weight it does not have', () => {
    // Android answers that by dropping the family. A weight is a family here (Inter_600SemiBold).
    const offenders = files.filter(f => /fontWeight\s*:/.test(read(f)) && f !== 'src/components/ui/BalanceChip.tsx');
    expect(offenders).toEqual([]);
    expect(read('src/components/ui/BalanceChip.tsx')).toMatch(/Platform\.select\(\{ ios: \{ fontWeight/);
  });

  it('no alert has more than three buttons, which is all Android shows', () => {
    const over: string[] = [];
    for (const f of files) {
      const s = read(f);
      for (const m of s.matchAll(/Alert\.alert\(/g)) {
        // The buttons array is the first `[` at depth 1 of the call; count `text:` at ITS depth 1,
        // so a second alert opened from a button's onPress is not counted with the first.
        let i = m.index! + m[0].length, depth = 1, start = -1;
        for (; i < s.length && depth > 0; i++) {
          const c = s[i];
          if (c === '(' || c === '{') depth++;
          else if (c === ')' || c === '}') depth--;
          else if (c === '[' && depth === 1) { start = i; break; }
        }
        if (start < 0) continue;
        let n = 0, d = 0;
        for (i = start; i < s.length; i++) {
          const c = s[i];
          if (c === '[' || c === '{' || c === '(') d++;
          else if (c === ']' || c === '}' || c === ')') { d--; if (d === 0) break; }
          else if (d === 2 && s.startsWith('text:', i)) n++;
        }
        if (n > 3) over.push(`${f}: ${n} buttons`);
      }
    }
    expect(over).toEqual([]);
  });

  it('reminders have an Android channel, and the app a version code', () => {
    expect(read('src/lib/notifications.ts')).toMatch(/channelId: Platform\.OS === 'android' \? 'reminders'/);
    expect(JSON.parse(read('app.json')).expo.android).toMatchObject({ package: 'com.prem.budgetsplit', versionCode: expect.any(Number) });
  });
});
