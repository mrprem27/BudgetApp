import React from 'react';
import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { colors } from '../tokens';

type Props = {
  /** `ScreenHeader` / `ModalHeader`, rendered above the content and outside any
   *  scroll container so it stays put. */
  header?: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * The screen root: fills the window and paints the app background.
 *
 * Trivial on its own — the point is that 32 screens each declared
 * `container: { flex: 1, backgroundColor: colors.bg }` in their own StyleSheet.
 * A single named root also gives the header a fixed place, which is what stopped
 * being true on the group hub: it renders `ScreenHeader` in its error branches
 * but a hand-rolled breadcrumb in its loaded branch, so the header changed
 * shape and height depending on load state.
 */
export function Screen({ header, children, style }: Props) {
  return (
    <View style={[styles.root, style]}>
      {header}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
