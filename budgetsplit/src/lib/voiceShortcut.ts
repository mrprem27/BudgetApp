import { GROUP_HINTS, CAPTURE_PREFIX } from './voiceInbox';
import { AddKind } from '../constants/enums';

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
  'https://www.icloud.com/shortcuts/bc398eac16334420a10a899f8494579c';

export const VOICE_INCOME_URL: string | null =
  'https://www.icloud.com/shortcuts/99555340c4f34f47aea9fe2b64d887d8';

export const VOICE_SETTLE_URL: string | null =
  'https://www.icloud.com/shortcuts/6bf45d5e698e4fb4b4a53340f7bc90b7';

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
 * The phrase deep link. **Nothing in the voice pipeline builds this any more** — every command
 * captures to a file so the app never has to open — but `app/add/quick.tsx` still reads `q`,
 * so it stays as the documented contract for anything else that wants to hand the Add screen
 * a spoken phrase.
 *
 * Deliberately not URL-encoded: a phrase contains spaces but no `&` or `#`, and a query value
 * is only delimited by those.
 */
export const VOICE_DEEP_LINK = 'budgetsplit:///add/quick?q=';

/** Worth saying out loud, given the app's "nothing leaves your device" promise. */
export const VOICE_SHORTCUT_PRIVACY =
  'Siri turns your words into text, which recent iPhones do on the device. Tapping the one-tap '
  + 'link above fetches the shortcut definition from Apple once, at setup — after that nothing '
  + 'BudgetSplit stores ever leaves your phone.';

/**
 * What Siri says before it listens — the one field that turns a machine noise into a question.
 *
 * `Ask for Input` speaks its Prompt when the shortcut is run by voice, and falls back to a
 * generic question when the field is blank. Blank is how this shipped, so "Hey Siri, Log
 * expense" was answered with **"What's the text?"** — which asks about the *mechanism* rather
 * than the spend, and reads as a form field talking back at you.
 *
 * Deliberately not "How much, and on what?". Teaching the amount-then-category shape is the
 * job of {@link VOICE_PHRASE_EXAMPLES}; spending those syllables on every capture forever to
 * solve a first-run problem is the wrong trade.
 *
 * Per-kind, not global — "What did you spend?" contradicts its own answer when the answer is a
 * salary.
 */
export const VOICE_ASK_PROMPT = 'What did you spend?';

export const VOICE_ASK_PROMPT_INCOME = 'What came in?';

/**
 * Names both things it needs: a transfer is the only kind with a required field beyond the
 * amount, and `parseVoice` can only match a person the phrase actually named.
 */
export const VOICE_ASK_PROMPT_SETTLE = 'Who did you pay, and how much?';

/**
 * The variable `Ask for Input` produces. Has to be picked from Shortcuts' variable list, and
 * picking `Dictated Text` — the older build's name, still offered — silently yields an
 * empty file.
 */
export const VOICE_ASK_OUTPUT = 'Provided Input';

export type VoiceStep = { title: string; body: string };

/**
 * One command per KIND, and nothing finer.
 *
 * The line is drawn where guessing stops being reliable. Whether other people are involved is
 * something the app can read off the phrase — "split", "with", "owe", a group name, a person's
 * name — and `routeVoiceDraft` already does, sending those to Review instead of the ledger.
 * Which *kind* it is cannot be read that way: "salary" and "paid Riya" are ordinary words, and
 * a mis-detected kind books real money in the wrong direction.
 *
 * So the kind is chosen by which phrase you say, and everything else is inferred. That
 * retired a fourth command ("Split expense"), which asked you to remember a second wake phrase
 * to tell the app something it could already work out.
 *
 * The name is a free signal: you have to say *something*, so the kind costs no extra words.
 * They must not rhyme, though — `Log expense` / `Add expense` differed only in the verb, the
 * pair Siri is likeliest to confuse, and the failure mode there was a spend you believed was
 * filed silently actually sitting on an Add screen behind a locked phone.
 */
export const VOICE_ONE_WAY_NAME = 'Log expense';
export const VOICE_INCOME_NAME = 'Log income';
export const VOICE_SETTLE_NAME = 'Settle up';

/** Who acts in a beat, so the Voice screen can show the exchange as turns rather than bullets. */
export type FlowActor = 'you' | 'siri' | 'app';

