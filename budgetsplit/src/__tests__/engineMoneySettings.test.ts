import { horizonDaysFor } from '../lib/engine/projection';
import { essentialFloor } from '../lib/engine/behaviour';
import { nextPayday, daysToMonthEnd, DEFAULT_MONEY_SETTINGS, type MoneySettings } from '../lib/engine/moneySettings';
import { getFinanceSnapshot } from '../db/queries/engineSnapshot';
import { createTestDb } from './helpers/testDb';
import { buildPersona, PERSONA_NOW } from '../db/enginePersonas';
import type { FinanceSnapshot } from '../lib/engine/types';

// SPEC-ENGINE.md §10b (U-33): what you tell the engine about how you are paid.

const DAY = 86_400_000;
// Wednesday 30 Sep 2026, noon UTC.
const NOW = Date.UTC(2026, 8, 30, 12);

async function persona(kind: Parameters<typeof buildPersona>[1] = 'salariedRenter'): Promise<FinanceSnapshot> {
  const db = createTestDb();
  await buildPersona(db, kind);
  return getFinanceSnapshot(db, PERSONA_NOW);
}
const withSettings = (snap: FinanceSnapshot, s: Partial<MoneySettings>): FinanceSnapshot => ({ ...snap, settings: { ...DEFAULT_MONEY_SETTINGS, ...s } });

describe('nextPayday — a stated cycle names the next date, strictly after today', () => {
  it('daily is tomorrow', () => expect(nextPayday(NOW, 'daily', null)).toBe(Date.UTC(2026, 8, 30) + DAY));
  it('weekly lands on the weekday, a week on when it is today', () => {
    expect(nextPayday(NOW, 'weekly', 5)).toBe(Date.UTC(2026, 9, 2));   // Friday
    expect(nextPayday(NOW, 'weekly', 3)).toBe(Date.UTC(2026, 9, 7));   // today is Wednesday
  });
  it('monthly holds the day to the month, and today counts as passed', () => {
    expect(nextPayday(NOW, 'monthly', 1)).toBe(Date.UTC(2026, 9, 1));
    expect(nextPayday(NOW, 'monthly', 30)).toBe(Date.UTC(2026, 9, 30));
    expect(nextPayday(Date.UTC(2026, 0, 15), 'monthly', 31)).toBe(Date.UTC(2026, 0, 31));
    expect(nextPayday(Date.UTC(2026, 1, 1), 'monthly', 31)).toBe(Date.UTC(2026, 1, 28));
  });
  it('twice a month is the day and fifteen days on', () => {
    expect(nextPayday(NOW, 'twice', 1)).toBe(Date.UTC(2026, 9, 1));
    expect(nextPayday(Date.UTC(2026, 9, 2), 'twice', 1)).toBe(Date.UTC(2026, 9, 16));
  });
  it('auto and irregular name no date', () => {
    expect(nextPayday(NOW, 'auto', null)).toBeNull();
    expect(nextPayday(NOW, 'irregular', null)).toBeNull();
  });
  it('month end is at least a day', () => expect(daysToMonthEnd(Date.UTC(2026, 8, 30, 23))).toBe(1));
});

describe('horizonDaysFor — what you told it wins, and defaults change nothing', () => {
  it('the defaults give exactly the inferred horizon', async () => {
    const snap = await persona();
    expect(horizonDaysFor(withSettings(snap, {}))).toBe(horizonDaysFor({ ...snap, settings: undefined }));
  });
  it('a stated look-ahead is taken as is', async () => {
    const snap = await persona();
    expect(horizonDaysFor(withSettings(snap, { lookAhead: '7' }))).toBe(7);
    expect(horizonDaysFor(withSettings(snap, { lookAhead: '30' }))).toBe(30);
  });
  it('a daily earner looks to tomorrow; irregular looks 60 days', async () => {
    const snap = await persona();
    expect(horizonDaysFor(withSettings(snap, { payCycle: 'daily' }))).toBe(1);
    expect(horizonDaysFor(withSettings(snap, { payCycle: 'irregular' }))).toBe(60);
  });
});

describe('essentialFloor — keep aside', () => {
  it('none keeps nothing; an amount is that amount; a month is ~4× a week', async () => {
    const snap = await persona();
    const week = essentialFloor(withSettings(snap, {}));
    expect(week).toBeGreaterThan(0);
    expect(essentialFloor(withSettings(snap, { keepAside: 'none' }))).toBe(0);
    expect(essentialFloor(withSettings(snap, { keepAside: 'custom', keepAsideAmount: 500_000 }))).toBe(500_000);
    expect(essentialFloor(withSettings(snap, { keepAside: 'month' }))).toBeCloseTo((week / 7) * 30, 0);
  });
});
