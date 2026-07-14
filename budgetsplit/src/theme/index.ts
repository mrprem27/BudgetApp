/**
 * The canonical BudgetSplit design theme. This folder is the single source of
 * truth for every design token (colours, typography, spacing, radius, shadow,
 * gradients). Import tokens from here:
 *
 *   import { colors, type, space, radius, shadow } from '@/theme';   // or a relative path
 *   import { theme } from '@/theme';                                  // whole system
 *
 * Back-compat: `src/constants/{colors,typography,layout}` and
 * `src/components/tokens` re-export from here, so existing imports keep working.
 */
import { colors, gradients } from './colors';
import { type, line } from './typography';
import { space, radius, layout, shadow } from './layout';

export { colors, gradients } from './colors';
export { type, line } from './typography';
export { space, radius, layout, shadow } from './layout';

/** Every token group in one object — pass the whole design system when needed. */
export const theme = { colors, gradients, type, line, space, radius, layout, shadow } as const;
export type Theme = typeof theme;
