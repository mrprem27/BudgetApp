/**
 * Every sentence the app says about a group budget and about overriding it.
 *
 * ## Why this file exists
 *
 * A group budget has two properties that are counter-intuitive enough that the app
 * has to state them, and it was stating them in **four** places, in four different
 * words: the Budget tab's empty state and its overview caption, the editor's
 * per-level hint, and the consent sheet before your first override. Four wordings
 * of one policy is how a policy stops being learnable — the same failure
 * `lib/trustCopy.ts` was written for.
 *
 * ## The two facts, in full
 *
 * 1. **An amount is per person, not a pot to divide.** ₹10,000 of Groceries in a
 *    four-person flat is ₹10,000 each, not ₹2,500. It is the line every member
 *    starts from.
 * 2. **Your own amount replaces the group's — for you, in this group, per
 *    category.** Categories you leave blank keep following the group, and clearing
 *    an amount goes back to following it. Nobody else sees yours and the group's
 *    copy never changes.
 *
 * The second half of each is not optional. "Your own amounts replace the group's"
 * without "for the categories you fill in" is what made an override read as
 * all-or-nothing, and "per person" without "not a pot to divide" is what made a
 * four-person grocery budget look four times too big.
 *
 * Pure strings, no React and no db, so `budgetCopy.test.ts` can assert that no
 * screen hand-writes its own version.
 */

/** What an admin-set line means for everyone. Fact 1. */
export const perPersonMeans =
  'This is what each member gets, not a pot to share out — ₹10,000 of Groceries in a '
  + 'flat of four is ₹10,000 each.';

/** What setting your own does. Fact 2, both halves. */
export const overrideMeans = (groupName: string): string =>
  `Your amounts replace ${groupName}'s — only for you, only here, and only for the `
  + 'categories you fill in. Ones you leave blank keep following the group.';

/** How to undo it. Stated wherever the override is offered, so it isn't a one-way door. */
export const overrideIsReversible =
  'Clear an amount any time to go back to following the group.';

/** That it is private. Separate from the mechanics — it answers a different worry. */
export const overrideIsPrivate =
  "Nobody else sees your amounts, and the group's copy doesn't change.";

/**
 * The empty Budget tab, by what this viewer is allowed to set.
 *
 * An admin sets what everyone inherits; a member can only set their own. Saying
 * which is the difference between an invitation and a dead end.
 */
export const budgetEmptyBody = (canEditGroupDefault: boolean, groupName: string): string =>
  canEditGroupDefault
    ? `Give a category a limit — one-time, daily, monthly or yearly. ${perPersonMeans} `
      + PERIOD_RESETS
    : `Set your own limits for this group. ${overrideMeans(groupName)} ${overrideIsPrivate}`;

export const budgetEmptyCta = (canEditGroupDefault: boolean): string =>
  canEditGroupDefault ? "Set the group's budget" : 'Set my budget for this group';

/** Each period starts fresh. Said on the empty state and in the editor. */
export const PERIOD_RESETS =
  "Each period starts fresh: the limit resets and unused amount doesn't carry over.";

/**
 * The caption under the overview figure.
 *
 * Once you have your own amounts the allocated figure is *yours* rather than the
 * group's, so it must stop claiming to be what everyone gets.
 */
export const budgetCaption = (opts: {
  scope: 'group' | 'global';
  allocated: string;
  overrideCount?: number;
}): string => {
  if (opts.scope === 'global') {
    return `of ${opts.allocated} this month · your share across personal and every group`;
  }
  const n = opts.overrideCount ?? 0;
  return n > 0
    ? `of ${opts.allocated} for you this month · your own in ${n} ${n === 1 ? 'category' : 'categories'}`
    : `of ${opts.allocated} per person this month`;
};

/** The editor's hint line, per scope and level. */
export const budgetEditorHint = (opts: {
  scope: 'group' | 'global';
  level: 'group' | 'personal';
  groupName: string;
  overrideCount: number;
}): string => {
  if (opts.scope === 'global') {
    return 'Your limits across everything — personal spending and your share of every group.';
  }
  if (opts.level === 'personal') {
    return `${overrideMeans(opts.groupName)} ${overrideIsReversible}`;
  }
  return opts.overrideCount > 0
    ? `The amount every member starts from. ${perPersonMeans} You have your own for some categories.`
    : `The amount every member starts from, including you until you set your own. ${perPersonMeans}`;
};

/** The consent sheet shown before your first override in a group. */
export const overrideConfirmTitle = 'Set your own budget here?';

export const overrideConfirmBody = (groupName: string): string[] => [
  `You follow ${groupName}'s budget right now. ${overrideMeans(groupName)}`,
  `${overrideIsPrivate} Every category you fill in stops following the group: if an admin `
  + 'changes that category later, your amount stays.',
  overrideIsReversible,
];

export const overrideConfirmCta = 'Set my own';
export const overrideConfirmCancel = 'Keep following the group';
