import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * `loading` means "there is nothing to show". `stale` means "what is on screen
 * describes the previous deps". Conflating them emptied six screens.
 *
 * A deps change was made to raise `loading`, so Reports would stop printing
 * August's figures under "September". But a period pill, a month arrow and a kind
 * tab are all deps — and most screens render `loading ? null` — so the Dashboard
 * blanked and re-faded on every Day/Month/Year tap, as did report-transactions,
 * categories and history.
 *
 * The hook cannot be rendered here (node environment, no React renderer), so this
 * reads the real source, the way `touchTargets` and the invariant harnesses do.
 */
const HOOK = join(__dirname, '..', 'hooks', 'useScreenData.ts');
const APP = join(__dirname, '..', '..', 'app');

/** The body of the effect that reacts to a `deps` change. */
function depsEffect(src: string): string {
  const i = src.indexOf('useEffect(() => {', src.indexOf('const prevExists'));
  return src.slice(i, src.indexOf('}, [run]);', i));
}

describe('useScreenData keeps "nothing to show" apart from "about to be relabelled"', () => {
  const src = readFileSync(HOOK, 'utf8');

  it('exposes both flags', () => {
    expect(src).toMatch(/loading: boolean;/);
    expect(src).toMatch(/stale: boolean;/);
    expect(src).toMatch(/return \{ data, loading, stale,/);
  });

  it('does NOT raise `loading` on a deps change — that is what blanked the screens', () => {
    const body = depsEffect(src);
    expect(body).toContain('setStale');
    expect(body).not.toContain('setLoading');
  });

  it('raises `stale` only when data is already on screen', () => {
    // On the very first run `loading` is already true and there is nothing to be
    // stale about — raising it unconditionally would make `stale` a duplicate of
    // `loading` and put us back where we started.
    expect(depsEffect(src)).toContain('setStale(prevExists.current)');
  });

  it('clears both when a load resolves', () => {
    const fin = src.slice(src.indexOf('} finally {'), src.indexOf('}, [db, ...deps]'));
    expect(fin).toContain('setLoading(false)');
    expect(fin).toContain('setStale(false)');
  });
});

/**
 * `stale` costs a blank screen wherever it is used, so it is worth exactly one
 * caller: the surface that prints a period name above its figures.
 */
describe('only the screen that relabels its figures reacts to `stale`', () => {
  function screens(dir: string): string[] {
    const out: string[] = [];
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) out.push(...screens(p));
      else if (/\.tsx$/.test(e)) out.push(p);
    }
    return out;
  }

  it('is consumed by reports, and nowhere else', () => {
    // Matched on the DESTRUCTURE, not the word — `person/[id].tsx` has a style
    // called `stale` and `savings.tsx` a comment using it, neither of which is a
    // consumer of the flag.
    const users = screens(APP)
      .filter(f => /const \{[^}]*\bstale\b[^}]*\} = useScreenData/.test(readFileSync(f, 'utf8')))
      .map(f => f.slice(APP.length + 1));
    // Reports puts a month name above every figure, so showing the previous
    // month's numbers under it is a lie rather than a lag. Everywhere else,
    // content a beat behind beats no content.
    expect(users).toEqual(['reports.tsx']);
  });
});
