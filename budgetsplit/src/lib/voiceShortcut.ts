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
/**
 * All null: every shortcut was rebuilt as a deep link, so the file-capture versions behind the
 * old links no longer match anything documented here. Re-author, re-share, paste back.
 */
export const VOICE_SHORTCUT_URL: string | null = null;
export const VOICE_INCOME_URL: string | null = null;
export const VOICE_SETTLE_URL: string | null = null;

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

/**
 * The same link aimed at another kind. `useAddTxnForm` has always seeded its state from a
 * `kind` param, so income and settlement entry need no new screen.
 *
 * ⚠️ **`q` must stay last.** The phrase is inserted unencoded and a query value ends at the
 * next `&`, so `?kind=income&q=fifty thousand salary` parses, while the reverse order would
 * swallow `kind` into the phrase and open income as an expense.
 */
export const VOICE_DEEP_LINK_INCOME = 'budgetsplit:///add/quick?kind=income&q=';
export const VOICE_DEEP_LINK_SETTLE = 'budgetsplit:///add/quick?kind=transfer&q=';

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
 * name — and the Add screen acts on it, opening the group picker. Which *kind* it is cannot be
 * read that way: "salary" and "paid Riya" are ordinary words, and a mis-detected kind books
 * real money in the wrong direction. So the kind is the one thing you say, and the rest is
 * inferred.
 *
 * Bare nouns, deliberately. Anything longer is a phrase to remember, and these are said aloud
 * dozens of times a week. ⚠️ Single words are more collision-prone with Siri's own intents
 * than two-word phrases; if one starts getting misheard, the fix is to make that one longer.
 */
export const VOICE_ONE_WAY_NAME = 'expense';
export const VOICE_INCOME_NAME = 'income';
export const VOICE_SETTLE_NAME = 'transfer';

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
export const VOICE_INCOME_STEPS = captureSteps(VOICE_INCOME_NAME, VOICE_ASK_PROMPT_INCOME, VOICE_DEEP_LINK_INCOME);
export const VOICE_SETTLE_STEPS = captureSteps(VOICE_SETTLE_NAME, VOICE_ASK_PROMPT_SETTLE, VOICE_DEEP_LINK_SETTLE);

export const VOICE_COMMANDS: VoiceCommand[] = [
  {
    name: VOICE_ONE_WAY_NAME,
    summary: 'Opens Add, filled in',
    detail: 'The everyday one. Say the amount and what it was for; the form opens with everything already entered and the group picker up if it sounded shared.',
    kind: AddKind.Expense,
    icon: 'zap',
    prompt: VOICE_ASK_PROMPT,
    opensApp: true,
    example: 'four fifty groceries',
    flow: [
      { actor: 'you', text: `“Hey Siri, ${VOICE_ONE_WAY_NAME}”` },
      { actor: 'siri', text: `“${VOICE_ASK_PROMPT}”` },
      { actor: 'you', text: '“four fifty groceries”' },
      { actor: 'app', text: 'BudgetSplit opens on Add — ₹450, Groceries, today. Check it and Save.' },
      { actor: 'app', text: 'Say “twelve hundred dinner with Rohan” and the group picker is already open, because that is the decision you came to make.' },
    ],
    why: 'Nothing to set up: the shortcut carries the phrase in a link, so there is no folder to pick and no way for it to fail silently. The cost is that the app comes to the front — you always see what was heard before anything is saved.',
    installUrl: VOICE_SHORTCUT_URL,
    steps: VOICE_SHORTCUT_STEPS,
  },
  {
    name: VOICE_INCOME_NAME,
    summary: 'Opens Add, on Income',
    detail: 'Salary, a refund, freelance money in. Lands on the Income form against your personal group.',
    kind: AddKind.Income,
    icon: 'trending-up',
    prompt: VOICE_ASK_PROMPT_INCOME,
    opensApp: true,
    example: 'fifty thousand salary',
    flow: [
      { actor: 'you', text: `“Hey Siri, ${VOICE_INCOME_NAME}”` },
      { actor: 'siri', text: `“${VOICE_ASK_PROMPT_INCOME}”` },
      { actor: 'you', text: '“fifty thousand salary”' },
      { actor: 'app', text: 'Add opens on Income — ₹50,000, matched against your income categories, Personal.' },
    ],
    why: 'Income is matched against the income catalog, never the expense one, so a salary cannot land under Groceries. It is always personal, so there is no group to choose.',
    installUrl: VOICE_INCOME_URL,
    steps: VOICE_INCOME_STEPS,
  },
  {
    name: VOICE_SETTLE_NAME,
    summary: 'Opens Add, on Transfer',
    detail: 'Money moved between you and someone else — paying a friend back, or being paid. Names the person if the phrase did.',
    kind: AddKind.Transfer,
    icon: 'repeat',
    prompt: VOICE_ASK_PROMPT_SETTLE,
    opensApp: true,
    example: 'paid Riya five hundred',
    flow: [
      { actor: 'you', text: `“Hey Siri, ${VOICE_SETTLE_NAME}”` },
      { actor: 'siri', text: `“${VOICE_ASK_PROMPT_SETTLE}”` },
      { actor: 'you', text: '“paid Riya five hundred”' },
      { actor: 'app', text: 'Add opens on Transfer — ₹500, with Riya on the other side. Tap the arrow if it went the other way.' },
      { actor: 'app', text: 'Two people sharing a first name leaves the person blank rather than guessing — a settlement aimed at the wrong one moves a real balance twice.' },
    ],
    why: 'Direction is never inferred from the verb: “paid” and “got” are one mis-hearing apart. The form opens with both sides shown so reversing it is one tap before anything is saved.',
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
