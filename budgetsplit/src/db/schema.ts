import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { CATEGORY_SECTIONS, INCOME_SECTIONS, TRANSFER_SECTIONS } from '../constants/categories';
import { seedGlobalCategories } from './seedCategories';

/**
 * Exported so tests can build the REAL schema instead of a hand-written subset —
 * a subset is one more thing that drifts from the code it is meant to verify.
 * See `src/__tests__/helpers/testDb.ts`.
 */
export const SCHEMA = `
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS person (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  avatar_color  TEXT NOT NULL,
  is_me         INTEGER NOT NULL DEFAULT 0,
  email         TEXT,
  mobile        TEXT,
  remote_uid    TEXT,
  image_uri     TEXT,
  upi_vpa       TEXT
);

CREATE TABLE IF NOT EXISTS budget_group (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  icon           TEXT NOT NULL,
  color          TEXT NOT NULL,
  limit_daily    INTEGER,
  limit_monthly  INTEGER,
  limit_yearly   INTEGER,
  carry_over     INTEGER NOT NULL DEFAULT 0,
  is_shared      INTEGER NOT NULL DEFAULT 0,
  is_archived    INTEGER NOT NULL DEFAULT 0,
  is_personal    INTEGER NOT NULL DEFAULT 0,
  simplify_debt  INTEGER NOT NULL DEFAULT 1,
  default_split  TEXT NOT NULL DEFAULT 'equal' CHECK(default_split IN ('equal','exact','percent','shares')),
  created_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS group_member (
  group_id   TEXT NOT NULL REFERENCES budget_group(id),
  person_id  TEXT NOT NULL REFERENCES person(id),
  joined_at  INTEGER,                       -- when this person joined the group (epoch ms)
  PRIMARY KEY (group_id, person_id)
);

CREATE TABLE IF NOT EXISTS txn (
  id             TEXT PRIMARY KEY,
  group_id       TEXT NOT NULL REFERENCES budget_group(id),
  kind           TEXT NOT NULL CHECK(kind IN ('income','expense','settlement')),
  entry_mode     TEXT NOT NULL CHECK(entry_mode IN ('quick','itemized')),
  date           INTEGER NOT NULL,
  category       TEXT NOT NULL,
  note           TEXT,
  attachment_uri TEXT,
  tags           TEXT,
  adjustments    TEXT,
  recur_freq     TEXT CHECK(recur_freq IN ('daily','weekly','monthly','yearly','custom')),
  recur_interval INTEGER,
  recur_end      INTEGER,
  recur_override_date INTEGER,
  parent_recur_id TEXT,
  recur_state    TEXT NOT NULL DEFAULT 'active' CHECK(recur_state IN ('active','paused','ended')),
  tz             TEXT,
  lat            REAL,
  lng            REAL,
  place_label    TEXT,
  pay_method     TEXT,
  is_deleted     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS recur_skip (
  series_id       TEXT NOT NULL REFERENCES txn(id),
  occurrence_date INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  PRIMARY KEY (series_id, occurrence_date)
);

CREATE TABLE IF NOT EXISTS txn_payment (
  txn_id     TEXT NOT NULL REFERENCES txn(id),
  person_id  TEXT NOT NULL REFERENCES person(id),
  amount     INTEGER NOT NULL,
  PRIMARY KEY (txn_id, person_id)
);

CREATE TABLE IF NOT EXISTS txn_share (
  txn_id     TEXT NOT NULL REFERENCES txn(id),
  person_id  TEXT NOT NULL REFERENCES person(id),
  amount     INTEGER NOT NULL,
  PRIMARY KEY (txn_id, person_id)
);

CREATE TABLE IF NOT EXISTS line_item (
  id           TEXT PRIMARY KEY,
  txn_id       TEXT NOT NULL REFERENCES txn(id),
  name         TEXT NOT NULL,
  qty          INTEGER NOT NULL DEFAULT 1,
  unit_price   INTEGER NOT NULL,
  assigned_to  TEXT NOT NULL,
  split_mode   TEXT,          -- per-item split mode (equal/exact/percent/shares); NULL = equal
  split_values TEXT           -- JSON: per-member raw input for non-equal modes
);

-- Categories are a single GLOBAL catalog per kind (group_id NULL = global).
-- UNIQUE(name, kind) keeps one row per name within a kind.
CREATE TABLE IF NOT EXISTS category (
  id        TEXT PRIMARY KEY,
  group_id  TEXT REFERENCES budget_group(id),
  name      TEXT NOT NULL,
  icon      TEXT,
  color     TEXT,
  kind      TEXT NOT NULL DEFAULT 'expense' CHECK(kind IN ('expense','income','transfer')),
  section   TEXT,
  UNIQUE(name, kind)
);

-- Categories the user deleted. The default catalog is re-seeded on every open
-- by seedGlobalCategories, so a delete with no record of itself was undone on the
-- next launch. Keyed on (name, kind) rather than id, because the reseed mints a
-- fresh uuid each time. Re-creating a category by hand clears its tombstone.
CREATE TABLE IF NOT EXISTS category_tombstone (
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (name, kind)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- No UNIQUE here. Uniqueness is two partial indexes (see INDEXES), because it has to
-- differ by level: one group default per category, one override per person per
-- category. A table-level UNIQUE(group_id, category, period) cannot express that —
-- it blocks the override row outright — and adding person_id to it would enforce
-- nothing at the default level, since SQL treats NULLs as distinct.
CREATE TABLE IF NOT EXISTS category_budget (
  id        TEXT PRIMARY KEY,
  group_id  TEXT NOT NULL REFERENCES budget_group(id),
  category  TEXT NOT NULL,
  period    TEXT NOT NULL DEFAULT 'monthly' CHECK(period IN ('monthly','yearly')),
  amount    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  group_id    TEXT,
  action      TEXT NOT NULL,
  summary     TEXT NOT NULL,
  amount      INTEGER,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_group   ON audit_log(group_id);

-- Savings Goals / Bucket List. Kept entirely separate from budgets: money lives
-- in the Savings Pool and is earmarked to goals; it never inflates a budget.
CREATE TABLE IF NOT EXISTS savings_goal (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  target       INTEGER NOT NULL,        -- paise
  -- Protect-from-raid classification, NOT the funding order (that's sort_order
  -- below). 'emergency' goals are never raid-eligible; 'want' is raided before
  -- 'need'. See planOverspendRaid (savingsEngine.ts).
  priority     TEXT NOT NULL DEFAULT 'need' CHECK(priority IN ('emergency','need','want')),
  category     TEXT,
  icon         TEXT,
  color        TEXT,
  allocation   INTEGER NOT NULL DEFAULT 0,  -- fixed savings allocation per frequency (paise)
  frequency    TEXT NOT NULL DEFAULT 'none' CHECK(frequency IN ('daily','weekly','monthly','yearly','none')),
  locked       INTEGER NOT NULL DEFAULT 0,  -- protect from auto-reallocation
  is_archived  INTEGER NOT NULL DEFAULT 0,
  last_auto_at INTEGER,                      -- schedule anchor for auto-funding
  target_date  INTEGER,                      -- optional deadline (epoch ms) → "needed/mo" + countdown
  sort_order   INTEGER NOT NULL DEFAULT 0,   -- manual drag rank → funding order (lower = funded first)
  created_at   INTEGER NOT NULL
);

-- Savings ledger. goal_id NULL = a pool-level deposit/withdrawal.
--   deposit  → money into the pool (manual top-up or auto-sweep)
--   allocate → pool → goal (earmark)
--   withdraw → goal → pool (deallocate) or pool → out (goal_id NULL)
CREATE TABLE IF NOT EXISTS savings_txn (
  id          TEXT PRIMARY KEY,
  goal_id     TEXT,
  amount      INTEGER NOT NULL,         -- paise (positive)
  kind        TEXT NOT NULL CHECK(kind IN ('deposit','allocate','withdraw')),
  source      TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','auto')),
  date        INTEGER NOT NULL,
  note        TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_savings_txn_goal ON savings_txn(goal_id);

-- Imported rows awaiting Review (Import → Review inbox). Heuristically parsed from
-- a pasted statement; the user classifies each, then it becomes a real txn (and is
-- deleted here) or is discarded. Never feeds balances/budgets until confirmed.
CREATE TABLE IF NOT EXISTS pending_txn (
  id          TEXT PRIMARY KEY,
  date        INTEGER NOT NULL,
  amount      INTEGER NOT NULL,            -- paise (positive)
  description TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK(kind IN ('income','expense','settlement')),
  category    TEXT,                        -- suggested category (may be null)
  direction   TEXT NOT NULL DEFAULT 'unknown' CHECK(direction IN ('debit','credit','unknown')),
  raw         TEXT,
  created_at  INTEGER NOT NULL,
  dest_group_id TEXT,                       -- Review draft: target group (null = Personal)
  split_draft   TEXT,                       -- Review draft: JSON {included, mode, values}
  counterparty_id TEXT,                     -- Review draft: the other person on a group transfer
  source      TEXT NOT NULL DEFAULT 'manual', -- where it came from (email/gpay/bank_csv/…); drives sectioned Review
  pay_method  TEXT,                         -- detected payment method (upi/card/…); pre-filled in Review, editable
  lat         REAL,                         -- where it happened, when the import knows (Scan & Pay does)
  lng         REAL,
  place_label TEXT                           -- reverse-geocoded name, e.g. "Cyber Hub, Gurgaon"
);
CREATE INDEX IF NOT EXISTS idx_pending_created ON pending_txn(created_at);

-- MY decision about an entry someone else wrote.
--
-- Keyed on txn_id and deliberately NOT a column on txn_share/txn_payment: both
-- of those are DELETEd and re-INSERTed wholesale on every edit
-- (transactions.ts:466-468, :687-688), so approval state stored there would be
-- silently erased by an ordinary edit — an entry that quietly starts counting,
-- or quietly stops.
--
-- Absent means approved. Every row that exists today, and everything I write
-- myself, has no row here — which is what makes the whole feature a no-op until
-- a peer write path exists.
--
-- Device-local: this is my opinion of someone else's assertion and must never
-- travel to them. It IS included in backup, though — restoring my own device
-- must not silently approve a queue I had left waiting.
CREATE TABLE IF NOT EXISTS txn_approval (
  txn_id     TEXT PRIMARY KEY REFERENCES txn(id),
  state      TEXT NOT NULL CHECK(state IN ('pending','approved','rejected')),
  -- Where the money actually landed for ME, on an incoming transfer.
  -- The sender says how they sent it; only the recipient knows where it arrived,
  -- and the two are routinely different (sent by UPI, landed in a bank account).
  -- Recorded here rather than overwriting their claim, because this is my side of
  -- their assertion — which is exactly what this table is.
  landed_pay_method TEXT,
  -- When it ARRIVED, not when it happened. The queue sorts on this so a peer
  -- cannot bury an entry by back-dating it.
  created_at INTEGER NOT NULL,
  decided_at INTEGER
);
`;

