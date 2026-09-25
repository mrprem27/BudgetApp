import { parseTags, serializeTags } from '../tags';
import { selfPersonId, syncIds } from './ids';

/**
 * The phone's rows ⇄ the server's rows (SPEC-SERVER.md §2.11).
 *
 * The phone keeps its own 22 tables; renaming them would be pure churn and pure
 * risk. The server has its own, cleaner model. This module is the ONE place the
 * two meet, in both directions, and it is pure: no database, no React, no
 * network — so the pull applier, the push drain and the tests all use the same
 * translation, and the Worker could too.
 *
 * `COLUMN_FATES` below declares, for every local column, where it goes — or why
 * it never leaves the phone. `rowMap.test.ts` reads the real schema and fails the
 * moment a column exists that nobody decided about: a column added without a
 * fate is data that silently does not survive a new phone.
 */

// ---------------------------------------------------------------------------
// Every local column's fate
// ---------------------------------------------------------------------------

/** `→ table.column` when it travels; `local: <why>` when it never leaves the phone. */
export type Fate = string;
const local = (why: string): Fate => `local: ${why}`;
const DEAD = local('dead column — never read, never written, kept only to avoid a table rebuild');
const SERVER_STAMP = '← server updated_at (the server owns when a row last changed)';

export const COLUMN_FATES: Record<string, Record<string, Fate>> = {
  person: {
    id: '→ people.id (one global id per human)',
    name: '→ friends.name | profiles.display_name (me)',
    avatar_color: '→ friends.avatar_color | profiles.avatar_color (me)',
    is_me: '← derived: id = the account\'s person',
    email: '→ friends.email; for me, the verified account email, set at sign-in',
    mobile: '→ friends.mobile | profiles.mobile (me)',
    remote_uid: '← people.user_id, carried on friends/group_members rows',
    image_uri: local('a photo on this phone; photos never sync (SYNC-F4)'),
    upi_vpa: '→ friends.upi_vpa | profiles.upi_vpa (me)',
    receivable_state: '→ friends.receivable_status',
    receivable_state_at: '→ friends.receivable_status_at',
    trust_state: '→ trust_settings.level (group_id NULL)',
    trust_state_at: '← trust_settings.updated_at (written, never shown)',
  },
  person_group_trust: {
    person_id: '→ trust_settings.person_id',
    group_id: '→ trust_settings.group_id',
    trust_state: '→ trust_settings.level',
    updated_at: SERVER_STAMP,
  },
  budget_group: {
    id: '→ groups.id',
    name: '→ groups.name',
    icon: '→ groups.icon',
    color: '→ groups.color',
    limit_daily: DEAD,
    limit_monthly: DEAD,
    limit_yearly: DEAD,
    carry_over: '→ groups.carry_over',
    is_shared: local('dead — derived from the member count instead (SYNC-F23)'),
    is_archived: '→ group_preferences.is_archived (my list, not the group)',
    is_personal: '→ groups.kind = personal',
    simplify_debt: '→ groups.simplify_debts',
    default_split: '→ groups.default_split',
    created_at: '→ groups.created_at',
    default_currency: DEAD,
    created_by: '← groups.owner_id, as the owner\'s person',
    pair_person_id: '← derived: the OTHER member of a pair group',
    updated_at: SERVER_STAMP,
    deleted_at: '→ groups.deleted_at',
  },
  group_member: {
    group_id: '→ group_members.group_id',
    person_id: '→ group_members.person_id',
    joined_at: '→ group_members.joined_at',
    role: '→ group_members.role',
    updated_at: SERVER_STAMP,
    deleted_at: '→ group_members.left_at (+ status left/removed)',
    invited: '← group_members.status = invited (the server decides; the phone only predicts it)',
  },
  txn: {
    id: '→ transactions.id',
    group_id: '→ transactions.group_id',
    kind: '→ transactions.kind',
    entry_mode: '→ transactions.entry_mode',
    date: '→ transactions.date',
    category: '→ transactions.category',
    note: '→ transactions.note',
    attachment_uri: local('a receipt photo on this phone; photos never sync (SYNC-F4)'),
    tags: '→ transaction_tags (one row per tag, in order)',
    adjustments: '→ transactions.adjustments',
    recur_freq: '→ recurring_rules.frequency',
    recur_interval: '→ recurring_rules.interval (NULL means 1)',
    recur_end: '→ recurring_rules.ends_at',
    recur_override_date: '→ transactions.occurrence_date',
    parent_recur_id: '→ transactions.recurring_rule_id',
    recur_state: '→ recurring_rules.status',
    recur_paused_at: '→ recurring_rules.paused_at',
    recur_mode: '→ recurring_rules.mode',
    tz: '→ transactions.timezone',
    lat: '→ transactions.latitude',
    lng: '→ transactions.longitude',
    place_label: '→ transactions.place_label',
    pay_method: '→ transactions.pay_method',
    currency: '→ transactions.currency (NULL means INR)',
    source: '→ transactions.source',
    asset_id: '→ transactions.asset_id',
    author_person_id: '→ transactions.author_id (NULL means me)',
    sync_version: local('v1 sync bookkeeping, replaced by sync_queue'),
    is_deleted: '→ transactions.deleted_at',
    created_at: '→ transactions.created_at',
    updated_at: SERVER_STAMP,
  },
  txn_payment: {
    txn_id: '→ transaction_payers.transaction_id',
    person_id: '→ transaction_payers.person_id',
    amount: '→ transaction_payers.amount',
  },
  txn_share: {
    txn_id: '→ transaction_splits.transaction_id',
    person_id: '→ transaction_splits.person_id',
    amount: '→ transaction_splits.amount',
  },
  line_item: {
    id: '→ transaction_items.id',
    txn_id: '→ transaction_items.transaction_id',
    name: '→ transaction_items.name',
    qty: '→ transaction_items.quantity',
    unit_price: '→ transaction_items.unit_price',
    assigned_to: '→ transaction_items.assigned_to',
    split_mode: '→ transaction_items.split_mode',
    split_values: '→ transaction_items.split_values',
  },
  recur_skip: {
    series_id: '→ recurring_skips.rule_id',
    occurrence_date: '→ recurring_skips.occurrence_date',
    created_at: local('never read; the server keeps its own'),
  },
  category: {
    id: '← categories.id (derived from kind and name; nothing references it)',
    group_id: local('always NULL — the catalog is global per user'),
    name: '→ categories.name',
    icon: '→ categories.icon',
    color: '→ categories.color',
    kind: '→ categories.kind',
    section: '→ categories.section',
  },
  category_tombstone: {
    name: '→ categories (a deleted row IS the tombstone)',
    kind: '→ categories.kind',
    created_at: '→ categories.deleted_at',
  },
  category_budget: {
    id: '← budgets.id (derived from group, category and owner)',
    group_id: '→ budgets.group_id',
    category: '→ budgets.category',
    period: local('always \'monthly\' — superseded by cadence'),
    amount: '→ budgets.amount',
    cadence: '→ budgets.cadence',
    person_id: '→ budgets.person_id',
  },
  audit_log: {
    id: '→ activity_log.id (the mutation carries it)',
    entity_type: '→ activity_log.entity',
    entity_id: '→ activity_log.entity_id',
    group_id: '→ activity_log.scope_id (group scopes)',
    action: '→ activity_log.action',
    summary: '→ activity_log.summary',
    amount: '→ activity_log.amount',
    created_at: '← activity_log.created_at',
    actor_person_id: '← activity_log.actor_id, as a person (NULL means me)',
  },
  asset: {
    id: '→ assets.id', name: '→ assets.name', kind: '→ assets.kind', icon: '→ assets.icon',
    color: '→ assets.color', balance: '→ assets.balance', is_archived: '→ assets.is_archived',
    sort_order: '→ assets.sort_order', created_at: '→ assets.created_at', updated_at: SERVER_STAMP,
  },
  savings_goal: {
    id: '→ savings_goals.id', name: '→ savings_goals.name', target: '→ savings_goals.target',
    priority: '→ savings_goals.priority', category: '→ savings_goals.category', icon: '→ savings_goals.icon',
    color: '→ savings_goals.color', allocation: '→ savings_goals.allocation', frequency: '→ savings_goals.frequency',
    locked: '→ savings_goals.is_locked', is_archived: '→ savings_goals.is_archived',
    last_auto_at: '→ savings_goals.last_auto_at', target_date: '→ savings_goals.target_date',
    sort_order: '→ savings_goals.sort_order', created_at: '→ savings_goals.created_at',
  },
  savings_txn: {
    id: '→ savings_transactions.id', goal_id: '→ savings_transactions.goal_id',
    amount: '→ savings_transactions.amount', kind: '→ savings_transactions.kind',
    source: '→ savings_transactions.source', date: '→ savings_transactions.date',
    note: '→ savings_transactions.note', created_at: '→ savings_transactions.created_at',
    source_asset: '→ savings_transactions.source_bucket',
  },
  pending_txn: {
    id: '→ imported_transactions.id', date: '→ imported_transactions.date',
    amount: '→ imported_transactions.amount', description: '→ imported_transactions.description',
    kind: '→ imported_transactions.kind', category: '→ imported_transactions.category',
    direction: '→ imported_transactions.direction', raw: '→ imported_transactions.raw',
    created_at: '→ imported_transactions.created_at', dest_group_id: '→ imported_transactions.dest_group_id',
    split_draft: '→ imported_transactions.split_draft', counterparty_id: '→ imported_transactions.counterparty_id',
    source: '→ imported_transactions.source', pay_method: '→ imported_transactions.pay_method',
    lat: '→ imported_transactions.latitude', lng: '→ imported_transactions.longitude',
    place_label: '→ imported_transactions.place_label',
    author_person_id: local('schema-only groundwork; nothing reads it'),
    payer_person_id: local('schema-only groundwork; nothing reads it'),
  },
  txn_approval: {
    txn_id: '← approvals.transaction_id',
    state: '← approvals.status',
    landed_pay_method: '← approvals.landed_pay_method',
    created_at: '← approvals.arrived_at',
    decided_at: '← approvals.decided_at',
    dispute_state: DEAD,
    pending_delete: '← approvals.is_pending_delete',
  },
  txn_dispute: {
    txn_id: '← disputes.transaction_id',
    by_uid: '← disputes.user_id',
    version: '← disputes.transaction_version',
    created_at: '← disputes.raised_at',
    cleared: '← disputes.withdrawn_at',
  },
  settings: {
    key: '→ money_profiles (money.*) — every other key is device state',
    value: '→ money_profiles (money.*)',
  },
  sync_queue: {
    queue_id: local('sync delivery state of this phone'), local_table: local('sync delivery state of this phone'),
    local_id: local('sync delivery state of this phone'), op: local('sync delivery state of this phone'),
    snapshot: local('sync delivery state of this phone'), queued_at: local('sync delivery state of this phone'),
    sent_ids: local('sync delivery state of this phone'),
  },
  sync_version: {
    entity: local('what the server last confirmed; re-learned on every pull'),
    entity_id: local('what the server last confirmed; re-learned on every pull'),
    version: local('what the server last confirmed; re-learned on every pull'),
  },
  friend_request: {
    id: local('the /friend-requests routes own this state, not sync'),
    direction: local('as above'),
    email: local('as above'),
    person_id: local('as above'),
    state: local('as above'),
    created_at: local('as above'),
    updated_at: local('as above'),
  },
};

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

