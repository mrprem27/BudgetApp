import fs from 'fs';
import { createTestDb } from './helpers/testDb';
import { readDataStamp } from '../db/queries/dataStamp';
import { insertPerson } from '../db/queries/persons';
import { bumpPrefs } from '../lib/prefsVersion';
import { recordLoad, loadTimeSummary, clearLoadTimes } from '../lib/loadTimes';

const NOW = new Date(2026, 9, 1, 9, 0).getTime();

describe('the data stamp: has anything a screen shows changed? (U-02)', () => {
  it('is the same when nothing was written, however many reads ran', async () => {
    const db = createTestDb() as never;
    const a = await readDataStamp(db, NOW);
    await (db as { getAllAsync: (s: string) => Promise<unknown[]> }).getAllAsync('SELECT * FROM person');
    expect(await readDataStamp(db, NOW + 60_000)).toBe(a);
  });

  it('changes on a write, with no refresh() from anyone', async () => {
    const db = createTestDb() as never;
    const a = await readDataStamp(db, NOW);
    await insertPerson(db, 'A', '#fff');
    expect(await readDataStamp(db, NOW)).not.toBe(a);
  });

  it('changes on a preference a loader reads, and at midnight', async () => {
    const db = createTestDb() as never;
    const a = await readDataStamp(db, NOW);
    bumpPrefs();
    const b = await readDataStamp(db, NOW);
    expect(b).not.toBe(a);
    expect(await readDataStamp(db, NOW + 24 * 3_600_000)).not.toBe(b);
  });
});

describe('a screen regaining focus re-reads only when something changed (U-02)', () => {
  const src = fs.readFileSync('src/hooks/useScreenData.ts', 'utf8');
  const focus = src.slice(src.indexOf('useFocusEffect(useCallback'), src.indexOf('// Cross-screen write'));
  it('an announced write reloads; otherwise the stamp and the age decide', () => {
    expect(focus).toMatch(/else if \(dirty\.current \|\| refetchOnFocus === 'always'\)[\s\S]*run\('load'\)/);
    expect(focus).toMatch(/readDataStamp\(db\)[\s\S]*=== stamp\.current/);
    expect(focus).toMatch(/FRESH_FOR_MS/);
    // The old line: reload whenever the option is on.
    expect(focus).not.toMatch(/refetchOnFocus \|\| dirty\.current/);
  });
  it('the stamp is read before the loader, so a write during a load is not missed', () => {
    const run = src.slice(src.indexOf('const run = useCallback'), src.indexOf('const reload = useCallback'));
    expect(run.indexOf('readDataStamp(db)')).toBeLessThan(run.indexOf('loaderRef.current(db)'));
  });
  it('the route is captured once: a value that follows navigation would reload every mounted screen', () => {
    expect(src).toMatch(/useRef\(usePathname\(\)\)\.current/);
  });
});

describe('load times for the dev screen', () => {
  it('summarises per screen, slowest first', () => {
    clearLoadTimes();
    recordLoad('/', 40); recordLoad('/insights', 300); recordLoad('/', 120);
    expect(loadTimeSummary()).toEqual([
      { path: '/insights', worst: 300, last: 300, count: 1 },
      { path: '/', worst: 120, last: 120, count: 2 },
    ]);
  });
});