/**
 * Columns added after v1 shipped. SQLite has no `ADD COLUMN IF NOT EXISTS`,
 * so each ALTER is wrapped — a duplicate-column error means it already exists.
 */
export const COLUMN_MIGRATIONS = [
  "ALTER TABLE budget_group ADD COLUMN is_personal INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE budget_group ADD COLUMN simplify_debt INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE txn ADD COLUMN recur_state TEXT NOT NULL DEFAULT 'active'",
  // Budget v5: each category budget carries its own cadence.
  "ALTER TABLE category_budget ADD COLUMN cadence TEXT NOT NULL DEFAULT 'monthly'",
  // v2: unique user identity + transaction metadata (timezone, optional location).
  "ALTER TABLE person ADD COLUMN email TEXT",
  "ALTER TABLE person ADD COLUMN mobile TEXT",
  "ALTER TABLE txn ADD COLUMN tz TEXT",
  "ALTER TABLE txn ADD COLUMN lat REAL",
  "ALTER TABLE txn ADD COLUMN lng REAL",
  "ALTER TABLE txn ADD COLUMN place_label TEXT",
  // Income gets its own category set (Phase G).
  "ALTER TABLE category ADD COLUMN kind TEXT NOT NULL DEFAULT 'expense'",
  // v2: multi-currency — default null means app-wide default (INR).
  "ALTER TABLE txn ADD COLUMN currency TEXT",
  "ALTER TABLE budget_group ADD COLUMN default_currency TEXT",
  // v3: section persists where a category belongs (custom categories no longer lost).
  "ALTER TABLE category ADD COLUMN section TEXT",
  // Savings auto-funding: per-goal schedule anchor.
  "ALTER TABLE savings_goal ADD COLUMN last_auto_at INTEGER",
  // Avatar photos for the user & friends (local file path; null = use initials).
  "ALTER TABLE person ADD COLUMN image_uri TEXT",
  // UPI handle, so a settle-up can hand off to the payer's own UPI app.
  // Its own column, not `mobile`: a VPA is not a phone number.
  "ALTER TABLE person ADD COLUMN upi_vpa TEXT",
  // Itemized bills persist their tax/tip/discount adjustments so they round-trip on edit.
  "ALTER TABLE txn ADD COLUMN adjustments TEXT",
  // Recurring occurrences materialize into real rows linked back to their rule.
  "ALTER TABLE txn ADD COLUMN parent_recur_id TEXT",
  // Settlements record how they were paid (upi/cash/bank) as a real field, not a note.
  "ALTER TABLE txn ADD COLUMN pay_method TEXT",
  // Savings goals can carry an optional deadline → needed-per-month + countdown.
  "ALTER TABLE savings_goal ADD COLUMN target_date INTEGER",
  // Manual drag rank → funding order (lower = funded first). Replaces priority buckets.
  "ALTER TABLE savings_goal ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
  // When a person joined a group → "Joined {month year}" on the Members sub-tab.
  "ALTER TABLE group_member ADD COLUMN joined_at INTEGER",
  // A group's default split mode, picked at creation → seeds the Add-expense split.
  "ALTER TABLE budget_group ADD COLUMN default_split TEXT NOT NULL DEFAULT 'equal'",
  // Per-item split mode/values so an itemized bill round-trips its splits on edit.
  "ALTER TABLE line_item ADD COLUMN split_mode TEXT",
  "ALTER TABLE line_item ADD COLUMN split_values TEXT",
  // Review redesign: pending rows auto-save their in-progress draft (target group +
  // split) so a half-reviewed inbox survives leaving and returning to the screen.
  "ALTER TABLE pending_txn ADD COLUMN dest_group_id TEXT",
  "ALTER TABLE pending_txn ADD COLUMN split_draft TEXT",
  // Review can turn an imported transfer into a real settlement with a group
  // member; this holds that person until the row is confirmed.
  "ALTER TABLE pending_txn ADD COLUMN counterparty_id TEXT",
  // NOTE: `is_demo` used to be added to five tables here and stamped by
  // loadDemoData, as a marker for a demo-exclusion feature that was never built.
  // Nothing ever read it, so it looked like a safety mechanism while excluding
  // nothing from exports or reports. Removed rather than left as a false promise.
  // Databases created before this keep an unused column — harmless, and cheaper
  // than a five-table rebuild. Demo data is wiped by "erase all data", not filtered.
  // P4.1 ingestion: where a pending row came from (sectioned Review) + its detected
  // payment method. Additive — pre-existing rows default to 'manual' / null.
  "ALTER TABLE pending_txn ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'",
  "ALTER TABLE pending_txn ADD COLUMN pay_method TEXT",
  // Scan & Pay captures where the payment happened, which `txn` has held since v2 but
  // `pending_txn` did not — so a scanned payment lost its location on the way through
  // Review, the one import where we actually know it first-hand. Additive; pre-existing
  // rows stay null, which is indistinguishable from "capture was denied or failed".
  "ALTER TABLE pending_txn ADD COLUMN lat REAL",
  "ALTER TABLE pending_txn ADD COLUMN lng REAL",
  "ALTER TABLE pending_txn ADD COLUMN place_label TEXT",
  // Where a *saved* transaction came from. `pending_txn` has carried this since P4.1, but
  // `txn` never has — so provenance was destroyed the moment any import was confirmed, and
  // an email alert, a Paytm statement row and a hand-typed expense became indistinguishable.
  // Voice capture is what forced the issue (an auto-saved row must be able to say it was
  // spoken, not typed), but the gap was never voice-specific.
  // Nullable with no default: null means "typed by hand", which is what every existing row is.
  "ALTER TABLE txn ADD COLUMN source TEXT",
  // When a recurring rule was paused. Pause used to stamp `recur_end = now`, which
  // *overwrote the user's own end date* — of which there is no other copy — and
  // resume then set it to NULL, so a rule set to "end 31 Dec" recurred forever.
  // `recur_state` alone already gates materialization, so pause has no reason to
  // touch `recur_end` at all; this column exists so resume knows which occurrences
  // fell inside the gap and can skip them instead of back-posting the lot.
  "ALTER TABLE txn ADD COLUMN recur_paused_at INTEGER",
  // Who created the group. There was no owner concept at all, so nothing could be
  // gated on one. Backfilled below to the `is_me` person, which is true by
  // construction: every group on this device was created by you.
  "ALTER TABLE budget_group ADD COLUMN created_by TEXT",
  // Per-member role: 'admin' or 'member'. There is no separate 'owner' role — the
  // creator is identified by `budget_group.created_by`, is always treated as an
  // admin, and cannot be demoted or removed by anyone. Keeping creator-ness out of
  // the role column is what makes that guarantee un-loseable: a role can be edited,
  // `created_by` never is.
  "ALTER TABLE group_member ADD COLUMN role TEXT NOT NULL DEFAULT 'member'",
  // NULL = the group's default budget line (what every existing row is, so this is
  // additive with no data migration). Non-NULL = that person's override.
  "ALTER TABLE category_budget ADD COLUMN person_id TEXT",
  // Whether money this person owes me should still be counted as cover.
  //
  // 'expected' (the default, and what every existing row is) means it offsets a
  // shortfall before a savings goal is liquidated, and nets against what I owe in
  // the health score. 'written_off' means I've decided it isn't coming back: the
  // debt is still owed and still shown — this is NOT a settlement — it just stops
  // counting as an asset.
  //
  // Per person, not per balance, because there IS no balance row: every balance is
  // derived per read from txn_payment/txn_share. Staleness stays derived too (age
  // against that person's own settle rhythm) — only the deliberate write-off is
  // stored, because only that is a decision.
  "ALTER TABLE person ADD COLUMN receivable_state TEXT NOT NULL DEFAULT 'expected'",
  "ALTER TABLE person ADD COLUMN receivable_state_at INTEGER",
  // Sync groundwork, deliberately schema-only — nothing reads these yet.
  //
  // AGENTS §13: when sync exists, an entry takes effect immediately for whoever
  // created it and waits for approval from everyone else it touches. Answering
  // "who wrote this, and who does it say paid" needs both facts on the row, and a
  // pending row lives HERE rather than in `txn` behind a status flag — nothing
  // reads `pending_txn`, so every existing read path stays correct untouched,
  // whereas a flag would need `AND status='approved'` on ~40 of them and missing
  // one breaks the rule silently in that surface alone.
  //
  // Added now because they cost nothing now and a migration later.
  "ALTER TABLE pending_txn ADD COLUMN author_person_id TEXT",
  "ALTER TABLE pending_txn ADD COLUMN payer_person_id TEXT",
  // Who wrote this entry. NULL = me, on this device, which is every existing row
  // — so this is additive with no data migration. Authorship is permanent and
  // belongs on the entry itself; my *opinion* of it lives in `txn_approval`.
  "ALTER TABLE txn ADD COLUMN author_person_id TEXT",
  // Whether this person's entries reach my ledger without my approval.
  // See TRUST_STATE in constants/enums.ts for why it is per person and why the
  // default is 'review'. Inert for anyone with no account (`remote_uid IS NULL`),
  // which today is everyone.
  "ALTER TABLE person ADD COLUMN trust_state TEXT NOT NULL DEFAULT 'review'",
  "ALTER TABLE person ADD COLUMN trust_state_at INTEGER",
  // What a due recurring rule does: post itself, or wait to be logged.
  // Default 'auto' so every rule that already exists behaves exactly as it did —
  // this column can only change behaviour for rules created after it. See
  // RECUR_MODE in constants/enums.ts for why income and transfers default the
  // other way at creation.
  "ALTER TABLE txn ADD COLUMN recur_mode TEXT NOT NULL DEFAULT 'auto'",
  // Sync prerequisites, schema-only — nothing reads these yet.
  //
  // When shared groups sync, the unit that travels is the ENTRY (a `txn` plus its
  // payments, shares and line items, as one document versioned by
  // `txn.updated_at`), because those child rows are never mutated apart from their
  // parent. That leaves exactly two other things that have to travel: the group
  // itself and its membership. Both are currently HARD deleted
  // (`groups.ts` deleteGroup, `persons.ts` removeMemberFromGroup), and a hard
  // delete cannot propagate — the other device keeps the row and pushes it back.
  //
  // Added now because they cost nothing now and a migration across every write
  // path later. `budget_group` and `group_member` are not hand-rebuilt tables, so
  // unlike `txn` there is no rebuild column list to keep in step.
  "ALTER TABLE budget_group ADD COLUMN updated_at INTEGER",
  "ALTER TABLE budget_group ADD COLUMN deleted_at INTEGER",
  "ALTER TABLE group_member ADD COLUMN updated_at INTEGER",
  "ALTER TABLE group_member ADD COLUMN deleted_at INTEGER",
  // Added after txn_approval shipped, so the CREATE above only covers fresh
  // databases — this covers one that already ran the earlier build.
  "ALTER TABLE txn_approval ADD COLUMN landed_pay_method TEXT",
];

