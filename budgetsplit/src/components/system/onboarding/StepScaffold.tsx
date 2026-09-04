import React, { useState } from 'react';
import { View, Text, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeIn } from '../../ui/FadeIn';
import { StepBack } from './StepBack';
import { StepProgress } from './StepProgress';
import { colors, type, space, layout } from '../../tokens';

type Props = {
  /** Distinguishes stages for `FadeIn`'s mount animation. */
  stageKey: string;
  onBack: () => void;
  /** 1-based step position. Omit on stages outside the numbered flow. */
  step?: number;
  total?: number;
  title: string;
  subtitle?: string;
  /**
   * `'top'` — the question leads (every questionnaire step).
   * `'bottom'` — the visual leads and the headline lands under it (value slides).
   * The reference app draws exactly this distinction and it's the right one: you read
   * a headline first when you're being *told* something, and last when you're being
   * *asked* something.
   */
  titlePosition?: 'top' | 'bottom';
  /** The step's own controls. */
  children: React.ReactNode;
  /** A `StepFooter`. Sits outside the scroll view so it can't scroll away. */
  footer: React.ReactNode;
  /** Rendered above the title — an icon disc, an illustration. */
  art?: React.ReactNode;
};

/**
 * The shared chrome for every non-hero onboarding step: back button + progress in one
 * top row, a scrolling body, and a pinned footer.
 *
 * Replaces `styles.nameScroll` — which was the container for six different stages
 * under a name that described only the first — plus the seven copies of the back
 * chevron and the `{ marginTop: space.lg }` override repeated on every title.
 *
 * The hero stage does **not** use this. It has its own layout, its own footer style
 * and its own bottom padding, all tuned to the logo animation, and it stays exactly
 * as it was.
 */
export function StepScaffold({
  stageKey, onBack, step, total, title, subtitle,
  titlePosition = 'top', children, footer, art,
}: Props) {
  const insets = useSafeAreaInsets();
  // Measured, not guessed: it is what keeps the focused field clear of the CTA.
  const [footerH, setFooterH] = useState(0);
  const onFooterLayout = (e: LayoutChangeEvent) => setFooterH(e.nativeEvent.layout.height);

  const heading = (
    <View style={styles.heading}>
      <Text style={styles.title}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );

  return (
    <FadeIn key={stageKey} style={styles.page}>
      <View style={styles.topRow}>
        <StepBack onPress={onBack} />
        {step != null && total != null && <StepProgress step={step} total={total} />}
      </View>

      {/*
        The keyboard adjusts this scroll view's *inset*, never the page's height.

        Onboarding used to sit in a `KeyboardAvoidingView behavior="padding"`,
        which shrank the whole container — and because this content container is
        `flexGrow: 1` + `justifyContent: 'center'`, every step re-centred itself
        into a box half the height the moment a field took focus. Art, title and
        subtitle all jumped. An inset lets the focused field scroll into view
        while the layout stays exactly where it was.
      */}
      <KeyboardAwareScrollView
        style={styles.fill}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        // Keep the focused field clear of the CTA, not merely clear of the keyboard.
        // Without this the field scrolls to the top of the keyboard and the footer
        // — which is lifted to sit exactly there — covers it again.
        bottomOffset={footerH}
        showsVerticalScrollIndicator={false}
      >
        {!!art && <View style={styles.art}>{art}</View>}
        {titlePosition === 'top' && heading}
        {children}
        {titlePosition === 'bottom' && heading}
      </KeyboardAwareScrollView>

      {/*
        The footer RIDES the keyboard instead of hiding behind it.

        It sits outside the scroll view so it cannot scroll away, which is right —
        but that also meant the keyboard covered it outright. The name step is the
        worst case and the reported one: a single `autoFocus` field, centred, with
        the keyboard up from the moment the step mounts, so both the field and the
        "Continue" button were underneath it.

        `KeyboardStickyView` translates its children by the keyboard height on the
        UI thread. It is the missing half of the argument above, not a retreat from
        it: the page still never resizes, so nothing re-centres and nothing jumps.

        `offset.opened` gives back the safe-area inset. The footer pads its bottom
        by `insets.bottom + space.md` (`useContentInset`), and the iOS keyboard
        frame ALREADY spans the home-indicator area — so lifting by the full frame
        height leaves that whole padding as dead space between the button and the
        keys, most of it reserving room for an indicator the keyboard is covering.
      */}
      <KeyboardStickyView offset={{ opened: insets.bottom }} onLayout={onFooterLayout}>
        {footer}
      </KeyboardStickyView>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: layout.screenPaddingH },
  fill: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, height: layout.touchMin },
  scroll: { flexGrow: 1, alignItems: 'stretch', justifyContent: 'center', paddingVertical: space.lg },
  art: { alignItems: 'center', marginBottom: space.lg },
  heading: { marginBottom: space.lg },
  title: { ...type.title, color: colors.textPrimary, textAlign: 'center' },
  subtitle: { ...type.body, color: colors.textSecondary, textAlign: 'center', marginTop: space.sm, lineHeight: 23, paddingHorizontal: space.sm },
});