export type Row = Record<string, unknown>;
/** Who is asking: needed to tell "me" from everyone else, both ways. */
export type MapContext = { userId: string };
/** One push mutation's worth: the server id and the data it carries. */
export type Outgoing = { entity: string; entityId: string; data: Row };

const me = (ctx: MapContext) => selfPersonId(ctx.userId);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
/** Drop keys whose value is undefined, so a NOT NULL column with a default gets its default. */
const compact = (r: Row): Row => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined));

// ---------------------------------------------------------------------------
// Simple one-to-one tables
// ---------------------------------------------------------------------------

type Simple = { entity: string; cols: Record<string, string> };

/** local column → server column, for tables that are one row to one row. */
const SIMPLE: Record<'asset' | 'savings_goal' | 'savings_txn' | 'pending_txn', Simple> = {
  asset: {
    entity: 'assets',
    cols: { name: 'name', kind: 'kind', icon: 'icon', color: 'color', balance: 'balance',
      is_archived: 'is_archived', sort_order: 'sort_order', created_at: 'created_at' },
  },
  savings_goal: {
    entity: 'savings_goals',
    cols: { name: 'name', target: 'target', priority: 'priority', category: 'category', icon: 'icon', color: 'color',
      allocation: 'allocation', frequency: 'frequency', locked: 'is_locked', is_archived: 'is_archived',
      last_auto_at: 'last_auto_at', target_date: 'target_date', sort_order: 'sort_order', created_at: 'created_at' },
  },
  savings_txn: {
    entity: 'savings_transactions',
    cols: { goal_id: 'goal_id', amount: 'amount', kind: 'kind', source: 'source', date: 'date', note: 'note',
      created_at: 'created_at', source_asset: 'source_bucket' },
  },
  pending_txn: {
    entity: 'imported_transactions',
    cols: { date: 'date', amount: 'amount', description: 'description', kind: 'kind', category: 'category',
      direction: 'direction', raw: 'raw', created_at: 'created_at', dest_group_id: 'dest_group_id',
      split_draft: 'split_draft', counterparty_id: 'counterparty_id', source: 'source', pay_method: 'pay_method',
      lat: 'latitude', lng: 'longitude', place_label: 'place_label' },
  },
};

