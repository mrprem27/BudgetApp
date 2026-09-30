/**
 * Row ids that are DERIVED from a natural key, shared by the phone and the
 * server (SPEC-SERVER.md §3.2).
 *
 * Where a UNIQUE pair already defines a row — one profile per user, one friend
 * row per person, one budget line per category — the id is built from that pair.
 * A phone that reinstalls, reseeds its categories or re-points its people then
 * addresses the SAME server row, instead of minting a duplicate that the unique
 * index would refuse forever.
 *
 * Pure and dependency-free on purpose: the Worker imports this file (through
 * `server/api/sync/rules.ts`), so the two sides can never build an id differently.
 */

/** An account's person. A placeholder that turns out to be them is merged INTO this id. */
export const selfPersonId = (userId: string): string => `user:${userId}`;

export const syncIds = {
  profile: (userId: string) => userId,
  moneyProfile: (userId: string) => userId,
  friend: (userId: string, personId: string) => `${userId}:${personId}`,
  /** Trust everywhere (groupId null) or in one group. */
  trust: (userId: string, personId: string, groupId: string | null) => `${userId}:${personId}:${groupId ?? '*'}`,
  groupPreference: (userId: string, groupId: string) => `${userId}:${groupId}`,
  preference: (userId: string, key: string) => `${userId}:${key}`,
  /** A category IS its (kind, name). */
  category: (userId: string, kind: string, name: string) => `${userId}:${kind}:${name}`,
  /** A budget line IS its (group, category, owner); owner null = the group's default. */
  budget: (groupId: string, category: string, personId: string | null) => `${groupId}:${category}:${personId ?? '*'}`,
  member: (groupId: string, personId: string) => `${groupId}:${personId}`,
  approval: (transactionId: string, userId: string) => `${transactionId}:${userId}`,
  /**
   * An account (`U-68`). Every phone seeds the same four defaults as `default:<kind>`, so on the
   * server they are made the user's own; a named account's id is already unique.
   */
  account: (userId: string, localId: string) => (localId.startsWith('default:') ? `${userId}:${localId}` : localId),
} as const;

/** The server's account id back to the phone's: `<user>:default:bank` → `default:bank`. */
export const localAccountId = (userId: string, serverId: string): string =>
  serverId.startsWith(`${userId}:default:`) ? serverId.slice(userId.length + 1) : serverId;

/**
 * The user's own choices that travel between their phones. Everything else in
 * AsyncStorage is device state — the lock, the privacy screen, the location
 * permission, hints, migration markers, cursors — and never leaves (SYNC-F7).
 * Feature flags are preferences, never entitlements, so they travel too.
 */
export const SYNCED_PREFERENCES: ReadonlyArray<string | RegExp> = [
  'budget_target', 'onboarding_intent', 'preferred_upi_app', 'auto_sweep_enabled',
  'default_cadence', 'default_currency', 'default_pay_method', /^feature_[A-Za-z]+$/,
];

export const isSyncedPreference = (key: string): boolean =>
  SYNCED_PREFERENCES.some(p => (typeof p === 'string' ? p === key : p.test(key)));