/**
 * One-time DATA fixes (not schema changes) that must run at most once per
 * database. Unlike the ALTERs above — which are naturally idempotent because a
 * duplicate column just errors — these reclassify or DELETE rows, so re-running
 * them undoes whatever the user did afterwards. While they ran unconditionally,
 * a user who recreated a "Subscriptions" category had it silently deleted on the
 * next launch.
 *
 * Completion is recorded in the `settings` table, the same mechanism the
 * category-global migration already used. Add a NEW key for a new fix; never
 * reuse or rename one, or it will re-run on every existing install.
 *
 * Kept as data (not inline `execAsync` calls) so `schemaFixes.test.ts` can run
 * the real SQL against an in-process SQLite and prove that a second pass leaves
 * user data alone — the same reason `cashQuery.ts` exports its SQL.
 */
export const ONE_TIME_FIXES: { key: string; sql: string[] }[] = [
  // 'wallet' is not a valid Feather icon.
  {
    key: 'fix_wallet_icon_v1',
    sql: ["UPDATE budget_group SET icon='credit-card' WHERE icon='wallet'"],
  },
  // Savings Pool removed: goals are now funded directly from cash. Drop the old
  // pool-level ledger rows (goal_id IS NULL = deposits/withdrawals to the pool).
  // Per-goal balances (goal_id NOT NULL) are untouched; any unallocated pool
  // money simply stops being "set aside" and folds back into Cash available.
  {
    key: 'fix_drop_savings_pool_v1',
    sql: ['DELETE FROM savings_txn WHERE goal_id IS NULL'],
  },
  // 'Subscriptions' is no longer a *seeded* category — a subscription is a
  // recurring billing pattern, and its spend belongs to a normal category (e.g.
  // Entertainment). Reclassify existing transactions, drop now-orphaned
  // Subscriptions budgets, then remove the seeded category. Guarded because a
  // user is free to create their own "Subscriptions" category afterwards, and it
  // must survive every later launch.
  {
    key: 'fix_subscriptions_category_v1',
    sql: [
      "UPDATE txn SET category='Entertainment' WHERE category='Subscriptions'",
      "DELETE FROM category_budget WHERE category='Subscriptions'",
      "DELETE FROM category WHERE name='Subscriptions'",
    ],
  },
  // The 'once' budget cadence is gone (see BUDGET_CADENCE in constants/enums).
  // It was a pool at every target, so it never reached a headline, and its spend
  // window ran from the epoch, so it never reset — a crossed line stayed red
  // forever. Converted rather than deleted: the amount the user typed is real,
  // and 'yearly' is the coarsest cadence that still resets and still rolls up
  // (into the Year view). The settings row holding it as a *default* is narrowed
  // in code by `asBudgetCadence`, since it lives in the key/value settings table.
  {
    key: 'fix_drop_once_cadence_v1',
    sql: ["UPDATE category_budget SET cadence='yearly' WHERE cadence='once'"],
  },
  // Legacy repair: the seeded Personal group (oldest) is the single-user space.
  // New databases don't need it — seedIfNeeded/createMeAndPersonal already insert
  // the Personal group with is_personal=1.
  {
    key: 'fix_personal_group_v1',
    sql: ['UPDATE budget_group SET is_personal=1 WHERE id=(SELECT id FROM budget_group ORDER BY created_at ASC LIMIT 1)'],
  },
  // NOTE: a fix here used to stamp a hardcoded placeholder address
  // ('hello123@vortiqal.com') onto the local user. Nothing reads person.email —
  // the app has no accounts — so it was a stray literal in a shipping data path.
  // Removed, along with the matching write in seed.ts. The column stays for the
  // day identity is real; it is simply left NULL. Do not reuse this key.
  // Reclassify legacy income-named categories before the global dedupe, so a
  // legacy 'Salary' (seeded as expense) merges into the income catalog. Guarded
  // both because it is a one-time repair and because re-running it would flip a
  // user's own same-named expense category and trip UNIQUE(name, kind).
  {
    key: 'fix_income_category_kind_v1',
    sql: ["UPDATE category SET kind='income' WHERE name IN ('Salary','Freelance','Refunds','Business','Interest','Dividends','Rent Received','Bonus','Cashback','Gifts Received','Other Income')"],
  },
  // Groups predate the owner/role concept entirely. Every group on this device was
  // created by the `is_me` person — there is no other user yet — so that is not a
  // guess, it is the only possibility. Their membership row becomes 'admin'.
  {
    key: 'fix_group_creator_roles_v1',
    sql: [
      "UPDATE budget_group SET created_by = (SELECT id FROM person WHERE is_me = 1) WHERE created_by IS NULL",
      // Correlated on the group's own creator rather than on `is_me`, so this stays
      // correct if it ever runs on a database that has more than one person's groups.
      "UPDATE group_member SET role = 'admin' WHERE person_id = (SELECT created_by FROM budget_group WHERE id = group_member.group_id)",
    ],
  },
  /*
   * Repair groups created between `d087d18` and `0a9dd37`.
   *
   * `insertGroup` took `creatorId` as an optional and every caller omitted it, so
   * groups made in that window got `created_by = NULL` and no member with the
   * 'admin' role — leaving them permanently unadministrable: every budget edit and
   * membership change was refused, correctly, by a gate nobody could satisfy.
   *
   * Same SQL as v1 and deliberately a NEW key: v1 had already run on these
   * databases *before* the broken groups existed, and a one-time fix does not
   * revisit. Safe to re-run in the sense that matters — it only touches rows that
   * are still NULL, so a group whose creator was recorded correctly is untouched.
   *
   * The membership INSERT is the part v1 lacked: a creator who is not in
   * `group_member` gets no admin row from the UPDATE alone, and a group with an
   * admin who is not a member is the same dead end in a different shape.
   */
  {
    key: 'fix_group_creator_roles_v2',
    sql: [
      "UPDATE budget_group SET created_by = (SELECT id FROM person WHERE is_me = 1) WHERE created_by IS NULL",
      `INSERT OR IGNORE INTO group_member (group_id, person_id, joined_at, role)
         SELECT g.id, g.created_by, g.created_at, 'admin'
           FROM budget_group g
          WHERE g.created_by IS NOT NULL`,
      "UPDATE group_member SET role = 'admin' WHERE person_id = (SELECT created_by FROM budget_group WHERE id = group_member.group_id)",
    ],
  },
];