export function simpleToServer(table: keyof typeof SIMPLE, row: Row): Outgoing {
  const { entity, cols } = SIMPLE[table];
  const data: Row = {};
  for (const [l, s] of Object.entries(cols)) if (row[l] !== undefined) data[s] = row[l];
  return { entity, entityId: String(row.id), data };
}

export function simpleToLocal(table: keyof typeof SIMPLE, row: Row): Row {
  const { cols } = SIMPLE[table];
  const out: Row = { id: row.id };
  for (const [l, s] of Object.entries(cols)) out[l] = row[s] ?? null;
  if (table === 'asset') out.updated_at = row.updated_at;
  return out;
}

export const assetToServer = (r: Row) => simpleToServer('asset', r);
export const goalToServer = (r: Row) => simpleToServer('savings_goal', r);
export const savingsTxnToServer = (r: Row) => simpleToServer('savings_txn', r);
export const importToServer = (r: Row) => simpleToServer('pending_txn', r);

// ---------------------------------------------------------------------------
// People: me → profiles; everyone else → friends + trust_settings
// ---------------------------------------------------------------------------

export function isMe(personId: string, ctx: MapContext): boolean {
  return personId === me(ctx);
}

export function meToProfile(person: Row, ctx: MapContext): Outgoing {
  return {
    entity: 'profiles', entityId: syncIds.profile(ctx.userId),
    data: compact({ display_name: person.name, avatar_color: person.avatar_color, mobile: person.mobile, upi_vpa: person.upi_vpa }),
  };
}

