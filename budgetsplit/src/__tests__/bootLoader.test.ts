import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The first-launch flicker (`SPEC-2026-09-FEEDBACK.md` §1, `docs/history/TASKS-2026-09-FEEDBACK.md` T1) came from THREE
 * separate `BrandedLoader` mounts in sequence — root boot, then `FlagsGate`,
 * then `OnboardingGate` — each one unmounting the last and mounting a fresh
 * logo image. The fix is not fewer `<BrandedLoader />` call sites (two stay,
 * deliberately, as safety nets for a caller that doesn't supply the new
 * props) but making sure the ONLY one that can fire during a normal boot is
 * the root's: flags and onboarding-done are read in parallel with opening the
 * DB and handed down already resolved, so `FlagsGate` and `OnboardingGate`
 * start `ready`/resolved and never render their own loader.
 *
 * None of this is visible from a screenshot and none of it is caught by tsc —
 * a provider silently going back to reading for itself, or the root loader
 * silently stopping short of waiting for the flags/onboarding read, would
 * reintroduce the exact flicker this test exists to keep gone.
 */

const ROOT = join(__dirname, '..', '..');
const LAYOUT = join(ROOT, 'app', '_layout.tsx');
const FLAGS_PROVIDER = join(ROOT, 'src', 'components', 'system', 'FeatureFlagsProvider.tsx');
const ONBOARDING_GATE = join(ROOT, 'src', 'components', 'system', 'OnboardingGate.tsx');

const read = (f: string) => readFileSync(f, 'utf8');

it('finds the boot files to scan', () => {
  // A guard that silently scans nothing passes forever. This is the canary.
  expect(read(LAYOUT).length).toBeGreaterThan(0);
  expect(read(FLAGS_PROVIDER).length).toBeGreaterThan(0);
  expect(read(ONBOARDING_GATE).length).toBeGreaterThan(0);
});

describe('the root boot effect resolves flags and onboarding status before mounting', () => {
  it('reads flags and onboarding-done alongside opening the DB, not after', () => {
    const src = read(LAYOUT);
    expect(src).toMatch(/loadFlags\(\)/);
    expect(src).toMatch(/settings\.onboardingDone\(\)/);
  });

  it('the loader guard waits on the flags and onboarding reads too, not just fonts/db', () => {
    const src = read(LAYOUT);
    const guard = src.match(/if \(!fontsLoaded[^)]*\)\s*\{\s*return <BrandedLoader/);
    expect(guard).not.toBeNull();
    expect(guard![0]).toMatch(/initialFlags\s*===\s*null/);
    expect(guard![0]).toMatch(/initialOnboardingDone\s*===\s*null/);
  });

  it('hands the resolved values down, so the gates below never have to read for themselves', () => {
    const src = read(LAYOUT);
    expect(src).toMatch(/<FeatureFlagsProvider initialFlags=\{initialFlags\}>/);
    expect(src).toMatch(/<OnboardingGate initialDone=\{initialOnboardingDone\}>/);
  });
});

/**
 * Launch → loader → onboarding hero must read as one blank until the hero's
 * animation assembles the logo (reported 2026-09-25). The loader used to draw the
 * finished logo first, so the animation "built" a mark the user had just seen.
 */
describe('nothing is drawn before the first real screen', () => {
  const LOADER = join(ROOT, 'src', 'components', 'system', 'BrandedLoader.tsx');

  it('the loader draws no logo and no spinner', () => {
    const src = read(LOADER);
    expect(src).not.toMatch(/<Image\b|<ActivityIndicator\b|require\(/);
  });

  it('the launch screen stays up until the root has laid out, on both the app and the error screen', () => {
    const src = read(LAYOUT);
    expect(src).toMatch(/^SplashScreen\.preventAutoHideAsync\(\)/m);
    expect(src).toMatch(/<GestureHandlerRootView[^>]*onLayout=\{hideSplash\}/);
    // A failed boot must not sit behind a splash nobody hides.
    expect(src).toMatch(/justifyContent: 'center' \}\} onLayout=\{hideSplash\}>\s*<ErrorState/);
  });

  it('the native launch screen is the app background, with no image', () => {
    const app = JSON.parse(read(join(ROOT, 'app.json'))) as { expo: { plugins: unknown[]; splash?: unknown } };
    const entry = app.expo.plugins.find(p => Array.isArray(p) && p[0] === 'expo-splash-screen') as [string, Record<string, unknown>] | undefined;
    expect(entry).toBeDefined();
    const bg = read(join(ROOT, 'src', 'theme', 'colors.ts')).match(/\bbg: '(#[0-9A-Fa-f]{6})'/)?.[1];
    expect(entry![1].backgroundColor).toBe(bg);
    expect(entry![1].image).toBeUndefined();
    expect(app.expo.splash).toBeUndefined();
  });
});

describe('the gates start resolved when given the root\'s values', () => {
  it('FeatureFlagsProvider skips its own AsyncStorage read when initialFlags is given', () => {
    const src = read(FLAGS_PROVIDER);
    // The lazy initializer must seed `ready` from the prop, and the effect must
    // bail out early when the prop was supplied — otherwise a second read (and a
    // second flip from not-ready to ready) can still slip a frame in.
    expect(src).toMatch(/useState\(\(\) => initialFlags !== undefined\)/);
    expect(src).toMatch(/if \(initialFlags !== undefined\) return;/);
  });

  it('OnboardingGate skips its own AsyncStorage read when initialDone is given', () => {
    const src = read(ONBOARDING_GATE);
    expect(src).toMatch(/initialDone === undefined \? 'loading' : initialDone \? 'done' : 'onboarding'/);
    expect(src).toMatch(/if \(initialDone !== undefined\) return;/);
  });
});
