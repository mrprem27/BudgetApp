/** The minimum a group must expose for this to sort it. */
type Groupish = { is_personal?: number | null };

export type GroupsTabView<T> = {
  /** What the active list renders, Personal pinned first. */
  active: T[];
  /**
   * Whether to offer "No groups yet" + the New Group CTA. **Not** `active.length
   * === 0` — see below.
   */
  showEmptyPrompt: boolean;
};

/**
 * What the Groups tab shows in its active view.
 *
 * ## Why this is not `list.length === 0`
 *
 * `seedIfNeeded` creates the Personal group on first launch, unconditionally. So
 * the active list has **never** been empty, and the `ListEmptyComponent` the screen
 * declares — icon disc, title, explanation, "New Group" — has never once rendered.
 * A brand-new user saw a single "Personal" card and, as the only way forward, the
 * bare `+` glyph in the header: the unlabelled-door failure `OV-16` fixed on the
 * Plan screen, sitting unnoticed on the tab whose whole job is starting a group.
 *
 * Onboarding used to hide it by building a group from the people step. `W1-08`
 * removed that, on the grounds that which groups someone belongs to is a question
 * for where groups are made — which turned a latent hole into the first thing a
 * real user meets.
 *
 * So the two questions are separated. *What do we list?* includes Personal, always:
 * when `flags.splitting` is on, this list is the only route into the Personal
 * ledger (the tab bar's direct `/personal` slot exists only for the splitting-off
 * persona), so dropping it would trade a missing empty state for a missing ledger.
 * *Have you got any groups?* is about the shared ones only — Personal is seeded,
 * not something you made.
 *
 * The prompt therefore renders **under** the Personal card rather than instead of
 * it, which is also why it must not take `fill` (AGENTS §2: there is real content
 * above it).
 *
 * Pure and generic so it can be tested — the screen cannot be, since nothing in the
 * suite renders a component.
 */
export function groupsTabView<T extends Groupish>(groups: readonly T[]): GroupsTabView<T> {
  const shared = groups.filter(g => g.is_personal !== 1);
  const personal = groups.find(g => g.is_personal === 1);

  return {
    active: personal ? [personal, ...shared] : shared,
    showEmptyPrompt: shared.length === 0,
  };
}
