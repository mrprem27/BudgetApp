import type { EntitySpec } from '../utils/mutation';
import { SYNCED_PREFERENCES, syncIds } from '../rules';

/**
 * Everything a user owns alone (user scope), as push specs (SPEC-SERVER.md §2.4–2.9).
 *
 * `columns` is the ONLY data a client may write. System columns — id, scope_id,
 * version, seq, the created/updated stamps, deleted_at and the owner — are the
 * server's, and are never read from a request body.
 *
 * `money: true` makes every write compare-and-set on `version` (SYNC-F3: never
 * silent last-write-wins on money). The rest are last-write-wins: a lost rename
 * or preference costs nothing, and refusing one would cost a sync.
 *
 * `id` makes the row's key deterministic where a UNIQUE pair already defines it.
 * A phone that reinstalls, or remaps its people, then addresses the same row
 * rather than minting a duplicate that the unique index would refuse forever.
 */
export const PERSONAL_ENTITIES: Record<string, EntitySpec> = {
  categories: {
    table: 'categories', money: false,
    columns: ['kind', 'name', 'section', 'icon', 'color'],
    // A category IS its (kind, name): the phone reseeds defaults with fresh ids,
    // and transactions and budgets name categories rather than point at them.
    id: (userId, data) => (typeof data.kind === 'string' && typeof data.name === 'string'
      ? syncIds.category(userId, data.kind, data.name) : null),
  },
  profiles: {
    table: 'profiles', money: false,
    columns: ['display_name', 'avatar_color', 'mobile', 'upi_vpa'],
    id: userId => syncIds.profile(userId),
  },
  friends: {
    table: 'friends', money: false,
    columns: ['person_id', 'name', 'avatar_color', 'mobile', 'email', 'upi_vpa',
      'receivable_status', 'receivable_status_at', 'is_archived'],
    id: (userId, data) => (typeof data.person_id === 'string' ? syncIds.friend(userId, data.person_id) : null),
    // A friend with no account is a placeholder person; make sure one exists.
    ensurePeople: ['person_id'],
  },
  trust_settings: {
    table: 'trust_settings', money: false,
    columns: ['person_id', 'group_id', 'level'],
    id: (userId, data) => (typeof data.person_id === 'string'
      ? syncIds.trust(userId, data.person_id, typeof data.group_id === 'string' ? data.group_id : null) : null),
    ensurePeople: ['person_id'],
    readableGroup: 'group_id',
  },
  group_preferences: {
    table: 'group_preferences', money: false,
    columns: ['group_id', 'is_archived', 'sort_order'],
    id: (userId, data) => (typeof data.group_id === 'string' ? syncIds.groupPreference(userId, data.group_id) : null),
    readableGroup: 'group_id',
  },
  assets: {
    table: 'assets', money: true,
    columns: ['name', 'kind', 'icon', 'color', 'balance', 'is_archived', 'sort_order'],
  },
  savings_goals: {
    table: 'savings_goals', money: true,
    columns: ['name', 'target', 'priority', 'category', 'icon', 'color', 'allocation', 'frequency',
      'is_locked', 'is_archived', 'last_auto_at', 'target_date', 'sort_order'],
  },
  savings_transactions: {
    table: 'savings_transactions', money: true,
    columns: ['goal_id', 'amount', 'kind', 'source', 'source_bucket', 'date', 'note'],
    // The goal must be MINE — a foreign key alone would accept anyone's goal id.
    ownedReference: { column: 'goal_id', table: 'savings_goals' },
  },
  money_profiles: {
    table: 'money_profiles', money: true,
    columns: ['opening_bank', 'opening_cash', 'opening_wallet', 'credit_limit', 'credit_used', 'card_baseline_at', 'stated_at'],
    // One per user.
    id: userId => syncIds.moneyProfile(userId),
  },
  user_preferences: {
    table: 'user_preferences', money: false,
    columns: ['key', 'value'],
    id: (userId, data) => (typeof data.key === 'string' ? syncIds.preference(userId, data.key) : null),
    // Device state never travels (SYNC-F7): lock, privacy screen, location
    // permission, hints, markers, cursors. Only the user's own choices do —
    // including feature flags, which are preferences (never entitlements).
    allowedValues: { key: SYNCED_PREFERENCES },
  },
  imported_transactions: {
    table: 'imported_transactions', money: false,
    columns: ['date', 'amount', 'description', 'kind', 'category', 'direction', 'raw', 'source', 'pay_method',
      'dest_group_id', 'split_draft', 'counterparty_id', 'latitude', 'longitude', 'place_label'],
  },
};
