import React from 'react';
import { Feather } from '@expo/vector-icons';
import { PayMethodDisc } from './pay/PayMethodGlyph';
import { colors, layout } from '../tokens';
import { haptic } from '../../lib/haptics';
import { Card } from '../ui/Card';
import { Divider } from '../ui/Divider';
import { ListRow } from '../ui/ListRow';
import {
  PAY_METHOD, PAY_METHOD_LABEL, PAY_METHOD_HINT, type PayMethod,
} from '../../constants/enums';
import { accountsToChoose, chosenAccountId, type AccountChoice } from '../../lib/paidFrom';

type Props = {
  /** `''` selects nothing — an imported Review row may carry no pay-method cue. */
  value: PayMethod | '';
  /** `accountId` is set when the row picked is one of several accounts of that kind (`U-68`). */
  onChange: (m: PayMethod, accountId?: string) => void;
  /** Accent colour for the selected row (defaults to the app accent). */
  accent?: string;
  /**
   * Restrict which methods are offered. Income uses this to ask "where did it
   * land?" — money arrives in cash, a bank account or a wallet; it doesn't arrive
   * "by card". Defaults to everything a person may pick.
   */
  options?: readonly PayMethod[];
  /** Live accounts; omitted, the picker offers kinds only. */
  accounts?: readonly AccountChoice[];
  accountId?: string | null;
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
 * exactly one place.
 */
export function PayMethodSelector({
  value, onChange, accent = colors.accent, options = PAY_METHOD, accounts = [], accountId,
}: Props) {
  // A kind with several accounts lists them by name; one account per kind reads as before (`U-68`).
  type Row = { key: string; method: PayMethod; title: string; subtitle?: string; on: boolean; id?: string };
  const rows = options.flatMap((m): Row[] => {
    const several = accountsToChoose(accounts, m);
    if (several.length === 0) {
      return [{ key: m, method: m, title: PAY_METHOD_LABEL[m], subtitle: PAY_METHOD_HINT[m], on: value === m }];
    }
    const chosen = value === m ? chosenAccountId(accounts, m, accountId) : undefined;
    return several.map(a => ({ key: a.id, method: m, title: a.name, subtitle: PAY_METHOD_LABEL[m], on: chosen === a.id, id: a.id }));
  });
  return (
    <Card clip>
      {rows.map((r, i) => (
        <React.Fragment key={r.key}>
          {i > 0 && <Divider indent="text" />}
          <ListRow
            leading={<PayMethodDisc method={r.method} size={layout.iconCircle} color={r.on ? accent : colors.textSecondary} />}
            title={r.title}
            subtitle={r.subtitle}
            chevron={false}
            selected={r.on}
            value={r.on ? <Feather name="check" size={18} color={accent} /> : undefined}
            onPress={() => { haptic.selection(); onChange(r.method, r.id); }}
          />
        </React.Fragment>
      ))}
    </Card>
  );
}