export type FlowBeat = { actor: FlowActor; text: string };

export type VoiceCommand = {
  /** The shortcut's name — literally what you say after "Hey Siri". */
  name: string;
  summary: string;
  detail: string;
  /** Drives the accent colour, so each command matches the Add screen it opens. */
  kind: AddKind;
  icon: 'zap' | 'users' | 'trending-up' | 'repeat';
  prompt: string;
  /** What the shortcut says back once the capture is written. */
  speak: string;
  /** False for all three now — nothing opens the app to record. Kept because the flow
   *  rendering and the tests both key off it, and a future command may want it. */
  opensApp: boolean;
  /** A phrase that really parses to this kind — the worked example in the flow. */
  example: string;
  flow: FlowBeat[];
  /** Why this kind may or may not post itself without the app opening. */
  why: string;
  /** One-tap install, or null to fall back to the manual steps. */
  installUrl: string | null;
  steps: VoiceStep[];
};


/**
 * Building a capture command by hand, in the order the Shortcuts app presents the actions.
 *
 * All three commands are the same five actions — only the name, the prompt, the filename
 * prefix and the spoken line differ — so there is one factory rather than three near-copies.
 *
 * The order is a dependency chain, not a preference: nothing can be saved before it has been
 * spoken, the filename has to exist before the action that uses it, and there is no
 * destination to change until the Save File action is there.
 *
 * No date actions — the capture time comes from the file itself (`resolveCaptureTime`), which
 * removed the two steps that reliably went wrong.
 *
 * These are the fallback. `npm run build:shortcuts` generates and signs the same five actions
 * from the same constants, so nobody should normally be typing them in.
 */
export function captureSteps(
  name: string, prompt: string, prefix: string, speak: string,
): VoiceStep[] {
  return [
    {
      title: `New shortcut, named "${name}"`,
      body: 'In the Shortcuts app, tap +. The name is what you say to Siri, so get it exact.',
    },
    {
      title: 'Add "Ask for Input"',
      body: `Set Input Type to Text, and put  ${prompt}  in the Prompt field. This is the step `
        + 'that listens, and the Prompt is what Siri says first — left blank it asks '
        + '"What\'s the text?", which is a question about the shortcut rather than your money.',
    },
    {
      title: 'Add "Random Number", 1 to 999999',
      body: 'This gives each capture its own filename, so two things said before the app next '
        + 'opens cannot collide. Keep the maximum at six digits: a longer number can look like '
        + 'a date to the app and file the entry on a day it did not happen.',
    },
    {
      title: `Add "Save File", with ${VOICE_ASK_OUTPUT} as the file`,
      body: 'Turn OFF "Ask Where to Save", and leave "Overwrite If File Exists" OFF. In the '
        + `Subpath field type  ${prefix}-  then insert the Random Number variable, then  .txt  `
        + `— the  ${prefix}-  part is how the app knows which kind this capture is.`,
    },
    {
      title: `Change the destination to ${VOICE_FILES_LOCATION}`,
      body: 'The step that matters, and the only one that can go wrong. Tap the blue folder '
        + 'name in the Save File action — it starts as "Shortcuts" — then browse to '
        + `On My iPhone › BudgetSplit › ${VOICE_INBOX_FOLDER} and choose it. Subpath cannot do `
        + 'this: it is relative to whatever folder is picked here, so typing a path there just '
        + 'creates a folder of that name in the wrong place.',
    },
    {
      title: `Add "Speak Text" saying  ${speak}`,
      body: 'The only signal the capture worked. Without it you talk into silence and cannot '
        + 'tell a saved entry from Siri having missed the phrase entirely.',
    },
  ];
}

export const VOICE_SHORTCUT_STEPS = captureSteps(
  VOICE_ONE_WAY_NAME, VOICE_ASK_PROMPT, CAPTURE_PREFIX.expense, 'Saved in BudgetSplit');
export const VOICE_INCOME_STEPS = captureSteps(
  VOICE_INCOME_NAME, VOICE_ASK_PROMPT_INCOME, CAPTURE_PREFIX.income, 'Income saved in BudgetSplit');
export const VOICE_SETTLE_STEPS = captureSteps(
  VOICE_SETTLE_NAME, VOICE_ASK_PROMPT_SETTLE, CAPTURE_PREFIX.settlement, 'Waiting in Review');

