import { GROUP_HINTS } from './voiceInbox';

/**
 * The one-time setup for hands-free voice capture, as data.
 *
 * Both the Settings screen and the Help screen explain this, and an explanation that exists
 * twice drifts. So the steps, the examples and the keyword list live here once — and the
 * keyword list is *derived from* `GROUP_HINTS`, the same constant the router matches on, so
 * what the user is told can never disagree with what the app does.
 *
 * Pure data. No React, no filesystem.
 */

/** The folder inside the app's Files entry that the Shortcut saves into. */
export const VOICE_INBOX_FOLDER = 'voice-inbox';

/** What the app is called in the Files app, once file sharing is enabled. */
export const VOICE_FILES_LOCATION = `On My iPhone → BudgetSplit → ${VOICE_INBOX_FOLDER}`;

/**
 * The iCloud link that installs the ready-made shortcut in one tap.
 *
 * `null` until the shortcut has been authored in the Shortcuts app and shared — that
 * produces an `icloud.com/shortcuts/…` URL, and only the person with the Shortcuts app and
 * an iCloud account can create it. Apple mints and signs that link; there is no way to
 * generate one from here, and an invented URL would 404, which is strictly worse than
 * showing the steps.
 *
 * **To turn the one-tap button on:** Shortcuts app → long-press the shortcut → Share →
 * Copy iCloud Link → paste it here. Nothing else changes; the screen swaps its own content.
 * A JS-only edit, so a Metro reload picks it up with no native rebuild.
 */
export const VOICE_SHORTCUT_URL: string | null = null;

/**
 * Opens the Shortcuts app on a new, empty shortcut.
 *
 * Apple's own scheme, and the closest thing to one-tap available while `VOICE_SHORTCUT_URL`
 * is null: the manual path still starts with a single tap rather than "go and find another
 * app". Not a substitute for the install link — it opens the editor, it doesn't build
 * anything.
 */
export const SHORTCUTS_APP_URL = 'shortcuts://create-shortcut';

/** Worth saying out loud, given the app's "nothing leaves your device" promise. */
export const VOICE_SHORTCUT_PRIVACY =
  'The dictation itself is done by iOS on your device. Tapping the one-tap link above fetches '
  + 'the shortcut definition from Apple once, at setup — no transaction ever leaves your phone.';

export type VoiceStep = { title: string; body: string };

/**
 * The two ways to talk to the app, chosen by *which phrase you say* rather than by what the
 * app guesses from your words.
 *
 * This replaced keyword sniffing as the primary switch, and it is the better model: "dinner
 * with rice" contains "with" and is not a split, so inferring the mode from the sentence will
 * always misfire sometimes. A separate phrase never does. The keyword check survives only as
 * a safety net inside the one-way command — if a shared-sounding phrase does come through it,
 * the row waits in Review instead of posting as yours alone.
 */
export const VOICE_ONE_WAY_NAME = 'Log expense';
export const VOICE_TWO_WAY_NAME = 'Add expense';

export type VoiceCommand = {
  /** The shortcut's name, which is literally what you say after "Hey Siri". */
  name: string;
  summary: string;
  detail: string;
};

export const VOICE_COMMANDS: VoiceCommand[] = [
  {
    name: VOICE_ONE_WAY_NAME,
    summary: 'One-way — the app never opens',
    detail: 'Siri takes what you said, repeats it back, and you carry on. It is filed the next time you open BudgetSplit. Best for the everyday case: you are walking, paying, in a queue.',
  },
  {
    name: VOICE_TWO_WAY_NAME,
    summary: 'Two-way — opens the app, filled in',
    detail: 'Same dictation, but BudgetSplit opens straight away with everything already entered, so you can split it, change the category or add a photo before saving. Use this when the spend needs a decision.',
  },
];

/**
 * Building the one-way shortcut by hand, in the order the Shortcuts app presents the actions.
 *
 * Four actions, and the order matters: the timestamp has to be captured *before* the file is
 * named with it, and the file has to be named with it because that timestamp is what anchors
 * "yesterday" to when you spoke rather than to when the app next opened.
 */
