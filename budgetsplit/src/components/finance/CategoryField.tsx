import { Chip } from '../ui/Chip';
import { IconCircle } from '../ui/IconCircle';
import { colors } from '../tokens';
import { categoryVisual } from '../../constants/categories';
import { asFeather } from '../../constants/palette';

/**
 * The one way a category is shown and chosen before its picker opens — a chip with the category's
 * own colour and glyph, or a neutral tag while none is set. Add and Review drew this two ways
 * (a `Chip` in one, a hand-rolled pill with a smaller disc in the other); both use this now
 * (`U-34`). The sheet behind it is `CategoryPicker` in both.
 */
export function CategoryField({ name, color, placeholder = 'Category', emptyIcon = 'tag', onPress, accessibilityLabel }: {
  /** The chosen category's name, or null/'' for none. */
  name: string | null | undefined;
  /** Its colour when the caller has one (Add's category rows carry it); else the catalog's. */
  color?: string | null;
  placeholder?: string;
  emptyIcon?: 'tag' | 'message-circle';
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const vis = name ? categoryVisual(name) : null;
  const tint = color ?? vis?.color ?? colors.accent;
  return (
    <Chip
      grow
      label={name || placeholder}
      leading={name ? <IconCircle icon={asFeather(vis?.icon, 'tag')} size={22} color={tint} iconSize={13} /> : undefined}
      icon={name ? undefined : emptyIcon}
      onPress={onPress}
      chevron
      accessibilityLabel={accessibilityLabel ?? (name ? `${placeholder}: ${name}` : `Choose ${placeholder.toLowerCase()}`)}
    />
  );
}