export function personToFriend(person: Row, ctx: MapContext): Outgoing {
  const personId = String(person.id);
  return {
    entity: 'friends', entityId: syncIds.friend(ctx.userId, personId),
    data: compact({
      person_id: personId, name: person.name, avatar_color: person.avatar_color, mobile: person.mobile,
      email: person.email, upi_vpa: person.upi_vpa, receivable_status: person.receivable_state ?? 'expected',
      receivable_status_at: person.receivable_state_at ?? null,
    }),
  };
}

export function trustToServer(personId: string, groupId: string | null, level: string, ctx: MapContext): Outgoing {
  return {
    entity: 'trust_settings', entityId: syncIds.trust(ctx.userId, personId, groupId),
    data: { person_id: personId, group_id: groupId, level },
  };
}

/** A friend row back into the phone's person row (my naming of them wins). */
export function friendToPerson(friend: Row, ctx: MapContext): Row {
  const id = String(friend.person_id);
  return {
    id, name: friend.name, avatar_color: friend.avatar_color, mobile: friend.mobile ?? null,
    email: friend.email ?? null, upi_vpa: friend.upi_vpa ?? null,
    receivable_state: friend.receivable_status ?? 'expected', receivable_state_at: friend.receivable_status_at ?? null,
    remote_uid: friend.person_user_id ?? null, is_me: isMe(id, ctx) ? 1 : 0,
  };
}

/** My profile back into my own person row. */
export function profileToMe(profile: Row, ctx: MapContext): Row {
  return {
    id: me(ctx), name: profile.display_name, avatar_color: profile.avatar_color ?? null,
    mobile: profile.mobile ?? null, upi_vpa: profile.upi_vpa ?? null, remote_uid: ctx.userId, is_me: 1,
  };
}

