export type CategoryDef = {
  name: string;
  icon: string;
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
  { name: 'Subscriptions',    icon: 'repeat',         color: '#2DD4BF' },
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

  // Other & income
  { name: 'Travel',           icon: 'map',            color: '#F472B6' },
  { name: 'Family & Support', icon: 'users',          color: '#FB7185' },
  { name: 'Other',            icon: 'more-horizontal', color: '#8B8A99' },

  // Income types
  { name: 'Salary',           icon: 'briefcase',      color: '#3ECF8E' },
  { name: 'Freelance',        icon: 'edit-3',         color: '#2DD4BF' },
  { name: 'Refunds',          icon: 'corner-up-left', color: '#86EFAC' },
];

/** name → {icon,color} lookup for rendering any stored category by name. */
export const CATEGORY_LOOKUP: Record<string, { icon: string; color: string }> = Object.fromEntries(
  DEFAULT_CATEGORIES.map(c => [c.name, { icon: c.icon, color: c.color }]),
);

/** Special non-catalog categories that still need an icon/colour. */
const EXTRA_LOOKUP: Record<string, { icon: string; color: string }> = {
  Settlement: { icon: 'check-circle', color: '#7C6AF7' },
  Income:     { icon: 'trending-up',  color: '#3ECF8E' },
};

/** Resolve icon + colour for any category name, with a sensible fallback. */
export function categoryVisual(name: string): { icon: string; color: string } {
  return CATEGORY_LOOKUP[name] ?? EXTRA_LOOKUP[name] ?? { icon: 'tag', color: '#8B8A99' };
}

export const AVATAR_COLORS = [
  '#E53E3E', '#DD6B20', '#D69E2E', '#38A169',
  '#319795', '#3182CE', '#553C9A', '#B83280',
  '#2D3748', '#744210',
];
