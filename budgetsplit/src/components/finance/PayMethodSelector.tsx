import React from 'react';
import { Feather } from '@expo/vector-icons';
import { colors } from '../tokens';
import { haptic } from '../../lib/haptics';
import { Card } from '../ui/Card';
import { Divider } from '../ui/Divider';
import { ListRow } from '../ui/ListRow';
import {
  PAY_METHOD_CHOOSABLE, PAY_METHOD_LABEL, PAY_METHOD_ICON, type PayMethod,
} from '../../constants/enums';

type Props = {
  /** `''` selects nothing — an imported Review row may carry no pay-method cue. */
  value: PayMethod | '';
  onChange: (m: PayMethod) => void;
  /** Accent colour for the selected row (defaults to the app accent). */
  accent?: string;
  /**
   * Restrict which methods are offered. Income uses this to ask "where did it
   * land?" — money arrives in cash, a bank account or a wallet; it doesn't arrive
   * "by card". Defaults to everything a person may pick.
   */
  options?: readonly PayMethod[];
};

/**
 * The one pay-method picker, everywhere a payment method is chosen.
 *
 * ## Why it is a list and not a strip of tiles
 *
 * It was a horizontal scroll of 68pt tiles, and there was a **second** picker:
 * onboarding's pay step hand-rolled the same choice as `ListRow`s in a `Card`.
 * One enum, one question, two designs — and the horizontal one was the worse of
 * the two. It hid its own options off the right edge, so how many methods existed
 * depended on whether you thought to swipe; and on the onboarding money step it
 * sat 16pt from the footer with nothing after it, which is what made that screen
 * read as cut off.
 *
 * A list shows every option at once, matches every other "pick one of these" in
 * the app, and reaches the 44pt touch target without a `hitSlop`. `ListRow` +
 * `Card` + `Divider` are the same primitives Settings uses, so this is now one
 * component rather than two half-shared ones.
 *
 * The set, the labels and the glyphs still come from the enum, so they live in
 * exactly one place — and the default set is `PAY_METHOD_CHOOSABLE`, which drops
 * `Autopay` because that is detected on an import and never picked (`OV-28`).
 */
export function PayMethodSelector({
  value, onChange, accent = colors.accent, options = PAY_METHOD_CHOOSABLE,
}: Props) {
  return (
    <Card clip>
      {options.map((m, i) => {
        const on = value === m;
        return (
          <React.Fragment key={m}>
            {i > 0 && <Divider indent="text" />}
            <ListRow
              icon={PAY_METHOD_ICON[m]}
              iconColor={on ? accent : colors.textSecondary}
              title={PAY_METHOD_LABEL[m]}
              chevron={false}
              selected={on}
              value={on ? <Feather name="check" size={18} color={accent} /> : undefined}
              onPress={() => { haptic.selection(); onChange(m); }}
            />
          </React.Fragment>
        );
      })}
    </Card>
  );
}
