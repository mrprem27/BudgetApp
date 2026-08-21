import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
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
      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        {!!art && <View style={styles.art}>{art}</View>}
        {titlePosition === 'top' && heading}
        {children}
        {titlePosition === 'bottom' && heading}
      </ScrollView>

      {footer}
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