export const VOICE_SHORTCUT_STEPS: VoiceStep[] = [
  {
    title: `New shortcut, named "${VOICE_ONE_WAY_NAME}"`,
    body: 'In the Shortcuts app, tap +. The name is what you say to Siri, so keep it short.',
  },
  {
    title: 'Add "Dictate Text"',
    body: 'Set the language to English (India) if it is offered. This is the step that listens; iOS does it on the device.',
  },
  {
    title: 'Add "Current Date", then "Format Date"',
    body: 'Set Date Format to Custom and put  yyyyMMddHHmmss  in the Format String field. '
      + 'This records when you spoke — without it, saying "yesterday" late at night would be '
      + 'filed against the wrong day. (Shortcuts has no Unix-timestamp option; this is the '
      + 'format it can produce, and the app understands it.)',
  },
  {
    title: `Add "Save File" into ${VOICE_FILES_LOCATION}`,
    body: 'Set the file to the Dictated Text, turn OFF "Ask Where to Save", and pick the BudgetSplit folder once. In the Subpath field put  '
      + `${VOICE_INBOX_FOLDER}/  followed by the timestamp and .txt — the trailing slash is what makes it a folder rather than a filename.`,
  },
];

/**
 * The two-way command, which is a single action and needs no folder.
 *
 * Kept separate because it is genuinely simpler — anyone who finds the four-step version
 * daunting can set this one up in under a minute and still get voice entry.
 */
export const VOICE_TWO_WAY_STEPS: VoiceStep[] = [
  {
    title: `New shortcut, named "${VOICE_TWO_WAY_NAME}"`,
    body: 'Tap + in the Shortcuts app.',
  },
  {
    title: 'Add "Dictate Text"',
    body: 'The same on-device dictation as above.',
  },
  {
    title: 'Add "Open URL"',
    body: 'Set it to  budgetsplit:///add/quick?q=  followed by the Dictated Text variable. BudgetSplit opens with the amount, category and date already filled in — nothing is saved until you tap Save.',
  },
];

/** Phrases that work well, for the "try saying" hints. */
export const VOICE_PHRASE_EXAMPLES = [
  'four fifty groceries',
  'twelve hundred rent yesterday',
  'chai dus rupaye',
];

/**
 * The words that make a phrase open the app instead of filing silently.
 *
 * Derived, never re-typed: the Shortcut matches on this same set, and the router uses it to
 * decide that a phrase needs people chosen before it can become a transaction.
 */
export const VOICE_GROUP_KEYWORDS: readonly string[] = GROUP_HINTS;

/** One-line summary of the routing, used in both Settings and Help. */
export const VOICE_ROUTING_SUMMARY =
  `Say one of ${VOICE_GROUP_KEYWORDS.slice(0, 4).join(', ')} and BudgetSplit opens so you can `
  + 'choose who shares it. Anything else is filed on its own and you never leave what you were doing.';

/**
 * What happens to the words themselves, in the order they are decided. Shown in Help, because
 * "where did my sentence go" is the first question a voice feature has to answer.
 */
export const VOICE_FIELD_RULES: VoiceStep[] = [
  {
    title: 'Just an amount and a category',
    body: '"four fifty groceries" → ₹450 under Groceries. Nothing else is stored, because nothing else was said.',
  },
  {
    title: 'Extra words become the title',
    body: '"450 zomato biryani" → the title is "zomato biryani", and the category is worked out from it exactly as if you had typed it. Unrecognised names land in Other, which shows in reports as uncategorised rather than hiding in the wrong category.',
  },
  {
    title: 'A long phrase spills into the note',
    body: 'The first few words title it and the remainder becomes the note, so nothing you said is thrown away.',
  },
  {
    title: 'Anything needing a decision opens the app',
    body: 'Splits, and anything the one-way command was not sure about, wait in Review or open on the Add screen — a guess about who owes what is not worth making.',
  },
];
