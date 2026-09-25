jest.mock('expo-file-system', () => require('./__mocks__/expoFileSystem'));

import fs from 'fs';
import path from 'path';
import { syncStatus, syncedAgo, type SyncStatusInput } from '../lib/syncStatus';
import { classifySyncError } from '../lib/sync/run';
import { ServerAuthError, ServerNotConfiguredError, ServerRequestError } from '../lib/serverApi';

/**
 * The sync status line (task S16, SPEC-SERVER.md §6.1): what it says in every
 * state, which state wins when several are true, and where it may appear.
 */

const NOW = 1_700_000_000_000;
const idle: SyncStatusInput = {
  linked: true, syncing: false, progress: null, failure: null, waiting: 0, lastSyncedAt: NOW - 120_000, now: NOW,
};

describe('the five states, in the spec\'s words', () => {
  it('up to date, quietly, with when', () => {
    expect(syncStatus(idle)).toMatchObject({ state: 'up-to-date', text: 'Up to date · 2 min ago', tone: 'quiet' });
    expect(syncStatus({ ...idle, lastSyncedAt: null }).text).toBe('Up to date');
  });

  it('syncing, as a percentage, never a bare spinner once it is known', () => {
    expect(syncStatus({ ...idle, syncing: true, progress: 0.4 })).toMatchObject({ text: 'Syncing · 40%', progress: 0.4 });
    expect(syncStatus({ ...idle, syncing: true, progress: 1.7 }).text).toBe('Syncing · 100%');
    expect(syncStatus({ ...idle, syncing: true, progress: null }).text).toBe('Syncing…');
  });

  it('waiting, counted, with the right plural', () => {
    expect(syncStatus({ ...idle, waiting: 3 }).text).toBe('3 changes waiting to upload');
    expect(syncStatus({ ...idle, waiting: 1 }).text).toBe('1 change waiting to upload');
  });

  it('offline is neutral, not an error — the data is safe', () => {
    expect(syncStatus({ ...idle, failure: 'offline' })).toMatchObject({ state: 'offline', tone: 'neutral' });
    expect(syncStatus({ ...idle, failure: 'offline' }).action).toBeUndefined();
  });

  it('every failure names its fix', () => {
    expect(syncStatus({ ...idle, failure: 'signed-out' })).toMatchObject({ tone: 'error', action: { kind: 'sign-in' } });
    expect(syncStatus({ ...idle, failure: 'failed' })).toMatchObject({ tone: 'error', action: { kind: 'retry' } });
    expect(syncStatus({ ...idle, linked: false })).toMatchObject({ state: 'not-connected', action: { kind: 'connect' } });
  });
});

describe('which state wins', () => {
  it('a sync in progress beats everything', () => {
    expect(syncStatus({ ...idle, syncing: true, progress: 0.5, failure: 'failed', waiting: 4 }).state).toBe('syncing');
  });
  it('offline beats "waiting" — its wording already says the changes will upload', () => {
    expect(syncStatus({ ...idle, failure: 'offline', waiting: 4 }).state).toBe('offline');
  });
  it('signed out beats not-connected: signing in comes first', () => {
    expect(syncStatus({ ...idle, failure: 'signed-out', linked: false }).action?.kind).toBe('sign-in');
  });
});

it('"ago" reads naturally at every scale', () => {
  expect(syncedAgo(NOW - 10_000, NOW)).toBe('just now');
  expect(syncedAgo(NOW - 59 * 60_000, NOW)).toBe('59 min ago');
  expect(syncedAgo(NOW - 3 * 3_600_000, NOW)).toBe('3 h ago');
  expect(syncedAgo(NOW - 26 * 3_600_000, NOW)).toBe('1 day ago');
  expect(syncedAgo(NOW + 5_000, NOW)).toBe('just now');   // a clock a little ahead
});

it('classifies a failed sync by its cause', () => {
  expect(classifySyncError(new ServerAuthError())).toBe('signed-out');
  expect(classifySyncError(new TypeError('Network request failed'))).toBe('offline');
  expect(classifySyncError(new ServerNotConfiguredError())).toBe('failed');
  expect(classifySyncError(new ServerRequestError(500, 'boom'))).toBe('failed');
});

describe('where the line may appear (S15: Account and Sync, never Home)', () => {
  const ROOT = path.join(__dirname, '..', '..');
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.tsx') ? [path.join(d, e.name)] : []);
  const files = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'src', 'components'))];
  const usedIn = (tag: string) => files
    .filter(f => new RegExp(`<${tag}[\\s/]`).test(fs.readFileSync(f, 'utf8')))
    .map(f => path.relative(ROOT, f)).sort();

  it('one component serves every status surface, and Home is not one', () => {
    expect(usedIn('SyncStatus')).toEqual(['app/settings/account.tsx', 'app/settings/sync.tsx']);
  });

  it('the first-sign-in step is one component, on every way in', () => {
    expect(usedIn('FirstSignInStep')).toEqual([
      'app/auth.tsx', 'app/settings/account.tsx', 'src/components/system/onboarding/SignInStage.tsx',
    ]);
    // S14's interim Alert is gone.
    expect(fs.readFileSync(path.join(ROOT, 'src', 'hooks', 'useEmailSignIn.ts'), 'utf8')).not.toMatch(/Alert\.alert/);
  });
});