/** Someone I only know through a group: the group's name for them. */
export function memberToPerson(member: Row, ctx: MapContext): Row {
  const id = String(member.person_id);
  return {
    id, name: member.display_name, avatar_color: member.avatar_color,
    remote_uid: member.person_user_id ?? null, is_me: isMe(id, ctx) ? 1 : 0,
  };
}

// ---------------------------------------------------------------------------
// Groups, membership, my view of a group
// ---------------------------------------------------------------------------

export function groupKind(g: Row): 'personal' | 'shared' | 'pair' {
  if (g.is_personal === 1) return 'personal';
  return g.pair_person_id ? 'pair' : 'shared';
}

export function groupToServer(g: Row): Outgoing {
  return {
    entity: 'groups', entityId: String(g.id),
    data: compact({
      kind: groupKind(g), name: g.name, icon: g.icon, color: g.color, simplify_debts: g.simplify_debt,
      default_split: g.default_split, carry_over: g.carry_over, created_at: g.created_at,
    }),
  };
}

export function groupPreferenceToServer(g: Row, ctx: MapContext): Outgoing {
  return {
    entity: 'group_preferences', entityId: syncIds.groupPreference(ctx.userId, String(g.id)),
    data: { group_id: g.id, is_archived: g.is_archived ?? 0 },
  };
}

/**
 * A server group back into the phone's row. `members` are the group's pulled
 * member rows — needed for the pair group's "friend this group is", which is the
 * OTHER member and so differs by who is looking.
 */
export function serverToGroup(g: Row, members: Row[], isArchived: number, ctx: MapContext): Row {
  const other = g.kind === 'pair'
    ? members.find(m => m.status === 'active' && !isMe(String(m.person_id), ctx))?.person_id ?? null
    : null;
  return {
    id: g.id, name: g.name, icon: g.icon, color: g.color, carry_over: g.carry_over ?? 0,
    is_personal: g.kind === 'personal' ? 1 : 0, simplify_debt: g.simplify_debts, default_split: g.default_split,
    created_at: g.created_at, created_by: g.owner_person_id ?? null, pair_person_id: other,
    is_archived: isArchived, updated_at: g.updated_at, deleted_at: g.deleted_at ?? null,
  };
}

export function memberToServer(m: Row, person: Row, ctx: MapContext): Outgoing {
  const personId = String(m.person_id);
  const ended = m.deleted_at != null;
  return {
    entity: 'group_members', entityId: syncIds.member(String(m.group_id), personId),
    data: {
      group_id: m.group_id, person_id: personId, display_name: person.name, avatar_color: person.avatar_color,
      role: m.role ?? 'member',
      // The phone cannot tell leaving from being removed; who the row is about can.
      status: ended ? (isMe(personId, ctx) ? 'left' : 'removed') : 'active',
      joined_at: m.joined_at ?? null, left_at: ended ? m.deleted_at : null,
    },
  };
}

/** A member row back into the phone's. Someone invited is listed, as invited — not left out, and not passed off as in. */
export function serverToMember(m: Row): Row {
  const ended = m.status === 'left' || m.status === 'removed';
  return {
    group_id: m.group_id, person_id: m.person_id, joined_at: m.joined_at ?? null, role: m.role,
    updated_at: m.updated_at, deleted_at: ended ? m.left_at : (m.deleted_at ?? null),
    invited: m.status === 'invited' ? 1 : 0,
  };
}

// ---------------------------------------------------------------------------
// Categories and budgets
// ---------------------------------------------------------------------------

export function categoryToServer(c: Row, ctx: MapContext): Outgoing {
  return {
    entity: 'categories', entityId: syncIds.category(ctx.userId, String(c.kind), String(c.name)),
    data: compact({ kind: c.kind, name: c.name, section: c.section ?? null, icon: c.icon ?? null, color: c.color ?? null }),
  };
}

