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

/** `txn.entry_mode CHECK(entry_mode IN ('quick','itemized'))`. */
export const ENTRY_MODE = ['quick', 'itemized'] as const;
export type EntryMode = typeof ENTRY_MODE[number];

/** `txn.pay_method` — nullable. How a payment/settlement was made. */
export const PAY_METHOD = ['upi', 'cash', 'bank'] as const;
export type PayMethod = typeof PAY_METHOD[number];
export const PAY_METHOD_LABEL: Record<PayMethod, string> = {
  upi: 'UPI', cash: 'Cash', bank: 'Bank transfer',
};

/** `txn.recur_freq CHECK(... IN ('daily','weekly','monthly','yearly','custom'))`. */
export const RECUR_FREQ = ['daily', 'weekly', 'monthly', 'yearly', 'custom'] as const;
export type RecurFreq = typeof RECUR_FREQ[number];
export const RECUR_FREQ_LABEL: Record<RecurFreq, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly', custom: 'Custom',
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

// --- Categories / budgets ------------------------------------------------

/** `category.kind CHECK(kind IN ('expense','income','transfer'))`. */
export const CATEGORY_KIND = ['expense', 'income', 'transfer'] as const;
export type CategoryKind = typeof CATEGORY_KIND[number];

/** Category-budget cadence. */
export const BUDGET_CADENCE = ['once', 'daily', 'monthly', 'yearly'] as const;
export type BudgetCadence = typeof BUDGET_CADENCE[number];

/** `category_budget.period CHECK(period IN ('monthly','yearly'))`. */
export const BUDGET_PERIOD = ['monthly', 'yearly'] as const;
export type BudgetPeriod = typeof BUDGET_PERIOD[number];

// --- Savings -------------------------------------------------------------

/** `savings_goal.priority CHECK(priority IN ('high','medium','low'))`. */
export const PRIORITY = ['high', 'medium', 'low'] as const;
export type Priority = typeof PRIORITY[number];
export const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'High', medium: 'Medium', low: 'Low',
};

/** `savings_goal.frequency CHECK(... IN ('daily','weekly','monthly','yearly','none'))`. */
export const SAVINGS_FREQUENCY = ['daily', 'weekly', 'monthly', 'yearly', 'none'] as const;
export type SavingsFrequency = typeof SAVINGS_FREQUENCY[number];

/** `savings_txn.kind CHECK(kind IN ('deposit','allocate','withdraw'))`. */
export const SAVINGS_TXN_KIND = ['deposit', 'allocate', 'withdraw'] as const;
export type SavingsTxnKind = typeof SAVINGS_TXN_KIND[number];

// --- Audit ---------------------------------------------------------------

export const AUDIT_ACTION = ['created', 'updated', 'deleted', 'settled', 'paused', 'resumed', 'ended'] as const;
export type AuditAction = typeof AUDIT_ACTION[number];

export const AUDIT_ENTITY_TYPE = ['txn', 'group', 'member', 'budget', 'recurring', 'settlement'] as const;
export type AuditEntityType = typeof AUDIT_ENTITY_TYPE[number];

// --- Search (UI scope, not stored) ---------------------------------------

export const SEARCH_SOURCE = ['all', 'personal', 'groups'] as const;
export type SearchSource = typeof SEARCH_SOURCE[number];
export const SEARCH_SOURCE_LABEL: Record<SearchSource, string> = {
  all: 'All', personal: 'Personal', groups: 'Groups',
};
