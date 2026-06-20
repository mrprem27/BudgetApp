import { staggerReminders, formatReminderTime, type PlannedReminder } from '../lib/reminderPlan';

const mk = (id: string, fireAt: number): PlannedReminder => ({ id, fireAt, title: id, body: '' });

describe('staggerReminders', () => {
  it('keeps reminders that are already far apart unchanged', () => {
    const out = staggerReminders([mk('a', 1000), mk('b', 100000)], 5000, 50);
    expect(out.map(r => r.fireAt)).toEqual([1000, 100000]);
  });

  it('pushes colliding reminders forward to maintain the gap', () => {
    // three reminders all at t=0 → 0, 5000, 10000
    const out = staggerReminders([mk('a', 0), mk('b', 0), mk('c', 0)], 5000, 50);
    expect(out.map(r => r.fireAt)).toEqual([0, 5000, 10000]);
  });

  it('sorts by time before spacing', () => {
    const out = staggerReminders([mk('late', 10), mk('early', 0)], 5000, 50);
    expect(out.map(r => r.id)).toEqual(['early', 'late']);
    expect(out[1].fireAt).toBe(5000); // 'late' at t=10 pushed to 0+gap
  });

  it('caps the number scheduled', () => {
    const many = Array.from({ length: 100 }, (_, i) => mk(`r${i}`, i * 1000));
    expect(staggerReminders(many, 5000, 50)).toHaveLength(50);
  });

  it('only ever increases a fire time, never pulls it earlier', () => {
    const out = staggerReminders([mk('a', 0), mk('b', 1)], 5000, 50);
    expect(out[1].fireAt).toBeGreaterThanOrEqual(1);
  });
});

describe('formatReminderTime', () => {
  it('formats 12-hour clock with AM/PM', () => {
    expect(formatReminderTime({ hour: 9, minute: 0 })).toBe('9:00 AM');
    expect(formatReminderTime({ hour: 20, minute: 5 })).toBe('8:05 PM');
    expect(formatReminderTime({ hour: 0, minute: 30 })).toBe('12:30 AM');
    expect(formatReminderTime({ hour: 12, minute: 0 })).toBe('12:00 PM');
  });
});
