/**
 * Centralized value sets for fixed domains stored as SQLite TEXT. Pattern:
 * a `const` tuple (source of truth for membership/order) + a derived union type
 * + an optional label map. Import these instead of repeating string literals so
 * the set, its labels, and its order live in exactly one place.
 *
 * Scope: domain / DB-backed sets only (each matches a CHECK constraint in
 * schema.ts). Local presentational unions (tab keys, wizard stages, badge tones)
 * stay inline in their components — they are not shared domain values.
 *
 * Canonical query modules (savings.ts, groups.ts, categoryBudgets.ts, audit.ts)
 * re-export the relevant type from here, so there is a single definition.
 */

// Type-only, so it is erased at compile time: `enums.ts` stays a pure constants
// module with no runtime dependency on `@expo/vector-icons`, which the Node-based
// unit tests importing it (savingsEngine, reviewFilter, …) rely on.
import type { FeatherName } from './palette';

// --- Transactions --------------------------------------------------------

/** `txn.kind CHECK(kind IN ('income','expense','settlement'))`. "Transfer" is only
 *  a UI label for a settlement; it is NOT a stored kind. */
export const TXN_KIND = ['expense', 'income', 'settlement'] as const;
export type TxnKind = typeof TXN_KIND[number];
export const TXN_KIND_LABEL: Record<TxnKind, string> = {
  expense: 'Expense', income: 'Income', settlement: 'Settlement',
};
export const TXN_KIND_LABEL_PLURAL: Record<TxnKind, string> = {
  expense: 'Expenses', income: 'Income', settlement: 'Settlements',
};

/**
 * What the Add screen is adding. Deliberately *not* `TxnKind`: the user picks
 * "Transfer", which is stored as a `settlement`. This is the UI-facing set, and
 * the order here is the order of the switcher.
 *
 * Previously declared in `components/finance/add/KindToggle.tsx`, so a type every
 * layer needed (the form hook, the amount field, the category pills) was reached
 * for through a component.
 */
/** Transfer sits in the MIDDLE deliberately: it's the switcher's neutral centre,
 *  with money-out on the left and money-in on the right. */
export enum AddKind {
  Expense = 'expense',
  Income = 'income',
  Transfer = 'transfer',
}
/** Render order for the switcher — not the same thing as the member list. */
export const ADD_KIND = [AddKind.Expense, AddKind.Transfer, AddKind.Income] as const;
export const ADD_KIND_LABEL: Record<AddKind, string> = {
  [AddKind.Expense]: 'Expense',
  [AddKind.Income]: 'Income',
  [AddKind.Transfer]: 'Transfer',
};

/** `txn.entry_mode CHECK(entry_mode IN ('quick','itemized'))`. */
export const ENTRY_MODE = ['quick', 'itemized'] as const;
export type EntryMode = typeof ENTRY_MODE[number];

/** `txn.pay_method` / `pending_txn.pay_method` — nullable. How a payment was made.
 *  Applies to every txn kind (expense/income/transfer/settlement). Detected from
 *  imported text (see `payMethodDetect`), pre-filled in Review, always editable. */
export enum PayMethod {
  Upi = 'upi',
  Card = 'card',
  Cash = 'cash',
  Bank = 'bank',
  Wallet = 'wallet',
  Autopay = 'autopay',
  Other = 'other',
}
/** Render order for the pay-method picker. */
export const PAY_METHOD = [
  PayMethod.Upi, PayMethod.Card, PayMethod.Cash, PayMethod.Bank,
  PayMethod.Wallet, PayMethod.Autopay, PayMethod.Other,
] as const;
export const PAY_METHOD_LABEL: Record<PayMethod, string> = {
  [PayMethod.Upi]: 'UPI', [PayMethod.Card]: 'Card', [PayMethod.Cash]: 'Cash',
  [PayMethod.Bank]: 'Bank', [PayMethod.Wallet]: 'Wallet',
  [PayMethod.Autopay]: 'Autopay', [PayMethod.Other]: 'Other',
};
/**
 * Feather icon per pay method — the single source for the pay-method chips.
 *
 * Feather has no bank or wallet glyph, so Bank takes `briefcase` and Wallet
 * `shopping-bag`, keeping both distinct from Card's `credit-card`.
 */
export const PAY_METHOD_ICON: Record<PayMethod, FeatherName> = {
  [PayMethod.Upi]: 'smartphone', [PayMethod.Card]: 'credit-card', [PayMethod.Cash]: 'dollar-sign',
  [PayMethod.Bank]: 'briefcase', [PayMethod.Wallet]: 'shopping-bag',
  [PayMethod.Autopay]: 'repeat', [PayMethod.Other]: 'more-horizontal',
};

