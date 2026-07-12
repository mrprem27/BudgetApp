import type { FeatherName } from './palette';

export type CategoryDef = {
  name: string;
  icon: FeatherName;
  color: string;
};

/**
 * Master catalog of budget categories seeded into every new group. Tuned for an
 * urban Indian working professional (e.g. living & working in Gurgaon): rent,
 * society maintenance, household help, food delivery, cabs, metro, SIPs, EMIs
 * and the like. Each pairs a Feather icon with a distinct colour so it reads
 * clearly on the dark surface. Users can add their own from the category picker.
 */
export const DEFAULT_CATEGORIES: CategoryDef[] = [
  // Home & living
  { name: 'Rent',             icon: 'home',           color: '#7C6AF7' },
  { name: 'Maintenance',      icon: 'tool',           color: '#A78BFA' },
  { name: 'Household Help',   icon: 'user-check',     color: '#C084FC' },
  { name: 'Home Supplies',    icon: 'package',        color: '#A3E635' },

  // Food
  { name: 'Groceries',        icon: 'shopping-cart',  color: '#3ECF8E' },
  { name: 'Food Delivery',    icon: 'shopping-bag',   color: '#F0A500' },
  { name: 'Eating Out',       icon: 'coffee',         color: '#FB923C' },
  { name: 'Chai & Snacks',    icon: 'box',            color: '#FBBF24' },

  // Transport
  { name: 'Cab & Auto',       icon: 'navigation',     color: '#FACC15' },
  { name: 'Metro & Bus',      icon: 'navigation-2',   color: '#22D3EE' },
  { name: 'Fuel',             icon: 'droplet',        color: '#F97316' },
  { name: 'Parking & Toll',   icon: 'disc',           color: '#FDBA74' },

  // Bills & utilities
  { name: 'Electricity',      icon: 'zap',            color: '#60A5FA' },
  { name: 'Mobile Recharge',  icon: 'smartphone',     color: '#38BDF8' },
  { name: 'WiFi & Broadband', icon: 'wifi',           color: '#0EA5E9' },
  { name: 'Bills',            icon: 'file-text',      color: '#94A3B8' },

  // Lifestyle
  { name: 'Shopping',         icon: 'shopping-bag',   color: '#A78BFA' },
  { name: 'Entertainment',    icon: 'film',           color: '#F87171' },
  { name: 'Gym & Fitness',    icon: 'activity',       color: '#34D399' },
  { name: 'Salon & Grooming', icon: 'scissors',       color: '#E879F9' },
  { name: 'Electronics',      icon: 'monitor',        color: '#818CF8' },
  { name: 'Gifts',            icon: 'gift',           color: '#F9A8D4' },

  // Health
  { name: 'Health & Pharmacy',icon: 'heart',          color: '#F06060' },
  { name: 'Insurance',        icon: 'shield',         color: '#0EA5E9' },

  // Money & growth
  { name: 'Investments / SIP',icon: 'trending-up',    color: '#10B981' },
  { name: 'Savings',          icon: 'dollar-sign',    color: '#22C55E' },
  { name: 'EMI & Loans',      icon: 'credit-card',    color: '#F43F5E' },
  { name: 'Education',        icon: 'book-open',      color: '#4ADE80' },
  { name: 'Taxes',            icon: 'percent',        color: '#FCD34D' },

  // Other
  { name: 'Travel',           icon: 'map',            color: '#F472B6' },
  { name: 'Family & Support', icon: 'users',          color: '#FB7185' },
  { name: 'Other',            icon: 'more-horizontal', color: '#8B8A99' },
];

/**
 * Income has its own purpose-built category set — never mixed with expense
 * categories. Seeded per group with kind = 'income'.
 */
export const INCOME_CATEGORIES: CategoryDef[] = [
  { name: 'Salary',           icon: 'briefcase',      color: '#3ECF8E' },
  { name: 'Freelance',        icon: 'edit-3',         color: '#2DD4BF' },
  { name: 'Business',         icon: 'trending-up',    color: '#22C55E' },
  { name: 'Interest',         icon: 'percent',        color: '#34D399' },
  { name: 'Dividends',        icon: 'pie-chart',      color: '#4ADE80' },
  { name: 'Rent Received',    icon: 'home',           color: '#86EFAC' },
  { name: 'Bonus',            icon: 'award',          color: '#A3E635' },
  { name: 'Cashback',         icon: 'corner-up-left', color: '#2DD4BF' },
  { name: 'Refunds',          icon: 'rotate-ccw',     color: '#86EFAC' },
  { name: 'Gifts Received',   icon: 'gift',           color: '#F9A8D4' },
  { name: 'Other Income',     icon: 'plus-circle',    color: '#8B8A99' },
];

/**
 * Sections group categories so the budget UI can present "pick a section →
 * see its categories". Derived from the catalog (no DB column) — custom
 * categories fall into "Other".
 */