export const VOICE_COMMANDS: VoiceCommand[] = [
  {
    name: VOICE_ONE_WAY_NAME,
    summary: 'Files itself — splits wait in Review',
    detail: 'Every expense, shared or not. Say it and carry on: yours alone goes straight to the ledger, anything that sounded shared waits in Review for you to pick who shares it.',
    kind: AddKind.Expense,
    icon: 'zap',
    prompt: VOICE_ASK_PROMPT,
    speak: 'Saved in BudgetSplit',
    opensApp: false,
    example: 'four fifty groceries',
    flow: [
      { actor: 'you', text: `“Hey Siri, ${VOICE_ONE_WAY_NAME}”` },
      { actor: 'siri', text: `“${VOICE_ASK_PROMPT}”` },
      { actor: 'you', text: '“four fifty groceries”' },
      { actor: 'siri', text: 'Repeats it back and lets you go. The app never comes to the front.' },
      { actor: 'app', text: 'Next time you open BudgetSplit: ₹450, Groceries, Personal — already saved.' },
      { actor: 'app', text: 'Say “twelve hundred dinner with Rohan” instead and the same command holds it in Review, with a line saying why, so you pick the group when you have a moment.' },
    ],
    why: 'One command for both, because the app can tell them apart — “split”, “with”, “owe”, a group name or a person’s name diverts a phrase to Review. Guessing the *kind* is what is unreliable, not guessing whether other people are involved.',
    installUrl: VOICE_SHORTCUT_URL,
    steps: VOICE_SHORTCUT_STEPS,
  },
  {
    name: VOICE_INCOME_NAME,
    summary: 'Files itself',
    detail: 'Salary, a refund, freelance money in. Goes straight to your personal ledger — the app never opens.',
    kind: AddKind.Income,
    icon: 'trending-up',
    prompt: VOICE_ASK_PROMPT_INCOME,
    speak: 'Income saved in BudgetSplit',
    opensApp: false,
    example: 'fifty thousand salary',
    flow: [
      { actor: 'you', text: `“Hey Siri, ${VOICE_INCOME_NAME}”` },
      { actor: 'siri', text: `“${VOICE_ASK_PROMPT_INCOME}”` },
      { actor: 'you', text: '“fifty thousand salary”' },
      { actor: 'siri', text: '“Income saved in BudgetSplit.” The app never comes to the front.' },
      { actor: 'app', text: 'Next time you open it: ₹50,000 under Salary, in Personal, already saved.' },
      { actor: 'app', text: 'Income is matched against your income categories, never the expense ones — a salary cannot land under Groceries.' },
    ],
    why: 'Posts itself like an expense does. Income is always personal and has no shares to apportion, so there is no decision anyone could be asked to make. A phrase naming a group or a person waits in Review instead, because income never involves one.',
    installUrl: VOICE_INCOME_URL,
    steps: VOICE_INCOME_STEPS,
  },
  {
    name: VOICE_SETTLE_NAME,
    summary: 'Files into Review',
    detail: 'Money moved between you and someone else. Captured without opening the app; the row waits in Review with the amount and the person already filled in.',
    kind: AddKind.Transfer,
    icon: 'repeat',
    prompt: VOICE_ASK_PROMPT_SETTLE,
    speak: 'Waiting in Review',
    opensApp: false,
    example: 'paid Riya five hundred',
    flow: [
      { actor: 'you', text: `“Hey Siri, ${VOICE_SETTLE_NAME}”` },
      { actor: 'siri', text: `“${VOICE_ASK_PROMPT_SETTLE}”` },
      { actor: 'you', text: '“paid Riya five hundred”' },
      { actor: 'siri', text: '“Waiting in Review.” The app never comes to the front.' },
      { actor: 'app', text: 'A Review row is waiting: ₹500, Riya, marked as a transfer. Confirming the direction is one tap.' },
      { actor: 'app', text: 'Two people sharing a first name leaves the person blank rather than guessing — a settlement aimed at the wrong one moves a real balance twice.' },
    ],
    why: 'Direction is never inferred from the verb — “paid” and “got” are one mis-hearing apart, and a settlement pointed the wrong way moves a real balance twice over.',
    installUrl: VOICE_SETTLE_URL,
    steps: VOICE_SETTLE_STEPS,
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