/**
 * Where incoming money can land. The same `pay_method` column, asked the other way
 * round: income arrives *into* cash, a bank account or a wallet — it never arrives
 * "by card" or "by autopay". Bank is the default because salary is the common case.
 *
 * This is deliberately a view over `PAY_METHOD` rather than a new `account` concept.
 * Accounts as real entities (with balances) is a separate, larger design — see the
 * note in `DEBT_TRACKER.md`.
 */
export const INCOME_LANDING: readonly PayMethod[] = [
  PayMethod.Bank, PayMethod.Cash, PayMethod.Wallet, PayMethod.Upi,
];
export const INCOME_LANDING_DEFAULT = PayMethod.Bank;

/**
 * `person.receivable_state` — whether money this person owes me still counts as
 * cover. 'written_off' is NOT a settlement: the debt is still owed and still
 * shown, it just stops offsetting a shortfall or netting against what I owe.
 *
 * There is no 'stale' member on purpose. Staleness is derived from the age of the
 * balance against that person's own settle rhythm, so storing it would freeze a
 * judgement that should move with time.
 */
export const RECEIVABLE_STATE = ['expected', 'written_off'] as const;
export type ReceivableState = typeof RECEIVABLE_STATE[number];
export function asReceivableState(v: string | null | undefined): ReceivableState {
  return v === 'written_off' ? 'written_off' : 'expected';
}

/**
 * `person.trust_state` — whether this person's entries reach my ledger without
 * my say-so. 'review' means anything they add in a shared group waits for me;
 * 'trusted' means it lands immediately, in every group we share.
 *
 * Per person, not per group: a group is only a set of people, and trusting the
 * group would silently extend that trust to whoever gets added to it next.
 *
 * 'review' is the default because the safe answer to "may a stranger move my
 * numbers" is no. It is also inert for anyone without an account — see
 * `lib/trust.ts`, which is what makes all of this a no-op today.
 */
export const TRUST_STATE = ['review', 'trusted'] as const;
export type TrustState = typeof TRUST_STATE[number];
export function asTrustState(v: string | null | undefined): TrustState {
  return v === 'trusted' ? 'trusted' : 'review';
}

/**
 * `txn_approval.state` — my decision about an entry someone else wrote.
 *
 * 'rejected' rows are kept rather than deleted: a rejection is a decision, it
 * stops the same entry being re-delivered and asked again, and it is the record
 * if the two of you disagree about what happened.
 */
export const APPROVAL_STATE = ['pending', 'approved', 'rejected'] as const;
export type ApprovalState = typeof APPROVAL_STATE[number];

/** Narrow a stored preference string to a PayMethod. Mirrors `asBudgetCadence`. */
export function asPayMethod(v: string | null | undefined, fallback: PayMethod = PayMethod.Upi): PayMethod {
  return (PAY_METHOD as readonly string[]).includes(v ?? '') ? (v as PayMethod) : fallback;
}

/**
 * A settlement's scope: which debt is being paid down. Either every shared group
 * at once, or one group's id — so the type is a union with a group id, and this is
 * the named sentinel rather than a bare `'all'` scattered across the transfer flow.
 *
 * It is *not* cosmetic: `all` fans the payment across every group's balance
 * largest-first (`planAllGroupsSettlement`), while a group id writes a single
 * settlement against that group.
 */
export const TRANSFER_SCOPE_ALL = 'all' as const;
export type TransferScope = typeof TRANSFER_SCOPE_ALL | string;

/** `pending_txn.source` and `txn.source` — where a row came from. Drives the
 *  sectioned Review inbox ("From email", "From Google Pay"…). `sms`/`notification`
 *  are reserved for future ingestion paths (currently de-scoped).
 *
 *  **Order is the Review section order** (`app/review.tsx` maps this tuple directly), so
 *  `voice` sits first: a phrase you said out loud minutes ago deserves to be the thing you
 *  see before a statement you imported. */
