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
 * an iCloud account can create it. While it is null the app shows the manual steps below,
 * which work today; setting it turns on the one-tap button with no other change.
 */
export const VOICE_SHORTCUT_URL: string | null = null;

/** Worth saying out loud, given the app's "nothing leaves your device" promise. */
export const VOICE_SHORTCUT_PRIVACY =
  'The dictation itself is done by iOS on your device. Tapping the one-tap link above fetches '
  + 'the shortcut definition from Apple once, at setup — no transaction ever leaves your phone.';

export type VoiceStep = { title: string; body: string };

/**
 * Building the shortcut by hand, in the order the Shortcuts app presents the actions.
 *
 * Four actions, and the order matters: the timestamp has to be captured *before* the file is
 * named with it, and the file has to be named with it because that timestamp is what anchors
 * "yesterday" to when you spoke rather than to when the app next opened.
 */
export const VOICE_SHORTCUT_STEPS: VoiceStep[] = [
  {
    title: 'New shortcut, named "Log expense"',
    body: 'In the Shortcuts app, tap +. The name is what you say to Siri, so keep it short — "Log expense" works well.',
  },
  {
    title: 'Add "Dictate Text"',
    body: 'Set the language to English (India) if it is offered. This is the step that listens; iOS does it on the device.',
  },
  {
    title: 'Add "Current Date", formatted as a Unix timestamp in milliseconds',
    body: 'This records when you spoke. Without it, saying "yesterday" late at night would be filed against the wrong day.',
  },
  {
    title: `Add "Save File" into ${VOICE_FILES_LOCATION}`,
    body: 'Turn OFF "Ask Where to Save" and pick that folder once. Name the file with the timestamp from the previous step, ending in .txt, and set the contents to the dictated text.',
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
