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
  'https://www.icloud.com/shortcuts/7205ee25308f463583f63e8feabf104d';

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
 * It has to fit all three kinds now that there is one command, so it cannot say "spend" — that
 * would contradict its own answer when the answer is a salary. It does cue the amount, which
 * is the one field that has to be there for anything else to be worth parsing.
 */
export const VOICE_ASK_PROMPT = 'How much, and what for?';

export const VOICE_ASK_OUTPUT = 'Provided Input';

export type VoiceStep = { title: string; body: string };

/**
 * One command. One phrase to remember, one shortcut to install, one link to re-share.
 *
 * There were three — one per kind — because a mis-detected kind books real money in the wrong
 * direction. That was true while capture was **silent**. It stopped being true when the phrase
 * started opening the Add form: `detectVoiceKind` guesses, the kind switcher sits at the top of
 * the screen showing what it guessed, and nothing is written until you tap Save. A wrong guess
 * now costs one visible tap, which is cheaper than remembering three wake phrases.
 *
 * ⚠️ A single common word is more collision-prone with Siri's own intents than a two-word
 * phrase. If "budget" starts getting misheard, making it longer is the fix.
 */
export const VOICE_ONE_WAY_NAME = 'budget';

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
  /** True for all three: the app opening IS the confirmation, so nothing is spoken back. */
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
 * Building a command by hand, in the order the Shortcuts app presents the actions.
 *
 * All three are the same three actions — only the name, the prompt and the link differ — so
 * there is one factory rather than three near-copies. These are the fallback;
 * `npm run build:shortcuts` generates and signs the same actions from the same constants.
 *
 * `Open URLs` (plural) consumes its input rather than offering a field, which is why the URL
 * action has to come first.
 */
export function captureSteps(name: string, prompt: string, link: string): VoiceStep[] {
  return [
    {
      title: `New shortcut, named "${name}"`,
      body: 'In the Shortcuts app, tap +. The name is what you say to Siri, so get it exact.',
    },
    {
      title: 'Add "Ask for Input"',
      body: `Set Input Type to Text and put  ${prompt}  in the Prompt field. Left blank, Siri `
        + 'asks "What\'s the text?" — a question about the shortcut rather than your money.',
    },
    {
      title: `Add "URL" and type  ${link}`,
      body: `Type it in one go — the order of the parts matters — then insert the `
        + `${VOICE_ASK_OUTPUT} variable straight after the = with no space. This only builds `
        + 'the address; it does not open anything yet.',
    },
    {
      title: 'Add "Open URLs" — the plural one, with the blue arrow',
      body: 'It takes the URL from the step above as its input, which is why the URL action '
        + 'has to come first. Beware the similar-looking "Open URL" rows carrying an app\'s '
        + 'icon (Zomato, Chrome) — those are that app\'s own action and open the wrong thing.',
    },
  ];
}

export const VOICE_SHORTCUT_STEPS = captureSteps(VOICE_ONE_WAY_NAME, VOICE_ASK_PROMPT, VOICE_DEEP_LINK);

export const VOICE_COMMANDS: VoiceCommand[] = [
  {
    name: VOICE_ONE_WAY_NAME,
    summary: 'Opens Add, filled in',
    detail: 'Spending, money in, or paying someone back — one phrase covers all three. A clear one saves itself and shows you the result; anything needing a decision opens the form instead.',
    kind: AddKind.Expense,
    icon: 'zap',
    prompt: VOICE_ASK_PROMPT,
    opensApp: true,
    example: 'four fifty groceries',
    flow: [
      { actor: 'you', text: `“Hey Siri, ${VOICE_ONE_WAY_NAME}”` },
      { actor: 'siri', text: `“${VOICE_ASK_PROMPT}”` },
      { actor: 'you', text: '“four fifty groceries”' },
      { actor: 'app', text: 'Saved — ₹450, Groceries, Personal — and the transaction opens so you can see it. Undo is right there if it misheard.' },
      { actor: 'app', text: '“twelve hundred dinner with Rohan” does NOT save itself: who shares a cost is a decision, so the form opens with the group picker up.' },
      { actor: 'app', text: '“fifty thousand salary” lands on Income; “paid Riya five hundred” opens Transfer with Riya on the other side, because direction is never guessed.' },
    ],
    why: 'A phrase saves itself only when there is nothing left to decide — an amount was heard, no group or person was named, and it is not a transfer. That is the same test the app has always used to tell a confident capture from one that needs looking at, so there is one rule rather than two. Everything else opens the form. Income is spotted from words like salary or refund; a transfer needs a settle verb AND someone you already know AND no split wording, so “paid 450 for groceries” stays an expense.',
    installUrl: VOICE_SHORTCUT_URL,
    steps: VOICE_SHORTCUT_STEPS,
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
