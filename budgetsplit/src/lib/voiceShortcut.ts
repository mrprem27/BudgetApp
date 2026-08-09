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
 * The iCloud links that install the ready-made shortcuts in one tap.
 *
 * Apple mints and signs these; there is no way to generate one from code, so they had to be
 * authored in the Shortcuts app and shared by hand. That is also why they are constants
 * rather than anything derived — an invented URL 404s, which is strictly worse than showing
 * the manual steps.
 *
 * ⚠️ **Editing a shortcut invalidates its link.** Apple serves the version that was shared,
 * so a re-share produces a new URL and the old one keeps handing out the stale build. If you
 * change a shortcut, re-share it and replace the constant here.
 *
 * Set to `null` to fall back to the manual steps — the screens key off that, so removing a
 * broken link degrades cleanly rather than sending people to a dead page.
 */
export const VOICE_SHORTCUT_URL: string | null =
  'https://www.icloud.com/shortcuts/ca2dde1249b54e909d049b415023d5f9';

/** The two-way command's install link. See the caveats on {@link VOICE_SHORTCUT_URL}. */
export const VOICE_TWO_WAY_URL: string | null =
  'https://www.icloud.com/shortcuts/e14ac98829434565b8db80291f31b4df';

/**
 * What iOS asks for the first time a capture is saved, and why it is not a fault.
 *
 * The Shortcut writes into another app's folder, so iOS asks once for permission. It arrives
 * unexplained and mid-dictation, which reads as something having gone wrong — saying so up
 * front is the whole fix.
 */
export const VOICE_FIRST_RUN_NOTE =
  'The first time you use it, iOS asks permission to save into BudgetSplit. Allow it once and '
  + 'it never asks again — that prompt is iOS checking, not something going wrong.';

/**
 * Opens the Shortcuts app on a new, empty shortcut.
 *
 * Apple's own scheme, and the closest thing to one-tap available while `VOICE_SHORTCUT_URL`
 * is null: the manual path still starts with a single tap rather than "go and find another
 * app". Not a substitute for the install link — it opens the editor, it doesn't build
 * anything.
 */
export const SHORTCUTS_APP_URL = 'shortcuts://create-shortcut';

/**
 * The deep link the two-way command opens.
 *
 * Kept here rather than typed into the instructions, so what the user is told to enter is the
 * same string `app/add/quick.tsx` reads its `q` param from.
 *
 * Deliberately not URL-encoded in the instructions: a spoken phrase contains spaces but no `&`
 * or `#`, and a query value is only delimited by those — so `?q=four fifty groceries` parses
 * correctly even unencoded. If a phrase ever does arrive truncated, a "URL Encode" text action
 * before this one is the fix.
 */
export const VOICE_DEEP_LINK = 'budgetsplit:///add/quick?q=';

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
  /** Feather glyph for the command's row. */
  icon: 'zap' | 'external-link';
  /** One-tap install, or null to fall back to this command's manual steps. */
  installUrl: string | null;
  /** The manual build, shown behind a disclosure when the link is unavailable or refused. */
  steps: VoiceStep[];
};


/**
 * Building the one-way shortcut by hand, in the order the Shortcuts app presents the actions.
 *
 * The order is a dependency chain, not a preference: nothing can be saved before it has been
 * dictated, the filename has to exist before the action that uses it, and there is no
 * destination to change until the Save File action is there. `voiceShortcut.test.ts` pins it.
 *
 * No date actions — the capture time comes from the file itself (`resolveCaptureTime`), which
 * is what took this from six steps to five and removed the one that reliably went wrong.
 */
export const VOICE_SHORTCUT_STEPS: VoiceStep[] = [
  {
    title: `New shortcut, named "${VOICE_ONE_WAY_NAME}"`,
    body: 'In the Shortcuts app, tap +. The name is what you say to Siri, so keep it short.',
  },
  {
    title: 'Add "Dictate Text"',
    body: 'Set the language to English (India) if it is offered, and leave Stop Listening on After Pause. This is the step that listens; iOS does it on the device.',
  },
  {
    title: 'Add "Random Number", 1 to 999999',
    body: 'This gives each capture its own filename. Without it every file is called '
      + '"Dictated Text", so two spends said before the app next opens would collide — and '
      + 'the app cannot recover a capture that was never written.',
  },
  {
    title: 'Add "Save File", with Dictated Text as the file',
    body: 'Turn OFF "Ask Where to Save", and leave "Overwrite If File Exists" OFF. In the '
      + 'Subpath field put the Random Number variable followed by  .txt  — Subpath names the '
      + 'file inside the folder you choose next.',
  },
  {
    title: `Change the destination to ${VOICE_FILES_LOCATION}`,
    body: 'This is the step that matters, and the only one that can go wrong. Tap the blue '
      + 'folder name in the Save File action — it starts as "Shortcuts" — then browse to '
      + `On My iPhone › BudgetSplit › ${VOICE_INBOX_FOLDER} and choose it. Subpath cannot do `
      + 'this: it is relative to whatever folder is picked here, so typing a path there just '
      + 'creates a folder with that name inside the wrong place.',
  },
];

/**
 * The two-way command: dictate, build a deep link, open it. **No folder anywhere.**
 *
 * That makes it the portable one — a shared copy of it has nothing device-specific to
 * re-pick, whereas the one-way command's Save File destination is a bookmark to a folder on
 * the phone that authored it. Worth offering both for that reason alone.
 *
 * `Open URLs` (plural) consumes its input rather than offering a field to type into, so the
 * `URL` action has to build the address first — Apple's own documented pattern, and not
 * guessable from the action list, where several app-provided `Open URL` lookalikes sit above it.
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
    title: `Add "URL" and type  ${VOICE_DEEP_LINK}`,
    body: 'Then insert the Dictated Text variable straight after the = with no space. This '
      + 'action just builds the address; it does not open anything yet.',
  },
  {
    title: 'Add "Open URLs" — the plural one, with the blue arrow',
    body: 'It takes the URL from the step above as its input, which is why the URL action has '
      + 'to come first. Beware the similar-looking "Open URL" rows carrying an app\'s icon '
      + '(Zomato, Chrome) — those are that app\'s own action and will open the wrong thing.',
  },
];

export const VOICE_COMMANDS: VoiceCommand[] = [
  {
    name: VOICE_ONE_WAY_NAME,
    summary: 'One-way — the app never opens',
    detail: 'Siri takes what you said, repeats it back, and you carry on. It is filed the next time you open BudgetSplit. Best for the everyday case: you are walking, paying, in a queue.',
    icon: 'zap',
    installUrl: VOICE_SHORTCUT_URL,
    steps: VOICE_SHORTCUT_STEPS,
  },
  {
    name: VOICE_TWO_WAY_NAME,
    summary: 'Two-way — opens the app, filled in',
    detail: 'Same dictation, but BudgetSplit opens straight away with everything already entered, so you can split it, change the category or add a photo before saving. Use this when the spend needs a decision.',
    icon: 'external-link',
    installUrl: VOICE_TWO_WAY_URL,
    steps: VOICE_TWO_WAY_STEPS,
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