/**
 * Apply every fix this database hasn't had yet, recording each key as it lands.
 * A failure leaves that key unwritten so the fix retries on the next launch.
 * Engine-agnostic (callbacks, not a driver) so the test can drive it with
 * `node:sqlite`. Returns the keys applied on this run.
 */
export async function applyOneTimeFixes(
  loadApplied: () => Promise<Set<string>>,
  exec: (sql: string) => Promise<void>,
  markApplied: (key: string) => Promise<void>,
): Promise<string[]> {
  const applied = await loadApplied();
  const ran: string[] = [];
  for (const fix of ONE_TIME_FIXES) {
    if (applied.has(fix.key)) continue;
    for (const sql of fix.sql) await exec(sql);
    await markApplied(fix.key);
    ran.push(fix.key);
  }
  return ran;
}

/**
 * Phase GC: collapse the per-group `category` rows into a single GLOBAL catalog
 * (group_id NULL = global), deduped by (name, kind). Exported so the test that
 * proves this survives a *populated* pre-migration database
 * (categoryGlobalMigration.test.ts) runs the same SQL `openDB` runs — not a
 * hand-copied stand-in that could silently drift from it.
 *
 * Safe by construction for every other table: `txn.category` and
 * `category_budget.category` are plain name strings, never a foreign key to
 * `category.id`, so recreating this table with fresh ids/no group_id cannot
 * orphan a transaction or a budget line. `GROUP BY name, kind` keeps kinds
 * separate on purpose — `Rent`/`Other` are seeded as both `expense` and
 * `transfer`, and collapsing across kind would fold two real categories into
 * one (see `TXN_KIND_FOR_CATEGORY`).
 */
