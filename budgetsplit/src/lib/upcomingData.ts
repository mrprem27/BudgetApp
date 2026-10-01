import type * as SQLite from 'expo-sqlite';
import { differenceInCalendarDays, endOfMonth } from 'date-fns';
import { getAllRecurringRules, getSkipsMap } from '../db/queries/recurring';
import { getGlobalNet } from '../db/queries/balances';
import { getMe, getAllPersons, type Person } from '../db/queries/persons';
import { simplify } from './settle';
import { buildUpcoming, type UpcomingItem } from './upcoming';

/** A settle-up that involves me, for the Upcoming screen. */
export type SettleReminder = { from: string; to: string; amount: number; counterpart: Person; iOwe: boolean };

/**
 * Bills due in the next two weeks or by the end of this month, whichever is later, and the
 * settle-ups that involve me. To month-end because this is the only list of charges now: Money
 * listed the month's until `U-96`, and a bill due on the 20th would otherwise be on no list on the 1st.
 */
export async function loadUpcomingScreen(db: SQLite.SQLiteDatabase): Promise<{ bills: UpcomingItem[]; settles: SettleReminder[] }> {
  const me = await getMe(db);
  if (!me) return { bills: [] as UpcomingItem[], settles: [] as SettleReminder[] };
  const billRules = await getAllRecurringRules(db);
  const billSkips = await getSkipsMap(db, billRules.map(r => r.id));
  const now = new Date();
  const days = Math.max(14, differenceInCalendarDays(endOfMonth(now), now));
  const bills = buildUpcoming(billRules, me.id, now.getTime(), 12, days, billSkips);

  // Pending settle-ups that involve me.
  const persons = await getAllPersons(db);
  const pmap = new Map(persons.map(p => [p.id, p]));
  const mine = simplify(await getGlobalNet(db)).filter(s => s.from === me.id || s.to === me.id);
  const settles = mine.map(s => {
    const iOwe = s.from === me.id;
    const other = pmap.get(iOwe ? s.to : s.from);
    return { from: s.from, to: s.to, amount: s.amount, counterpart: other as Person, iOwe };
  }).filter(s => s.counterpart) as SettleReminder[];

  return { bills, settles };
}