export const TXN_SOURCE = ['voice', 'email', 'gpay', 'paytm', 'bank_csv', 'sms', 'notification', 'upi_qr', 'peer', 'manual'] as const;
export type TxnSource = typeof TXN_SOURCE[number];
export const TXN_SOURCE_LABEL: Record<TxnSource, string> = {
  // Captured by the Siri shortcut while the app was closed, or dictated inside it.
  voice: 'Said out loud',
  email: 'Email alert', gpay: 'Google Pay', paytm: 'Paytm', bank_csv: 'Bank / CSV',
  sms: 'SMS', notification: 'Notifications',
  // Paid through the app: scanned a QR, handed off to a UPI app, confirmed on return.
  upi_qr: 'Scanned & paid',
  // Written by another person on their own device. Never appears in Review — a
  // peer entry is judged on the approvals screen, not edited into shape.
  peer: 'Added by someone else',
  manual: 'Imported',
};
/**
 * Short form for a segmented control, where the pill width is `track / tabs.length`
 * and a full label plus its count does not fit. `TXN_SOURCE_LABEL` stays the name
 * used in prose and in the Review section headers, which have a whole row to
 * themselves; this is only for the tab strip.
 */
export const TXN_SOURCE_LABEL_SHORT: Record<TxnSource, string> = {
  voice: 'Voice',
  email: 'Email', gpay: 'GPay', paytm: 'Paytm', bank_csv: 'Bank',
  sms: 'SMS', notification: 'Notifs',
  upi_qr: 'Scanned',
  peer: 'Shared',
  manual: 'Imported',
};

/** Feather icon per source — used by the Review section headers. */
export const TXN_SOURCE_ICON: Record<TxnSource, string> = {
  voice: 'mic',
  email: 'mail', gpay: 'smartphone', paytm: 'credit-card', bank_csv: 'file-text',
  sms: 'message-square', notification: 'bell', upi_qr: 'maximize',
  peer: 'user-check', manual: 'inbox',
};

/** `txn.recur_freq CHECK(... IN ('daily','weekly','monthly','yearly','custom'))`. */
export const RECUR_FREQ = ['daily', 'weekly', 'monthly', 'yearly', 'custom'] as const;
export type RecurFreq = typeof RECUR_FREQ[number];
export const RECUR_FREQ_LABEL: Record<RecurFreq, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly', custom: 'Custom',
};
/**
 * The frequencies the Add screen offers, in switcher order — monthly first because
 * subscriptions and rent are the common case. A subset, not the whole set: `daily` is
 * reachable through `custom` ("every 1 days") and a fifth segment made the control too
 * tight to hit. Same relationship `INCOME_LANDING` has to `PAY_METHOD`.
 */
export const RECUR_FREQ_ADD_CHOICES: readonly RecurFreq[] = ['monthly', 'weekly', 'yearly', 'custom'];

/**
 * When a recurring rule stops. Not a stored column — it's how the UI asks for one of
 * `recur_end` (a date) or `recur_count` (a number of occurrences), with `never` meaning
 * both are null. Declared here because it was written out as a bare
 * `'never' | 'date' | 'count'` union in three separate files.
 */
export enum RecurEndMode {
  Never = 'never',
  Date = 'date',
  Count = 'count',
}
export const RECUR_END_MODE = [RecurEndMode.Never, RecurEndMode.Date, RecurEndMode.Count] as const;
export const RECUR_END_MODE_LABEL: Record<RecurEndMode, string> = {
  [RecurEndMode.Never]: 'Never',
  [RecurEndMode.Date]: 'On date',
  [RecurEndMode.Count]: 'After N',
};

/** `txn.recur_state CHECK(recur_state IN ('active','paused','ended'))`. */
export const RECUR_STATE = ['active', 'paused', 'ended'] as const;
export type RecurState = typeof RECUR_STATE[number];

// --- Groups / splitting --------------------------------------------------

/** `budget_group.default_split CHECK(... IN ('equal','exact','percent','shares'))`. */
export const SPLIT_MODE = ['equal', 'exact', 'percent', 'shares'] as const;
export type SplitMode = typeof SPLIT_MODE[number];
export const SPLIT_MODE_LABEL: Record<SplitMode, string> = {
  equal: 'Equal', exact: 'Exact', percent: 'Percent', shares: 'Shares',
};
/** Sentence-form phrasing ("Splits <phrase>") — same set, prose register. */
export const SPLIT_MODE_PHRASE: Record<SplitMode, string> = {
  equal: 'equally', exact: 'by exact amounts', percent: 'by percentage', shares: 'by shares',
};

// --- Groups --------------------------------------------------------------

/**
 * `group_member.role`. There is deliberately no `owner` here: the group's creator
 * is `budget_group.created_by`, which is immutable, and is always treated as an
 * admin. Roles can be edited; creator-ness cannot, which is what makes "nobody can
 * remove the creator" a guarantee rather than a rule someone can edit their way out of.
 */
