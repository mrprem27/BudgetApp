import React, { forwardRef, useState } from 'react';
import { View, StyleSheet, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space, layout } from '../tokens';

/**
 * Gap between a focused field (or a pinned footer) and the top of the keyboard.
 * Enough that a button riding above the keys is never one mis-aimed key away.
 */
export const KEYBOARD_GAP = space.md;

type Props = {
  children: React.ReactNode;
  /**
   * Pinned below the scroll body. By default the keyboard **covers** it: close
   * the keyboard (its own return key, a tap outside the field, or a drag down)
   * and the button is where it always is.
   */
  footer?: React.ReactNode;
  /**
   * Lift the footer above the keyboard instead. Only for a real multi-field form
   * whose point is to type several things and save (the budget editor) — not
   * for a one-question screen, where it just crowds the keys.
   */
  footerAboveKeyboard?: boolean;
  /**
   * Where content sits when it is shorter than the screen.
   * - `'top'` (default): under the header, like any iOS form.
   * - `'upper-third'`: a third of the way into the free space — balanced with the
   *   keyboard down, and already above where the keyboard lands when it comes up,
   *   so nothing has to move. For single-question screens (onboarding, sign-in).
   *   Never `'center'`: centred content sits exactly where the keyboard arrives.
   */
  anchor?: 'top' | 'upper-third';
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  /** Horizontal padding for the pinned footer. Defaults to the screen gutter. */
  footerStyle?: StyleProp<ViewStyle>;
} & Pick<ScrollViewProps, 'refreshControl' | 'showsVerticalScrollIndicator' | 'onScroll' | 'scrollEventThrottle'>;

/**
 * The one container for a screen that takes typing (AGENTS.md §6b).
 *
 * Every form used to pick its own answer, and the three answers disagreed:
 * a whole-screen `KeyboardAvoidingView` (the footer rode up, but a lower field
 * was never scrolled into view), a `KeyboardAwareScrollView` with the footer
 * outside it (fields scrolled, the footer hid behind the keys), or nothing.
 * This is both halves, once:
 *
 * - the body scrolls the focused field into view above the keyboard (and above
 *   the footer, when it rides the keyboard);
 * - the footer stays put and the keyboard covers it — unless the screen is a
 *   real form and asks for `footerAboveKeyboard`;
 * - the keyboard adds an inset, never a height change, so a layout never
 *   re-flows when a field takes focus;
 * - dragging the body down, or tapping outside a field, dismisses the keyboard —
 *   a number pad has no return key, so that is how it closes.
 *
 * `keyboardSourceGuard.test.ts` fails on a screen that renders an input outside
 * this, a sheet (`DraggableSheet` handles its own), or `keyboardAwareScroll`.
 */
export const KeyboardForm = forwardRef<KeyboardAwareScrollViewRef, Props>(function KeyboardForm(
  { children, footer, footerAboveKeyboard = false, anchor = 'top', contentContainerStyle, style, footerStyle, ...scrollProps },
  ref,
) {
  const insets = useSafeAreaInsets();
  const [footerH, setFooterH] = useState(0);
  const bottomOffset = footer && footerAboveKeyboard ? footerClearance(footerH, insets.bottom) : KEYBOARD_GAP;

  return (
    <View style={[styles.fill, style]}>
      <KeyboardAwareScrollView
        ref={ref}
        style={styles.fill}
        contentContainerStyle={[styles.content, contentContainerStyle]}
        bottomOffset={bottomOffset}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        {...scrollProps}
      >
        {anchor === 'upper-third' ? (
          <>
            <View style={styles.spaceAbove} />
            {children}
            <View style={styles.spaceBelow} />
          </>
        ) : children}
      </KeyboardAwareScrollView>

      {footer ? (
        <KeyboardFooter style={footerStyle} onHeight={setFooterH} aboveKeyboard={footerAboveKeyboard}>{footer}</KeyboardFooter>
      ) : null}
    </View>
  );
});

/**
 * How far above the keyboard a focused field must sit to clear a lifted
 * `KeyboardFooter` of this measured height: the footer's top is (height − its
 * bottom padding + gap) above the keyboard, and the field wants a gap of its own.
 */
export function footerClearance(footerHeight: number, insetBottom: number): number {
  return Math.max(0, footerHeight - (insetBottom + space.sm)) + 2 * KEYBOARD_GAP;
}

/**
 * A screen's bottom actions, pinned below its content, clearing the home
 * indicator. The keyboard covers it (decided 2026-09-25: a button that jumps up
 * over the keys crowds a one-question screen). `aboveKeyboard` lifts it over
 * the keyboard instead — for a real multi-field form only. Opaque, because lifted it sits over content.
 */
export function KeyboardFooter({ children, style, onHeight, aboveKeyboard = false }: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onHeight?: (height: number) => void;
  aboveKeyboard?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const pad = insets.bottom + space.sm;
  return (
    <KeyboardStickyView
      enabled={aboveKeyboard}
      // Closed: the bottom padding clears the home indicator. Opened: the
      // keyboard's height already includes that inset, so give it back and keep
      // only the gap.
      offset={{ closed: 0, opened: pad - KEYBOARD_GAP }}
      style={[styles.footer, { paddingBottom: pad }, style]}
      onLayout={onHeight ? e => onHeight(e.nativeEvent.layout.height) : undefined}
    >
      {children}
    </KeyboardStickyView>
  );
}

/**
 * For a virtualized list with inputs in its rows (Review, Itemized's assign
 * step): `renderScrollComponent={keyboardAwareScroll(footerHeight)}` gives the
 * list the same keyboard handling as `KeyboardForm`'s body. `aboveKeyboard` is
 * the height of anything pinned over the list's bottom edge that rides above the
 * keyboard, which a focused row must also clear.
 */
export function keyboardAwareScroll(aboveKeyboard = 0) {
  return function KeyboardAwareListScroll(props: ScrollViewProps) {
    return (
      <KeyboardAwareScrollView
        {...props}
        bottomOffset={aboveKeyboard + KEYBOARD_GAP}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      />
    );
  };
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flexGrow: 1 },
  spaceAbove: { flex: 1, minHeight: space.lg },
  spaceBelow: { flex: 2, minHeight: space.lg },
  // Opaque: lifted, it sits over the bottom of the scroll body.
  footer: { paddingHorizontal: layout.screenPaddingH, paddingTop: space.sm, backgroundColor: colors.bg },
});