/** A live category → a category row; a deleted one → the phone's tombstone. */
export function serverToCategory(c: Row): { category: Row } | { tombstone: Row } {
  if (c.deleted_at != null) return { tombstone: { name: c.name, kind: c.kind, created_at: c.deleted_at } };
  return { category: { id: c.id, group_id: null, name: c.name, icon: c.icon ?? null, color: c.color ?? null, kind: c.kind, section: c.section ?? null } };
}

export function budgetToServer(b: Row): Outgoing {
  const personId = (b.person_id ?? null) as string | null;
  return {
    entity: 'budgets', entityId: syncIds.budget(String(b.group_id), String(b.category), personId),
    data: { group_id: b.group_id, category: b.category, cadence: b.cadence ?? 'monthly', amount: b.amount, person_id: personId },
  };
}

export function serverToBudget(b: Row): Row {
  return {
    id: b.id, group_id: b.group_id, category: b.category, period: 'monthly',
    amount: b.amount, cadence: b.cadence, person_id: b.person_id ?? null,
  };
}

// ---------------------------------------------------------------------------
// Money profile (settings money.*) and preferences
// ---------------------------------------------------------------------------

/** settings key → money_profiles column. `money.investments` is derived from assets and never travels. */
export const MONEY_KEYS: Record<string, string> = {
  'money.opening_cash': 'opening_cash',
  'money.opening_bank': 'opening_bank',
  'money.opening_wallet': 'opening_wallet',
  'money.credit_limit': 'credit_limit',
  'money.credit_used': 'credit_used',
  'money.card_baseline_at': 'card_baseline_at',
  'money.updated_at': 'stated_at',
};

export function moneyProfileToServer(settings: Record<string, string>, ctx: MapContext): Outgoing | null {
  const data: Row = {};
  for (const [key, col] of Object.entries(MONEY_KEYS)) {
    if (settings[key] === undefined) continue;
    const n = Number(settings[key]);
    if (Number.isFinite(n)) data[col] = n;
  }
  if (Object.keys(data).length === 0) return null;
  return { entity: 'money_profiles', entityId: syncIds.moneyProfile(ctx.userId), data };
}

export function serverToMoneySettings(p: Row): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, col] of Object.entries(MONEY_KEYS)) {
    const v = num(p[col]);
    if (v !== null) out[key] = String(v);
  }
  return out;
}

export function preferenceToServer(key: string, value: string, ctx: MapContext): Outgoing {
  return { entity: 'user_preferences', entityId: syncIds.preference(ctx.userId, key), data: { key, value } };
}

// ---------------------------------------------------------------------------
// The transaction bundle
// ---------------------------------------------------------------------------

export type LocalBundle = {
  txn: Row;
  payments: Row[];
  shares: Row[];
  items: Row[];
  skips: number[];
};

export function txnToServer(b: LocalBundle, ctx: MapContext): Outgoing {
  const t = b.txn;
  const amount = b.payments.reduce((a, p) => a + (num(p.amount) ?? 0), 0);
  const recurrence = t.recur_freq
    ? compact({
      frequency: t.recur_freq,
      interval: num(t.recur_interval) ?? undefined,     // NULL means 1: let the server's default say so
      ends_at: t.recur_end ?? null,
      status: t.recur_state ?? 'active',
      mode: t.recur_mode ?? 'auto',
      paused_at: t.recur_paused_at ?? null,
    })
    : null;
  void ctx;
  return {
    entity: 'transactions', entityId: String(t.id),
    data: compact({
      group_id: t.group_id, kind: t.kind, entry_mode: t.entry_mode, amount, date: t.date,
      timezone: t.tz ?? null, category: t.category, note: t.note ?? null, pay_method: t.pay_method ?? null,
      source: t.source ?? null,
      currency: str(t.currency) ?? undefined,           // NULL means INR: let the server's default say so
      asset_id: t.asset_id ?? null, latitude: t.lat ?? null, longitude: t.lng ?? null,
      place_label: t.place_label ?? null, adjustments: t.adjustments ?? null,
      recurring_rule_id: t.parent_recur_id ?? null, occurrence_date: t.recur_override_date ?? null,
      created_at: t.created_at,
      payers: b.payments.map(p => ({ person_id: p.person_id, amount: p.amount })),
      splits: b.shares.map(s => ({ person_id: s.person_id, amount: s.amount })),
      items: b.items.map(i => compact({
        id: i.id, name: i.name, quantity: i.qty, unit_price: i.unit_price, assigned_to: i.assigned_to,
        split_mode: i.split_mode ?? null, split_values: i.split_values ?? null,
      })),
      tags: parseTags(str(t.tags)),
      recurrence,
      skips: recurrence ? b.skips : undefined,
    }),
  };
}

