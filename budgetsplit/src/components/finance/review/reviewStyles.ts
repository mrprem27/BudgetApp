import { StyleSheet } from 'react-native';
import { colors, type, space, layout } from '../../tokens';

/**
 * Chrome for the Review screen — its header, section headers and bulk-action footer.
 *
 * Styles-only, mirroring `finance/txnCell.ts`: the screen file is under a CI line ceiling
 * (`sourceCounts.test.ts`) whose rule is *"never raise it — extract something first"*, and a
 * stylesheet is the part of a screen that is least about behaviour. Keeping it here also
 * makes the chrome reachable from `components/finance/review/*`, which previously could not
 * share it.
 *
 * Row styling is NOT here — that belongs to `ReviewRowCard`, which owns its own.
 */
export const reviewStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.sm },
  headerBlock: { gap: space.xs, marginBottom: space.xs },
  headerAction: { ...type.labelSemi, color: colors.accent },
  selectHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectAll: { ...type.labelSemi, color: colors.accent },
  stepLabel: { ...type.sectionLabel, color: colors.accent },
  intro: { ...type.label, color: colors.textMuted },
  // Sits between the header and the list, outside the scroll, so switching source never
  // requires scrolling back up to find the control.
  sourceTabs: { paddingHorizontal: layout.screenPaddingH, paddingBottom: space.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.md, paddingBottom: space.xs },
  sectionIcon: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  sectionHeaderText: { ...type.sectionLabel, color: colors.textMuted, flex: 1 },
  sectionHeaderCount: { ...type.caption, color: colors.textSecondary, fontFamily: 'SpaceMono_400Regular' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: layout.screenPaddingH, paddingTop: space.sm, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
  bulkBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  // SecondaryButton is width:100% by default; these shrink to their labels so the
  // Save button takes the remaining room.
  bulkBtn: { width: undefined, paddingHorizontal: space.md },
  bulkSaveWrap: { flex: 1 },
});
