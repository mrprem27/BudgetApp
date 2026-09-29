import { Alert } from 'react-native';

/**
 * Long-press on a name that a list cut short shows all of it. A native alert, not a popover: it
 * works inside sheets without a nested modal (the bug `ScanPaySheet` once had), and it needs no
 * layout of its own. The rule everywhere: one line and an ellipsis in a list, the full text on hold.
 *
 * Spread onto a `PressableScale`: `<PressableScale {...fullTextOnHold(name)} />`.
 */
export function fullTextOnHold(text: string | null | undefined): { onLongPress?: () => void } {
  const t = text?.trim();
  if (!t) return {};
  return { onLongPress: () => Alert.alert(t) };
}
