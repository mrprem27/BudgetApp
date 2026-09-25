import fs from 'fs';
import path from 'path';

/**
 * `FirstSignInStep` (`DQ-94`, task `M2`) is shared by three screens so a sign-in
 * can't be worded or drawn differently depending on where it happens. Asserted
 * the same way `personNameSheetUsage.test.ts` counts call sites for a shared
 * component: three, identical, each passing `onMerge`.
 */

const SITES = [
  '../components/system/onboarding/SignInStage.tsx',
  '../../app/auth.tsx',
  '../../app/settings/account.tsx',
];

it('renders the "both have data" step from exactly three call sites, each offering Merge', () => {
  const hits = SITES.map(rel => {
    const file = path.join(__dirname, rel);
    const src = fs.readFileSync(file, 'utf8');
    const askBlocks = [...src.matchAll(/kind="ask"[\s\S]*?\/>/g)].map(m => m[0]);
    return { file: path.relative(path.join(__dirname, '..'), file), askBlocks };
  });

  expect(hits.map(h => h.file + ': ' + h.askBlocks.length)).toEqual(
    SITES.map(rel => path.relative(path.join(__dirname, '..'), path.join(__dirname, rel)) + ': 1'),
  );
  for (const { file, askBlocks } of hits) {
    expect({ file, hasOnMerge: /onMerge=/.test(askBlocks[0]), hasCanMerge: /canMerge=\{canMerge\}/.test(askBlocks[0]) })
      .toEqual({ file, hasOnMerge: true, hasCanMerge: true });
  }
});