export const CATEGORY_SECTIONS: { title: string; names: string[] }[] = [
  { title: 'Home & Living', names: ['Rent', 'Maintenance', 'Household Help', 'Home Supplies'] },
  { title: 'Food', names: ['Groceries', 'Food Delivery', 'Eating Out', 'Chai & Snacks'] },
  { title: 'Transport', names: ['Cab & Auto', 'Metro & Bus', 'Fuel', 'Parking & Toll'] },
  { title: 'Bills & Utilities', names: ['Electricity', 'Mobile Recharge', 'WiFi & Broadband', 'Bills'] },
  { title: 'Lifestyle', names: ['Shopping', 'Entertainment', 'Gym & Fitness', 'Salon & Grooming', 'Electronics', 'Gifts'] },
  { title: 'Health', names: ['Health & Pharmacy', 'Insurance'] },
  { title: 'Money & Growth', names: ['Investments / SIP', 'Savings', 'EMI & Loans', 'Education', 'Taxes'] },
  { title: 'Other', names: ['Travel', 'Family & Support', 'Other'] },
];

/** Income categories grouped into sections (mirrors expense sectioning). */
export const INCOME_SECTIONS: { title: string; names: string[] }[] = [
  { title: 'Earnings', names: ['Salary', 'Freelance', 'Business', 'Bonus'] },
  { title: 'Investments', names: ['Interest', 'Dividends', 'Rent Received'] },
  { title: 'Other', names: ['Refunds', 'Cashback', 'Gifts Received', 'Other Income'] },
];

/**
 * Transfer (settlement) categories — the "reason" a person moved money to another
 * is now a real category (kind = 'transfer'), managed in the Categories screen and
 * picked with the same UI as expense/income. Seeded per group.
 */
export const TRANSFER_CATEGORIES: CategoryDef[] = [
  { name: 'Repayment',   icon: 'corner-up-left',  color: '#8B7CF8' },
  { name: 'Rent',        icon: 'home',            color: '#A78BFA' },
  { name: 'Shared Bill', icon: 'file-text',       color: '#7C6AF7' },
  { name: 'Lent',        icon: 'arrow-up-right',  color: '#22D3EE' },
  { name: 'Borrowed',    icon: 'arrow-down-left', color: '#F0A500' },
  { name: 'Other',       icon: 'more-horizontal', color: '#8B8A99' },
];

/** Transfer categories grouped into sections (single section for now). */
export const TRANSFER_SECTIONS: { title: string; names: string[] }[] = [
  { title: 'Transfers', names: ['Repayment', 'Rent', 'Shared Bill', 'Lent', 'Borrowed'] },
  { title: 'Other', names: ['Other'] },
];

// Name→section for the name-only fallback. Expense sections are spread LAST so
// that a name shared across kinds (e.g. 'Rent' is both an expense and a transfer
// category) resolves to its EXPENSE section — the most common context. Kind-
// specific screens read the per-kind `section` column instead of this fallback.
const SECTION_OF: Record<string, string> = Object.fromEntries(
  [...TRANSFER_SECTIONS, ...INCOME_SECTIONS, ...CATEGORY_SECTIONS].flatMap(s => s.names.map(n => [n, s.title])),
);

/** The section a category belongs to by NAME (expense-biased for shared names).
 *  Prefer a category row's own `section` column when you have it. */
export function categorySection(name: string): string {
  return SECTION_OF[name] ?? 'Other';
}

/** Ordered list of section titles for grouping UIs. */
export const SECTION_ORDER = CATEGORY_SECTIONS.map(s => s.title);

/** name → {icon,color} lookup for rendering any stored category by name.
 *  Transfer cats listed last; on a name collision (e.g. 'Rent', 'Other') the
 *  expense/income visual wins, which is fine — they're near-identical. */
export const CATEGORY_LOOKUP: Record<string, { icon: FeatherName; color: string }> = Object.fromEntries(
  [...TRANSFER_CATEGORIES, ...DEFAULT_CATEGORIES, ...INCOME_CATEGORIES].map(c => [c.name, { icon: c.icon, color: c.color }]),
);

/** Special non-catalog categories that still need an icon/colour. */
const EXTRA_LOOKUP: Record<string, { icon: FeatherName; color: string }> = {
  Settlement: { icon: 'check-circle',   color: '#7C6AF7' },
  Income:     { icon: 'trending-up',    color: '#3ECF8E' },
  // The combined bucket for un-adopted category names (see lib/categoryFold).
  Others:     { icon: 'more-horizontal', color: '#8B8A99' },
};

/** Resolve icon + colour for any category name, with a sensible fallback. */
export function categoryVisual(name: string): { icon: FeatherName; color: string } {
  return CATEGORY_LOOKUP[name] ?? EXTRA_LOOKUP[name] ?? { icon: 'tag', color: '#8B8A99' };
}

export const AVATAR_COLORS = [
  '#E53E3E', '#DD6B20', '#D69E2E', '#38A169',
  '#319795', '#3182CE', '#553C9A', '#B83280',
  '#2D3748', '#744210',
];