export const CATEGORY_GLOBAL_V1_SQL = `
  PRAGMA foreign_keys=OFF;
  BEGIN TRANSACTION;
  CREATE TABLE category_g (
    id        TEXT PRIMARY KEY,
    group_id  TEXT REFERENCES budget_group(id),
    name      TEXT NOT NULL,
    icon      TEXT,
    color     TEXT,
    kind      TEXT NOT NULL DEFAULT 'expense' CHECK(kind IN ('expense','income','transfer')),
    section   TEXT,
    UNIQUE(name, kind)
  );
  INSERT INTO category_g (id, group_id, name, icon, color, kind, section)
    SELECT id, NULL, name, icon, color, kind, section FROM category GROUP BY name, kind;
  DROP TABLE category;
  ALTER TABLE category_g RENAME TO category;
  COMMIT;
  PRAGMA foreign_keys=ON;
`;

/**
 * Runs `CATEGORY_GLOBAL_V1_SQL` at most once, engine-agnostic (callbacks, not a
 * driver) so the test can drive it with `node:sqlite` exactly like
 * `applyOneTimeFixes`. Returns whether it ran.
 */
export async function applyCategoryGlobalMigration(
  isDone: () => Promise<boolean>,
  exec: (sql: string) => Promise<void>,
  markDone: () => Promise<void>,
): Promise<boolean> {
  if (await isDone()) return false;
  await exec(CATEGORY_GLOBAL_V1_SQL);
  await markDone();
  return true;
}