/** A pulled transaction bundle back into the phone's rows. */
export function serverToTxn(t: Row, ctx: MapContext): LocalBundle {
  const rule = t.recurrence as Row | null | undefined;
  const author = str(t.author_id);
  return {
    txn: {
      id: t.id, group_id: t.group_id, kind: t.kind, entry_mode: t.entry_mode, date: t.date,
      category: t.category, note: t.note ?? null, tags: serializeTags((t.tags as string[] | undefined) ?? []),
      adjustments: t.adjustments ?? null,
      recur_freq: rule ? rule.frequency : null,
      recur_interval: rule ? rule.interval ?? 1 : null,
      recur_end: rule ? rule.ends_at ?? null : null,
      recur_override_date: t.occurrence_date ?? null,
      parent_recur_id: t.recurring_rule_id ?? null,
      recur_state: rule ? rule.status : 'active',
      recur_paused_at: rule ? rule.paused_at ?? null : null,
      recur_mode: rule ? rule.mode : 'auto',
      tz: t.timezone ?? null, lat: t.latitude ?? null, lng: t.longitude ?? null, place_label: t.place_label ?? null,
      pay_method: t.pay_method ?? null,
      currency: t.currency === 'INR' ? null : (t.currency ?? null),
      source: t.source ?? null, asset_id: t.asset_id ?? null,
      author_person_id: author && !isMe(author, ctx) ? author : null,
      is_deleted: t.deleted_at != null ? 1 : 0,
      created_at: t.created_at, updated_at: t.updated_at,
    },
    payments: ((t.payers as Row[] | undefined) ?? []).map(p => ({ txn_id: t.id, person_id: p.person_id, amount: p.amount })),
    shares: ((t.splits as Row[] | undefined) ?? []).map(s => ({ txn_id: t.id, person_id: s.person_id, amount: s.amount })),
    items: ((t.items as Row[] | undefined) ?? []).map(i => ({
      id: i.id, txn_id: t.id, name: i.name, qty: i.quantity, unit_price: i.unit_price, assigned_to: i.assigned_to,
      split_mode: i.split_mode ?? null, split_values: i.split_values ?? null,
    })),
    skips: ((t.skips as number[] | undefined) ?? []),
  };
}

// ---------------------------------------------------------------------------
// Written by the server, read by the phone: approvals, disputes, the feed
// ---------------------------------------------------------------------------

export function serverToApproval(a: Row): Row {
  // The server re-opens an accepted entry its author deleted as a pending delete.
  // Here it keeps counting until I agree (`DQ-31`): that is 'approved' plus the
  // flag, never 'pending', which would drop it from my figures before I'd said so.
  const retraction = Number(a.is_pending_delete ?? 0) === 1;
  return {
    txn_id: a.transaction_id, state: retraction ? 'approved' : a.status, landed_pay_method: a.landed_pay_method ?? null,
    created_at: a.arrived_at, decided_at: a.decided_at ?? null, dispute_state: null,
    pending_delete: a.is_pending_delete ?? 0,
  };
}

export function serverToDispute(d: Row): Row {
  return {
    txn_id: d.transaction_id, by_uid: d.user_id, version: d.transaction_version,
    created_at: d.raised_at, cleared: d.withdrawn_at != null ? 1 : 0,
  };
}

export function serverToAudit(a: Row, scopeKind: 'user' | 'group', ctx: MapContext): Row {
  const actor = str(a.actor_person_id);
  return {
    id: a.id, entity_type: a.entity, entity_id: a.entity_id,
    group_id: scopeKind === 'group' ? a.scope_id : null,
    action: a.action, summary: a.summary, amount: a.amount ?? null, created_at: a.created_at,
    actor_person_id: actor && !isMe(actor, ctx) ? actor : null,
  };
}

/** The phone's own audit row, carried on a mutation so the feed row reuses its id and text. */
export function auditToServer(a: Row): Row {
  return { id: a.id, summary: a.summary };
}
