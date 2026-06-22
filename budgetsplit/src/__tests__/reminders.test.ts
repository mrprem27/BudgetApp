import { limitReminders, formatReminderTime, type PlannedReminder } from '../lib/reminderPlan';

const mk = (id: string, fireAt: number): PlannedReminder => ({ id, fireAt, title: id, body: '' });

describe('limitReminders', () => {
  it('returns reminders in time order without altering their times', () => {
    const out = limitReminders([mk('late', 10), mk('early', 0)], 50);
    expect(out.map(r => r.id)).toEqual(['early', 'late']);
    expect(out.map(r => r.fireAt)).toEqual([0, 10]);
  });

  it('keeps only the soonest `cap` reminders', () => {
    const many = Array.from({ length: 100 }, (_, i) => mk(`r${i}`, i * 1000));
    const out = limitReminders(many, 50);
    expect(out).toHaveLength(50);
    expect(out[0].id).toBe('r0'); // soonest kept
    expect(out[49].id).toBe('r49'); // furthest-out dropped
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