/**
 * One-time rebuild: `savings_goal.priority` shipped as
 * `CHECK(priority IN ('high','medium','low'))` — buckets that funding
 * (`sort_order`/drag) replaced and that no UI has ever offered a picker for
 * (see `src/lib/savingsEngine.ts`'s `rankKey` comment). Repurposed rather than
 * deleted: a protect-from-raid tag, `CHECK(priority IN ('emergency','need','want'))`.
 *
 * SQLite can't `ALTER` a `CHECK`, so the table is rebuilt, remapping existing
 * values with a `CASE`: `medium → need` (every real goal today — nothing has
 * ever moved a row off the default), `high → emergency` / `low → want`
 * (demo-data-only, since no real UI ever set these). `id`s are preserved
 * unchanged, so `savings_txn.goal_id` (a plain column, not an enforced FK)
 * cannot be orphaned by the rebuild.
 */
export const GOAL_PRIORITY_REVIVE_SQL = `
  PRAGMA foreign_keys=OFF;
  BEGIN TRANSACTION;
  CREATE TABLE savings_goal_new (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    target       INTEGER NOT NULL,
    priority     TEXT NOT NULL DEFAULT 'need' CHECK(priority IN ('emergency','need','want')),
    category     TEXT,
    icon         TEXT,
    color        TEXT,
    allocation   INTEGER NOT NULL DEFAULT 0,
    frequency    TEXT NOT NULL DEFAULT 'none' CHECK(frequency IN ('daily','weekly','monthly','yearly','none')),
    locked       INTEGER NOT NULL DEFAULT 0,
    is_archived  INTEGER NOT NULL DEFAULT 0,
    last_auto_at INTEGER,
    target_date  INTEGER,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL
  );
  INSERT INTO savings_goal_new (id,name,target,priority,category,icon,color,allocation,frequency,locked,is_archived,last_auto_at,target_date,sort_order,created_at)
    SELECT id,name,target,
      CASE priority WHEN 'high' THEN 'emergency' WHEN 'low' THEN 'want' ELSE 'need' END,
      category,icon,color,allocation,frequency,locked,is_archived,last_auto_at,target_date,sort_order,created_at
    FROM savings_goal;
  DROP TABLE savings_goal;
  ALTER TABLE savings_goal_new RENAME TO savings_goal;
  COMMIT;
  PRAGMA foreign_keys=ON;
`;

/**
 * Runs `GOAL_PRIORITY_REVIVE_SQL` at most once, detected the same way as the
 * txn/category CHECK rebuilds above: by the absence of the new constraint's
 * value in the table's own stored DDL, not a settings flag.
 */
export async function applyGoalPriorityRevival(
  getStoredDdl: () => Promise<string | null>,
  exec: (sql: string) => Promise<void>,
): Promise<boolean> {
  const ddl = await getStoredDdl();
  if (!ddl || ddl.includes("'emergency'")) return false;
  await exec(GOAL_PRIORITY_REVIVE_SQL);
  return true;
}

