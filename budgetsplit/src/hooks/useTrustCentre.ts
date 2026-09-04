import { useSQLiteContext } from 'expo-sqlite';
import { useScreenData } from './useScreenData';
import { useDataRefresh } from '../components/system/DataRefreshProvider';
import { getAllPersons, setTrustState, getGroupTrustFor } from '../db/queries/persons';
import { getAllGroups } from '../db/queries/groups';
import { buildTrustSections, type TrustSections } from '../lib/trustCentre';
import { trustConfirmTitle, trustConfirmBody, trustConfirmCta } from '../lib/trustCopy';
import { confirmAsync } from '../lib/confirm';
import { haptic } from '../lib/haptics';
import type { Person } from '../db/queries/persons';

/**
 * Everything the Trust Centre needs, and nothing the screen has to work out.
 *
 * The screen composes; the buckets are `lib/trustCentre` and the wording is
 * `lib/trustCopy`, so neither can drift into a second version here.
 */
export function useTrustCentre() {
  const db = useSQLiteContext();
  const { refresh } = useDataRefresh();

  const screen = useScreenData(async (d) => {
    const [people, groups] = await Promise.all([getAllPersons(d), getAllGroups(d)]);
    const named = new Map(groups.map(g => [g.id, g.name]));

    /*
     * Exceptions are read per person rather than in one query because
     * `getGroupTrustFor` is the existing accessor and the table is sparse by
     * design — a row exists only where somebody made a deliberate decision, so
     * this is a handful of rows on a real device, not a fan-out.
     *
     * A group that has since been deleted leaves an override behind; it is
     * dropped rather than rendered as a blank, since an exception you cannot
     * name is not information.
     */
    const pairs = await Promise.all(
      people.filter(p => p.is_me !== 1).map(async (p) => {
        const rows = await getGroupTrustFor(d, p.id);
        const names = rows.map(r => named.get(r.group_id)).filter((n): n is string => !!n);
        return [p.id, names] as const;
      }),
    );

    return { sections: buildTrustSections(people, new Map(pairs)) };
  }, []);

  /**
   * Flip one person, with the confirm both trust surfaces share.
   *
   * `refresh()` rather than a local reload: trust changes what the approvals badge
   * and every ledger count, so the screens already mounted have to hear about it.
   */
  async function toggle(person: Person, next: 'trusted' | 'review') {
    const ok = await confirmAsync(
      trustConfirmTitle(person.name, next),
      trustConfirmBody(person.name, next),
      trustConfirmCta(next),
    );
    if (!ok) return;
    await setTrustState(db, person.id, next);
    haptic.success();
    await screen.reload();
    refresh();
  }

  const sections: TrustSections = screen.data?.sections
    ?? { immediate: [], waits: [], unreachable: [], total: 0 };

  return { ...screen, sections, toggle };
}
