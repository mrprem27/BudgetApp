import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * The space after a screen's last item comes from one place, `useContentInset` (safe area, the tab
 * bar, a floating +), never a literal or a spacer view. Literals left too much empty space on some
 * screens and too little on a notched phone on others (2026-09-30 phone pass).
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

describe('bottom space on every screen', () => {
  it('no screen pads its end with a literal or a spacer view', () => {
    const bad = files(join(__dirname, '../../app')).filter(p => {
      const s = readFileSync(p, 'utf8');
      return /paddingBottom: space\.(xl|xxl)\b/.test(s) || /<View style=\{\{ height: space\.(lg|xl|xxl) \}\} \/>/.test(s);
    });
    expect(bad).toEqual([]);
  });
});