export const INDEXES = `
    -- Budget uniqueness, in two halves on purpose.
    --
    -- A single UNIQUE(group_id, category, period, person_id) does NOT work: SQL
    -- treats NULLs as distinct in a unique constraint, so the group-default rows
    -- (person_id IS NULL) would never collide and one category could accumulate
    -- unlimited default lines. Splitting it into two partial indexes gives real
    -- uniqueness at both levels — one default per category, one override per
    -- category per person.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_catbudget_default
      ON category_budget(group_id, category, period) WHERE person_id IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_catbudget_override
      ON category_budget(group_id, category, period, person_id) WHERE person_id IS NOT NULL;
    -- Partial: the exclusion predicate only ever asks about 'pending', and on a
    -- single-user device this table is empty, so the NOT EXISTS stays one index
    -- probe even on the paths that scan all history (CASH_TOTALS_SQL).
    CREATE INDEX IF NOT EXISTS idx_txn_approval_pending
      ON txn_approval(txn_id) WHERE state = 'pending';
    -- One local person per remote account. Partial so NULLs stay distinct — the
    -- same construction as idx_catbudget_default above. Safe to add now because
    -- nothing writes remote_uid yet, so every value is NULL.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_person_remote_uid
      ON person(remote_uid) WHERE remote_uid IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_txn_group_date ON txn(group_id, date);
    CREATE INDEX IF NOT EXISTS idx_txn_parent     ON txn(parent_recur_id);
    CREATE INDEX IF NOT EXISTS idx_txn_recurring  ON txn(group_id, recur_state) WHERE recur_freq IS NOT NULL;
    -- Cross-group recurring scans (materializeDueOccurrences / getActiveRecurringRules)
    -- filter recur_state with no group_id, so they can't use the group_id-leading
    -- index above — this recur_state-leading partial index serves them.
    CREATE INDEX IF NOT EXISTS idx_txn_recur_state ON txn(recur_state) WHERE recur_freq IS NOT NULL;
    -- getTransactionsInRange(groupId=null, ...) (Home, savings/cash, reports) filters
    -- date + is_deleted=0 + recur_freq IS NULL with no group_id, so the group_id-leading
    -- index can't serve it — this date-leading partial index matches that hot predicate.
    CREATE INDEX IF NOT EXISTS idx_txn_date ON txn(date) WHERE is_deleted = 0 AND recur_freq IS NULL;
    -- category-frequency / uncategorized / duplicate scans group & filter on category.
    CREATE INDEX IF NOT EXISTS idx_txn_group_category ON txn(group_id, category);
    CREATE INDEX IF NOT EXISTS idx_line_item_txn  ON line_item(txn_id);
    -- Person-leading probes: "every transaction involving this person", for the
    -- person detail screen. The composite PKs on these two tables are
    -- (txn_id, person_id), so neither can serve a person_id-first lookup — without
    -- these the screen is a full scan of both split tables.
    CREATE INDEX IF NOT EXISTS idx_txn_share_person   ON txn_share(person_id);
    CREATE INDEX IF NOT EXISTS idx_txn_payment_person ON txn_payment(person_id);
`;

