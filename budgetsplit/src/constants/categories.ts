export type CategoryDef = {
  name: string;
  icon: string;
  color: string;
};

export const DEFAULT_CATEGORIES: CategoryDef[] = [
  { name: 'Food',          icon: 'coffee',        color: '#F0A500' },
  { name: 'Groceries',     icon: 'shopping-cart', color: '#3ECF8E' },
  { name: 'Rent',          icon: 'home',          color: '#7C6AF7' },
  { name: 'Utilities',     icon: 'zap',           color: '#60A5FA' },
  { name: 'Travel',        icon: 'map',           color: '#F472B6' },
  { name: 'Fuel',          icon: 'droplet',       color: '#FB923C' },
  { name: 'Medical',       icon: 'heart',         color: '#F06060' },
  { name: 'Shopping',      icon: 'tag',           color: '#A78BFA' },
  { name: 'Subscriptions', icon: 'repeat',        color: '#34D399' },
  { name: 'Other',         icon: 'more-horizontal',color: '#8B8A99' },
];

export const AVATAR_COLORS = [
  '#E53E3E', '#DD6B20', '#D69E2E', '#38A169',
  '#319795', '#3182CE', '#553C9A', '#B83280',
  '#2D3748', '#744210',
];
