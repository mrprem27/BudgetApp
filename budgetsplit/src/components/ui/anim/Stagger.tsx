import React, { memo } from 'react';
import { FadeIn } from '../FadeIn';

type Props = {
  children: React.ReactNode;
  /** Per-child delay in ms. AGENTS.md §11 uses 55. */
  step?: number;
  /** Ceiling on the total cascade. AGENTS.md §11: "don't exceed 330ms total". */
  max?: number;
  offset?: number;
};

/**
 * Wraps each child in a `FadeIn` with an increasing delay, so a freshly mounted
 * list cascades in instead of appearing all at once.
 *
 * AGENTS.md §11 already specifies this as `delay={index * 55}` capped at 330ms —
 * but as a convention it had to be retyped at every call site, and the cap was
 * easy to blow past on a long list (20 rows × 55ms would be 1.1s of the user
 * waiting on decoration). Here the cap is enforced: past `max / step` children,
 * the delay stops growing.
 *
 * Do not use this inside a `FlatList`/`SectionList` `renderItem` — rows there
 * mount on recycle during scroll, so every row would re-animate as you scroll.
 * Wrap a static block, or use the list's own mount.
 */
export const Stagger = memo(function Stagger({ children, step = 55, max = 330, offset = 12 }: Props) {
  const cap = Math.max(0, Math.floor(max / step));
  return (
    <>
      {React.Children.map(children, (child, i) =>
        child == null ? child : (
          <FadeIn delay={Math.min(i, cap) * step} offset={offset}>
            {child}
          </FadeIn>
        ),
      )}
    </>
  );
});
