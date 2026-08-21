import { Feather } from '@expo/vector-icons';
import { colors } from './colors';

export type FeatherName = keyof typeof Feather.glyphMap;

/**
 * Coerce a possibly-arbitrary (DB-sourced) icon string to a valid Feather glyph
 * name, falling back when it isn't one. This is the ONE place an icon string
 * crosses into the typed world — call sites stay cast-free, and an unknown name
 * renders the fallback instead of a "?" box.
 */
export function asFeather(name: string | null | undefined, fallback: FeatherName): FeatherName {
  return name && name in Feather.glyphMap ? (name as FeatherName) : fallback;
}

// Decorative hues used by charts and help illustrations. They carry no semantic
// meaning (so they're deliberately NOT in the `colors` token set), but they live
// here in one place rather than scattered as raw hex across screens.
export const decor = {
  orange: '#FB923C',
  blue: '#60A5FA',
  pink: '#F472B6',
  violet: '#A78BFA',
} as const;

/** Feather icons offered when creating/editing a group. */
export const GROUP_ICONS: readonly FeatherName[] = [
  'credit-card', 'home', 'users', 'map', 'coffee', 'shopping-cart', 'heart', 'zap', 'star', 'briefcase',
];

/** Swatches offered when creating/editing a group (decorative picker palette). */
export const GROUP_COLORS: readonly string[] = [
  '#4F46E5', '#E53E3E', '#38A169', '#D69E2E', '#3182CE', '#553C9A', '#B83280', '#DD6B20', '#319795', '#2D3748',
];

/** Feather icons offered when creating a custom category. */
export const CATEGORY_ICON_CHOICES: readonly FeatherName[] = [
  'coffee', 'shopping-cart', 'home', 'zap', 'wifi', 'smartphone', 'droplet',
  'truck', 'navigation', 'map', 'heart', 'activity', 'scissors', 'shopping-bag',
  'tag', 'film', 'music', 'repeat', 'monitor', 'gift', 'book-open', 'briefcase',
  'shield', 'trending-up', 'dollar-sign', 'credit-card', 'percent', 'box',
  'file-text', 'package', 'star', 'more-horizontal',
];

/** Swatches offered when creating a custom category (decorative picker palette). */
export const CATEGORY_COLOR_CHOICES: readonly string[] = [
  '#F0A500', '#3ECF8E', '#7C6AF7', '#60A5FA', '#F472B6', '#FB923C',
  '#F06060', '#A78BFA', '#34D399', '#22D3EE', '#FACC15', '#F43F5E',
  '#10B981', '#818CF8', '#E879F9', '#94A3B8',
];

/** Quick group "types" — each preset picks an icon + colour so creating a group
 *  is one tap. Colours are drawn from GROUP_COLORS / the brand tokens. */
export const GROUP_TYPES: { key: string; label: string; icon: FeatherName; color: string }[] = [
  // Labels are plain text: each entry already carries the `icon` beside it, so the
  // emoji that used to be baked into the label string was a second, unstyleable
  // glyph for the same idea (AGENTS §8 — Feather only).
  { key: 'home',      label: 'Home',      icon: 'home',      color: GROUP_COLORS[0] },
  { key: 'household', label: 'Household', icon: 'heart',     color: GROUP_COLORS[6] },
  { key: 'trip',      label: 'Trip',      icon: 'map',       color: colors.accent },
  { key: 'work',      label: 'Work',      icon: 'briefcase', color: '#7C6AF7' },
  { key: 'dining',    label: 'Dining',    icon: 'coffee',    color: '#F0A500' },
  { key: 'other',     label: 'Other',     icon: 'grid',      color: colors.textSecondary },
];

/** Feather icons offered when creating a savings goal. */
export const GOAL_ICONS: readonly FeatherName[] = [
  'smartphone', 'monitor', 'map', 'navigation', 'home', 'gift', 'umbrella', 'shield',
  'headphones', 'watch', 'camera', 'book', 'star', 'heart', 'award', 'target',
];

/** Swatches offered when creating a savings goal (decorative picker palette). */
export const GOAL_COLORS: readonly string[] = [
  '#20C4B8', '#F0A500', '#7C6AF7', '#3ECF8E', '#F472B6', '#FB923C', '#60A5FA', '#F06060',
];

/**
 * Series colors for charts — leads with brand/semantic tokens, then distinct
 * decorative hues for additional slices.
 *
 * This is the ONLY chart palette. A second, divergent `CHART_COLORS` used to
 * live in `components/finance/home/helpers.ts`; it had no consumers and was
 * deleted 2026-07-28. Add series colours here, never in a screen or helper.
 */
export const CHART_COLORS: readonly string[] = [
  colors.accent, colors.coral, colors.settle, colors.income, colors.healthAmber,
  decor.blue, decor.orange, decor.pink, decor.violet, colors.textSecondary,
];
