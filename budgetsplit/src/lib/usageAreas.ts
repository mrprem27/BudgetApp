/**
 * Which part of the app a route belongs to, for analytics (`docs/SPEC-ANALYTICS.md`). Every
 * event carries its `area`, so "which feature is used most" is one breakdown instead of a list
 * of forty routes.
 *
 * Longest prefix wins. `usageAreas.test.ts` walks `app/` and fails on a route with no area, so a
 * new screen cannot go unmeasured or land in the wrong one silently.
 */
const AREAS: readonly (readonly [prefix: string, area: string])[] = [
  ['/add', 'Add'],
  ['/txn', 'Entry'],
  ['/review', 'Import and review'],
  ['/import', 'Import and review'],
  ['/groups', 'Groups'],
  ['/group', 'Groups'],
  ['/friends', 'Friends'],
  ['/person', 'Friends'],
  ['/trust', 'Friends'],
  ['/approvals', 'Friends'],
  ['/link', 'Friends'],
  ['/personal', 'Personal'],
  ['/savings', 'Money'],
  ['/assets', 'Money'],
  ['/asset', 'Money'],
  ['/accounts', 'Money'],
  ['/afford', 'Afford'],
  ['/budget', 'Budget'],
  ['/categories', 'Budget'],
  ['/category', 'Budget'],
  ['/plan/recurring', 'Recurring'],
  ['/recurring', 'Recurring'],
  ['/upcoming', 'Recurring'],
  ['/insights', 'Insights'],
  ['/reports', 'Reports'],
  ['/report-transactions', 'Reports'],
  ['/history', 'Reports'],
  ['/badges', 'Badges'],
  ['/settings', 'Settings'],
  ['/features', 'Settings'],
  ['/help', 'Settings'],
  ['/storage', 'Settings'],
  ['/auth', 'Account'],
];

const BY_LENGTH = [...AREAS].sort((a, b) => b[0].length - a[0].length);

/** The area of a route shape (`/group/[id]/budget` → `Groups`); `/` is Home; unknown is `Other`. */
export function areaOf(route: string): string {
  if (route === '/' || route === '') return 'Home';
  for (const [prefix, area] of BY_LENGTH) {
    if (route === prefix || route.startsWith(prefix + '/')) return area;
  }
  return 'Other';
}