export async function openDB(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('budgetsplit.db');
  await db.execAsync(SCHEMA);

  for (const sql of COLUMN_MIGRATIONS) {
    try {
      await db.execAsync(sql);
    } catch {
      // Column already exists — safe to ignore.
    }
  }

  // One-time rebuild: the original txn table had CHECK(recur_freq IN
  // ('daily','weekly','monthly','custom')) which rejects 'yearly'. SQLite can't
  // ALTER a CHECK, so recreate the table without the stale constraint, copying
  // every row by column name. Detected by the absence of 'yearly' in its DDL.
  try {
    const txnDef = await db.getFirstAsync<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='txn'",
    );
    if (txnDef && !txnDef.sql.includes("'yearly'")) {
      // Every column added by COLUMN_MIGRATIONS must appear here too, or the rebuild silently
      // drops it for the rest of the session (the ALTER only re-runs on the NEXT launch).
      // That is why `currency` and `source` are in this list despite not being in the base
      // SCHEMA above.
      const cols = 'id,group_id,kind,entry_mode,date,category,note,attachment_uri,tags,adjustments,'
        + 'recur_freq,recur_interval,recur_end,recur_override_date,parent_recur_id,recur_state,'
        + 'recur_paused_at,recur_mode,tz,lat,lng,place_label,pay_method,currency,source,author_person_id,'
        + 'is_deleted,created_at,updated_at';
      await db.execAsync(`
        PRAGMA foreign_keys=OFF;
        BEGIN TRANSACTION;
        CREATE TABLE txn_new (
          id             TEXT PRIMARY KEY,
          group_id       TEXT NOT NULL REFERENCES budget_group(id),
          kind           TEXT NOT NULL CHECK(kind IN ('income','expense','settlement')),
          entry_mode     TEXT NOT NULL CHECK(entry_mode IN ('quick','itemized')),
          date           INTEGER NOT NULL,
          category       TEXT NOT NULL,
          note           TEXT,
          attachment_uri TEXT,
          tags           TEXT,
          adjustments    TEXT,
          recur_freq     TEXT CHECK(recur_freq IN ('daily','weekly','monthly','yearly','custom')),
          recur_interval INTEGER,
          recur_end      INTEGER,
          recur_override_date INTEGER,
          parent_recur_id TEXT,
          recur_state    TEXT NOT NULL DEFAULT 'active' CHECK(recur_state IN ('active','paused','ended')),
          recur_paused_at INTEGER,
          recur_mode     TEXT NOT NULL DEFAULT 'auto',
          tz             TEXT,
          lat            REAL,
          lng            REAL,
          place_label    TEXT,
          pay_method     TEXT,
          currency       TEXT,
          source         TEXT,
          author_person_id TEXT,
          is_deleted     INTEGER NOT NULL DEFAULT 0,
          created_at     INTEGER NOT NULL,
          updated_at     INTEGER NOT NULL
        );
        INSERT INTO txn_new (${cols}) SELECT ${cols} FROM txn;
        DROP TABLE txn;
        ALTER TABLE txn_new RENAME TO txn;
        COMMIT;
        PRAGMA foreign_keys=ON;
      `);
    }
  } catch {
    // If the rebuild fails, leave the original table intact (yearly stays unavailable).
  }

  // One-time rebuild: the original category table had
  // CHECK(kind IN ('expense','income')) which rejects 'transfer'. SQLite can't
  // ALTER a CHECK, so recreate it without the stale constraint. Detected by the
  // absence of 'transfer' in its DDL.
  try {
    const catDef = await db.getFirstAsync<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='category'",
    );
    if (catDef && !catDef.sql.includes("'transfer'")) {
      await db.execAsync(`
        PRAGMA foreign_keys=OFF;
        BEGIN TRANSACTION;
        CREATE TABLE category_new (
          id        TEXT PRIMARY KEY,
          group_id  TEXT NOT NULL REFERENCES budget_group(id),
          name      TEXT NOT NULL,
          icon      TEXT,
          color     TEXT,
          kind      TEXT NOT NULL DEFAULT 'expense' CHECK(kind IN ('expense','income','transfer')),
          section   TEXT
        );
        INSERT INTO category_new (id,group_id,name,icon,color,kind,section)
          SELECT id,group_id,name,icon,color,kind,section FROM category;
        DROP TABLE category;
        ALTER TABLE category_new RENAME TO category;
        COMMIT;
        PRAGMA foreign_keys=ON;
      `);
    }
  } catch {
    // If the rebuild fails, leave the original table intact (transfer cats stay unavailable).
  }

  // One-time rebuild: `category_budget` shipped with UNIQUE(group_id, category,
  // period), which makes a personal override impossible — the override row collides
  // with the group default on exactly those three columns. SQLite cannot drop a
  // constraint, so recreate the table without it and let the two partial indexes in
  // `INDEXES` carry uniqueness instead. Detected by the constraint's presence in the
  // stored DDL, so it runs once and is a no-op afterwards.
  try {
    const cbDef = await db.getFirstAsync<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='category_budget'",
    );
    if (cbDef && cbDef.sql.includes('UNIQUE')) {
      await db.execAsync(`
        PRAGMA foreign_keys=OFF;
        BEGIN TRANSACTION;
        CREATE TABLE category_budget_new (
          id        TEXT PRIMARY KEY,
          group_id  TEXT NOT NULL REFERENCES budget_group(id),
          category  TEXT NOT NULL,
          period    TEXT NOT NULL DEFAULT 'monthly' CHECK(period IN ('monthly','yearly')),
          amount    INTEGER NOT NULL,
          cadence   TEXT NOT NULL DEFAULT 'monthly',
          person_id TEXT
        );
        INSERT INTO category_budget_new (id,group_id,category,period,amount,cadence,person_id)
          SELECT id,group_id,category,period,amount,cadence,person_id FROM category_budget;
        DROP TABLE category_budget;
        ALTER TABLE category_budget_new RENAME TO category_budget;
        COMMIT;
        PRAGMA foreign_keys=ON;
      `);
    }
  } catch {
    // Leave the old table intact if the rebuild fails; overrides stay unavailable
    // rather than the budget data being put at risk.
  }

  // One-time rebuild: revive `savings_goal.priority` as a protect-from-raid tag.
  // See applyGoalPriorityRevival for what/why; exported so
  // goalPriorityMigration.test.ts runs the exact same SQL as this launch does.
  try {
    await applyGoalPriorityRevival(
      async () => (await db.getFirstAsync<{ sql: string }>(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='savings_goal'",
      ))?.sql ?? null,
      (sql) => db.execAsync(sql),
    );
  } catch {
    // Leave the old table intact if the rebuild fails; goals keep their stale
    // high/medium/low values rather than the goal data being put at risk.
  }

  // Hot-path indexes + budget uniqueness. Exported as `INDEXES` (not inline in
  // SCHEMA) for two reasons: the one-time txn rebuild above drops and recreates
  // the txn table, which would wipe any index defined alongside it; and the test
  // harness needs the same DDL, which it cannot get from a string literal buried
  // in this function. IF NOT EXISTS keeps it idempotent on every open.
  await db.execAsync(INDEXES);

  // --- One-time DATA fixes -------------------------------------------------
  // Legacy repairs that reclassify and DELETE user rows. Each runs at most once
  // per database (see ONE_TIME_FIXES) — they used to run on every launch, which
  // silently undid the user's own later edits. Must stay AHEAD of the
  // category-global migration below: the income reclassification has to happen
  // before the (name, kind) dedupe.
  //
  // Wrapped, like the category-global migration below it. These fixes are the one
  // startup step that can throw on real data — `fix_income_category_kind_v1` is an
  // UPDATE that can trip `UNIQUE(name, kind)` if it ever runs twice — and an
  // unguarded throw here reaches `_layout.tsx` as `setDbError(true)`, i.e. the
  // "Couldn't start BudgetSplit" screen, on every launch, with no way out. A
  // legacy repair failing must not cost the user their app.
  try {
    await applyOneTimeFixes(
      async () => {
        const keys = ONE_TIME_FIXES.map(f => f.key);
        const rows = await db.getAllAsync<{ key: string }>(
          `SELECT key FROM settings WHERE key IN (${keys.map(() => '?').join(',')})`,
          keys,
        );
        return new Set(rows.map(r => r.key));
      },
      (sql) => db.execAsync(sql),
      (key) => db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES (?, '1')", [key]).then(() => undefined),
    );
  } catch {
    // Leave the data as-is if a legacy repair fails. The app still opens.
  }

  // Phase GC: collapse the per-group category rows into a single GLOBAL catalog.
  // One-time, flagged — see CATEGORY_GLOBAL_V1_SQL for what it does and why it's safe.
  try {
    await applyCategoryGlobalMigration(
      async () => !!(await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key='category_global_v1'")),
      (sql) => db.execAsync(sql),
      () => db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES ('category_global_v1', '1')").then(() => undefined),
    );
  } catch {
    // Leave categories as-is if the global migration fails.
  }

  // Ensure the global catalog contains every default category (idempotent).
  // This is the ONLY category seeding — groups/demo never make their own copies.
  await seedGlobalCategories(db);

  // Backfill the section column per kind so a name shared across kinds (e.g.
  // 'Rent', 'Other') lands in the right section for its own kind.
  const backfillSections = async (kind: string, secs: { title: string; names: string[] }[]) => {
    for (const sec of secs) {
      if (sec.names.length === 0) continue;
      const placeholders = sec.names.map(() => '?').join(',');
      await db.runAsync(
        `UPDATE category SET section=? WHERE section IS NULL AND kind=? AND name IN (${placeholders})`,
        [sec.title, kind, ...sec.names],
      );
    }
  };
  await backfillSections('expense', CATEGORY_SECTIONS);
  await backfillSections('income', INCOME_SECTIONS);
  await backfillSections('transfer', TRANSFER_SECTIONS);
  await db.runAsync("UPDATE category SET section='Other' WHERE section IS NULL AND kind='income'");
  await db.runAsync("UPDATE category SET section='Other' WHERE section IS NULL AND kind='transfer'");

  return db;
}
