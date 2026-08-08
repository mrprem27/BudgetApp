import React from 'react';
import { Feather } from '@expo/vector-icons';
import { ListRow } from './ListRow';
import { colors, layout } from '../tokens';

type Props = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value?: string;
  /** Tint of the icon circle (defaults to accent). */
  tint?: string;
  onPress?: () => void;
  /** Show a chevron on the right (defaults to true when onPress is set). */
  chevron?: boolean;
  /** Custom right-side element (overrides value/chevron). */
  right?: React.ReactNode;
  danger?: boolean;
};

/**
 * One row inside a settings-style card: icon circle + label + value/chevron.
 * Group several inside a `Card` with `<Divider indent="text" />` between them.
 *
 * Now a thin adapter over `ListRow`, which is the general row primitive. The
 * props and geometry here are unchanged — `ListRow`'s inline variant was built
 * to match this component's metrics exactly — so the ~30 screens using it are
 * untouched. Prefer `ListRow` directly in new code; it also does the stacked
 * label-above-value form that this shape can't.
 */
export function SettingsRow({ icon, label, value, tint = colors.accent, onPress, chevron, right, danger }: Props) {
  return (
    <ListRow
      icon={icon}
      iconColor={tint}
      title={label}
      // `right` takes the value slot when given — ListRow renders nodes as-is
      // and styles bare strings, which is the same precedence this had before.
      value={right ?? value}
      onPress={onPress}
      chevron={chevron}
      danger={danger}
      accessibilityLabel={label}
    />
  );
}

/**
 * @deprecated Use `<Divider indent="text" />`. Kept so existing callers keep
 * working; it resolves to the same 64px indent.
 */
export const settingsRowDivider = {
  height: 1,
  backgroundColor: colors.border,
  marginLeft: layout.dividerIndent,
};
