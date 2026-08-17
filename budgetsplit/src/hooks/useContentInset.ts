import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, space } from '../theme';

type Opts = {
  /** A FAB floats over this list — reserve its height so the last row clears it. */
  fab?: boolean;
  /** The screen sits under the tab bar. */
  tabBar?: boolean;
  /** A measured sticky footer height (from `onLayout`), in px. */
  footer?: number;
};

/**
 * The bottom padding a scroll container needs so its last row isn't hidden
 * behind the safe area, the tab bar, a FAB, or a sticky footer.
 *
 * This exists because that number was being guessed. The codebase had
 * `paddingBottom: 100` in three group tabs, `insets.bottom + 96` in Review,
 * `insets.bottom + 40` in Quick Add, plus `+ space.lg` / `+ space.xl` /
 * `+ tabBarHeight + space.lg` variants elsewhere — none of which tracked the
 * thing they were clearing. An August 2026 device audit confirmed the FAB overlapping
 * real content on six separate screens as a result.
 *
 * Pass what actually overlaps the list and let the maths follow the tokens.
 */
export function useContentInset({ fab, tabBar, footer }: Opts = {}): number {
  const insets = useSafeAreaInsets();

  let pad = insets.bottom + space.md;
  if (tabBar) pad += layout.tabBarHeight;
  if (fab) pad += layout.fabHeight + space.sm;
  if (footer) pad += footer;

  return pad;
}