export const GROUP_ROLE = ['admin', 'member'] as const;
export type GroupRole = typeof GROUP_ROLE[number];

// --- Categories / budgets ------------------------------------------------

/** `category.kind CHECK(kind IN ('expense','income','transfer'))`. */
export const CATEGORY_KIND = ['expense', 'income', 'transfer'] as const;
export type CategoryKind = typeof CATEGORY_KIND[number];

/**
 * Which `txn.kind` a category of each kind labels. The two vocabularies differ by
 * exactly one word — the UI's *transfer* is stored as `settlement` — and the
 * catalog is `UNIQUE(name, kind)`, so the same name legitimately exists twice
 * (`Rent` and `Other` are seeded as both expense and transfer). Any write that
 * propagates a category name to `txn` must go through this map, or it edits the
 * other kind's rows too.
 */
export const TXN_KIND_FOR_CATEGORY: Record<CategoryKind, TxnKind> = {
  expense: 'expense', income: 'income', transfer: 'settlement',
};

/**
 * Category-budget cadence.
 *
 * Every cadence here is a **repeating** cap, and that is the whole set on
 * purpose. A `once` cadence existed and was removed: `budgetKind` classified it
 * as a pool at every target, so it could never reach a headline on any screen,
 * and its spend window ran from the epoch — so it never reset, and a line the
 * user crossed stayed red forever with no way back but editing it. A
 * never-resetting one-off target is a savings goal, which is a first-class
 * feature already. Existing rows were converted to `yearly` by
 * `fix_drop_once_cadence_v1` (`db/schema.ts`).
 */
export const BUDGET_CADENCE = ['daily', 'monthly', 'yearly'] as const;
export type BudgetCadence = typeof BUDGET_CADENCE[number];

/** Narrow a stored string to a cadence, falling back for legacy/unknown values. */
export function asBudgetCadence(v: string | null | undefined, fallback: BudgetCadence = 'monthly'): BudgetCadence {
  return (BUDGET_CADENCE as readonly string[]).includes(v ?? '') ? (v as BudgetCadence) : fallback;
}

/** `category_budget.period CHECK(period IN ('monthly','yearly'))`. */
export const BUDGET_PERIOD = ['monthly', 'yearly'] as const;
export type BudgetPeriod = typeof BUDGET_PERIOD[number];

// --- Savings -------------------------------------------------------------

/**
 * `savings_goal.priority CHECK(priority IN ('emergency','need','want'))`.
 * A protect-from-raid tag, not a funding order — that's `sort_order`
 * (drag rank). `emergency` goals are never raid-eligible; `want` is raided
 * before `need`. See `planOverspendRaid` in `src/lib/savingsEngine.ts`.
 */
export const PRIORITY = ['emergency', 'need', 'want'] as const;
export type Priority = typeof PRIORITY[number];

export const PRIORITY_LABEL: Record<Priority, string> = {
  emergency: 'Emergency',
  need: 'Need',
  want: 'Want',
};

/** `savings_goal.frequency CHECK(... IN ('daily','weekly','monthly','yearly','none'))`. */
export const SAVINGS_FREQUENCY = ['daily', 'weekly', 'monthly', 'yearly', 'none'] as const;
export type SavingsFrequency = typeof SAVINGS_FREQUENCY[number];

/** `savings_txn.kind CHECK(kind IN ('deposit','allocate','withdraw'))`. */
export const SAVINGS_TXN_KIND = ['deposit', 'allocate', 'withdraw'] as const;
export type SavingsTxnKind = typeof SAVINGS_TXN_KIND[number];

// --- Audit ---------------------------------------------------------------

export const AUDIT_ACTION = ['created', 'updated', 'deleted', 'archived', 'settled', 'paused', 'resumed', 'ended'] as const;
export type AuditAction = typeof AUDIT_ACTION[number];

export const AUDIT_ENTITY_TYPE = ['txn', 'group', 'member', 'budget', 'recurring', 'settlement'] as const;
export type AuditEntityType = typeof AUDIT_ENTITY_TYPE[number];

// --- Search (UI scope, not stored) ---------------------------------------

export const SEARCH_SOURCE = ['all', 'personal', 'groups'] as const;
export type SearchSource = typeof SEARCH_SOURCE[number];
export const SEARCH_SOURCE_LABEL: Record<SearchSource, string> = {
  all: 'All', personal: 'Personal', groups: 'Groups',
};
