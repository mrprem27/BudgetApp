import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

/**
 * Whether the software keyboard is currently up.
 *
 * Used by screens with a sticky footer button: when the keyboard is open the
 * `KeyboardAvoidingView` already lifts the footer clear of the home indicator, so
 * adding `insets.bottom` on top of that leaves a visible dead gap. The idiom is
 *
 *   paddingBottom: (kbVisible ? space.sm : insets.bottom) + space.md
 *
 * which was written inline in `group/[id]/budget.tsx` with its own pair of
 * listeners; this is that, once.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  return visible;
}
