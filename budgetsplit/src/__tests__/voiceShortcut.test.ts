import {
  VOICE_INBOX_FOLDER, VOICE_FILES_LOCATION, VOICE_SHORTCUT_STEPS, VOICE_SHORTCUT_URL,
  VOICE_PHRASE_EXAMPLES, VOICE_GROUP_KEYWORDS, VOICE_ROUTING_SUMMARY,
  VOICE_DEEP_LINK,
  VOICE_DEEP_LINK_INCOME,
  VOICE_DEEP_LINK_SETTLE,
  VOICE_COMMANDS,
  VOICE_FIRST_RUN_NOTE,
  VOICE_ASK_PROMPT,
  VOICE_ASK_OUTPUT,
  VOICE_RETRY_LINE,
} from '../lib/voiceShortcut';
import { CAPTURE_PREFIX } from '../lib/voiceInbox';
import { ADD_KIND, AddKind } from '../constants/enums';
import { GROUP_HINTS, isGroupish } from '../lib/voiceInbox';
import { parseVoice, detectVoiceKind } from '../lib/voiceParse';

const CATS = [{ name: 'Groceries' }, { name: 'Food' }, { name: 'Transport' }, { name: 'Other' }];
const NOW = new Date(2026, 7, 12, 15, 30).getTime();

/**
 * These assert that what the user is *told* matches what the code *does*. The setup
 * instructions and the Help screen both read from this module, and an instruction that has
 * quietly stopped being true is worse than no instruction — the user follows it, nothing
 * works, and the app looks broken rather than misdocumented.
 */
describe('what we tell the user matches what we do', () => {
  it('advertises exactly the keywords the router acts on', () => {
    expect(VOICE_GROUP_KEYWORDS).toEqual(GROUP_HINTS);
    for (const word of VOICE_GROUP_KEYWORDS) {
      expect(isGroupish(`450 food ${word}`)).toBe(true);
    }
  });

  it('names only keywords that really do divert a phrase', () => {
    // Every word quoted in the user-facing summary must actually trigger the group path.
    const quoted = VOICE_GROUP_KEYWORDS.slice(0, 4);
    for (const word of quoted) {
      expect(VOICE_ROUTING_SUMMARY).toContain(word);
      expect(isGroupish(`1200 dinner ${word}`)).toBe(true);
    }
  });

  it('offers example phrases that actually parse', () => {
    // A "try saying" hint that yields no amount would teach the user the feature is broken.
    for (const example of VOICE_PHRASE_EXAMPLES) {
      const d = parseVoice(example, { categories: CATS, nowMs: NOW });
      expect(d.amountPaise).toBeGreaterThan(0);
      expect(Number.isInteger(d.amountPaise)).toBe(true);
    }
  });

  it('points the setup steps at the route the app actually reads', () => {
    // The link in the instructions is the same constant `add/quick.tsx` parses `q` from.
    const all = VOICE_SHORTCUT_STEPS.map(s => `${s.title} ${s.body}`).join(' ');
    expect(all).toContain(VOICE_DEEP_LINK);
    expect(VOICE_DEEP_LINK).toContain('/add/quick');
  });

  it('asks the installer to configure nothing', () => {
    // The whole reason for the deep-link shape: the file-capture version needed a Save File
    // folder re-picked on every device, and when it was wrong nothing happened, silently.
    for (const c of VOICE_COMMANDS) {
      const all = c.steps.map(s => `${s.title} ${s.body}`).join(' ').toLowerCase();
      expect(all).not.toContain('save file');
      expect(all).not.toContain(VOICE_INBOX_FOLDER);
      expect(all).not.toContain('subpath');
    }
  });
});

describe('the setup instructions are complete', () => {
  it('orders the actions so each one has what it needs', () => {
    const titles = VOICE_SHORTCUT_STEPS.map(s => s.title.toLowerCase());
    const at = (needle: string) => titles.findIndex(t => t.includes(needle));

    // A dependency chain, not a preference: the loop has to exist before anything sits inside
    // it, nothing can be sent before it has been spoken, "Open URLs" consumes its input rather
    // than offering a field, and the stop must follow the hand-off it is stopping after.
    expect(at('repeat')).toBeGreaterThanOrEqual(0);
    expect(at('ask for input')).toBeGreaterThan(at('repeat'));
    expect(at('"if"')).toBeGreaterThan(at('ask for input'));
    expect(at('"url"')).toBeGreaterThan(at('"if"'));
    expect(at('open urls')).toBeGreaterThan(at('"url"'));
    expect(at('stop this shortcut')).toBeGreaterThan(at('open urls'));
    expect(at('otherwise')).toBeGreaterThan(at('stop this shortcut'));
  });

  it('tells the user what the retry can and cannot catch', () => {
    // Only silence reaches the Otherwise branch. Promising more would have people believing a
    // misheard amount gets a second chance, when it is the app screen that catches those.
    const all = VOICE_SHORTCUT_STEPS.map(s => `${s.title} ${s.body}`).join(' ');
    expect(all).toContain(VOICE_RETRY_LINE);
    expect(all.toLowerCase()).toMatch(/silence|silent/);
  });

  it('warns about the app-provided Open URL lookalikes', () => {
    // The action list shows several "Open URL" rows carrying an app's icon; picking one opens
    // that app instead. This cost a round trip, so the warning is pinned.
    for (const c of VOICE_COMMANDS) {
      const all = c.steps.map(s => `${s.title} ${s.body}`).join(' ');
      expect(all).toMatch(/open urls/i);
      expect(all.toLowerCase()).toContain('zomato');
    }
  });

  it('asks for no date actions at all', () => {
    // `parseVoice` resolves relative dates against the phrase itself, so wiring Format Date
    // by hand only ever produced "couldn't convert from Text to Date".
    const all = VOICE_SHORTCUT_STEPS.map(s => `${s.title} ${s.body}`).join(' ').toLowerCase();
    expect(all).not.toMatch(/format date|current date|unix|timestamp/);
  });

  it('makes every command ask a question about money, not about text', () => {
    // Left blank, `Ask for Input`'s Prompt makes Siri fall back to "What's the text?" — a
    // question about the mechanism, asked at the one moment the feature is meant to feel like
    // talking to a person. The Prompt field is the entire fix, so each command's is pinned as
    // present, as a real question, and as appearing in the steps that build it.
    for (const c of VOICE_COMMANDS) {
      expect(c.prompt.length).toBeGreaterThan(8);
      expect(c.prompt).toMatch(/\?$/);
      expect(c.prompt.toLowerCase()).not.toMatch(/\btext\b/);

      const all = c.steps.map(s => `${s.title} ${s.body}`).join(' ');
      expect(all).toContain(c.prompt);
      expect(all).toMatch(/prompt/i);
    }
  });

  it('asks a question that fits every kind', () => {
    // One command means one prompt, so it cannot say "spend" — that would contradict its own
    // answer when the answer is a salary. It must still cue the amount, which is the one field
    // everything else depends on.
    expect(VOICE_ASK_PROMPT.toLowerCase()).not.toMatch(/spend|spent/);
    expect(VOICE_ASK_PROMPT.toLowerCase()).toMatch(/how much/);
  });

  it('consumes the variable Ask for Input actually produces', () => {
    // `Ask for Input` outputs "Provided Input"; the older build's "Dictated Text" is still
    // offered in the variable list and picking it yields an empty file with no error.
    const all = VOICE_COMMANDS.flatMap(c => c.steps)
      .map(s => `${s.title} ${s.body}`).join(' ');
    expect(all).toContain(VOICE_ASK_OUTPUT);
    expect(all).not.toMatch(/Dictated Text/);
  });

  it('has real prose in every step', () => {
    for (const s of VOICE_SHORTCUT_STEPS) {
      expect(s.title.length).toBeGreaterThan(8);
      expect(s.body.length).toBeGreaterThan(20);
      expect(`${s.title} ${s.body}`).not.toMatch(/undefined|NaN|TODO/);
    }
  });

  it('leaves the one-tap install off until a real link exists', () => {
    // Only the repo owner can author + share the shortcut, which is what produces the
    // iCloud URL. Until then the manual steps are the path, and a placeholder URL that
    // 404s would be worse than none.
    expect(VOICE_SHORTCUT_URL === null || /^https:\/\/(www\.)?icloud\.com\/shortcuts\//.test(VOICE_SHORTCUT_URL)).toBe(true);
  });
});

describe('every command opens the app with the phrase', () => {
  it('sends each kind to the link that sets that kind', () => {
    // `q` last, always: the phrase is unencoded, so a `kind` after it would be swallowed into
    // the phrase and income would open as an expense.
    for (const c of VOICE_COMMANDS) {
      const all = c.steps.map(s => `${s.title} ${s.body}`).join(' ');
      const link = c.kind === AddKind.Expense ? VOICE_DEEP_LINK
        : c.kind === AddKind.Income ? VOICE_DEEP_LINK_INCOME : VOICE_DEEP_LINK_SETTLE;
      expect(all).toContain(link);
      expect(link).toMatch(/[?&]q=$/);
      if (c.kind !== AddKind.Expense) expect(link).toContain(`kind=${c.kind}`);
    }
  });

  it('opens the app for every kind', () => {
    expect(VOICE_COMMANDS.every(c => c.opensApp)).toBe(true);
  });
});

describe('the install links', () => {
  it('gives every command its own one-tap install and its own fallback steps', () => {
    // One button for two shortcuts left it ambiguous which one you were installing.
    // One. Three per-kind commands existed because a mis-detected kind booked money the wrong
    // way while capture was silent; the form opens now, so the guess is visible and one tap
    // from being fixed — which is cheaper than remembering three wake phrases.
    expect(VOICE_COMMANDS).toHaveLength(1);
    for (const c of VOICE_COMMANDS) {
      expect(c.steps.length).toBeGreaterThan(0);
      expect(c.name.length).toBeGreaterThan(3);
    }
  });

  it('reaches every kind through detection rather than through a command each', () => {
    // The command is expense-shaped because that is the default and the majority; the other
    // two are reached by what you say. `voiceParse.test.ts` pins the detection itself.
    expect(VOICE_COMMANDS[0].kind).toBe(AddKind.Expense);
    expect(VOICE_COMMANDS[0].steps).toBe(VOICE_SHORTCUT_STEPS);
    expect(detectVoiceKind('fifty thousand salary')).toBe('income');
    expect(detectVoiceKind('paid Riya five hundred', { people: [{ id: 'r', name: 'Riya' }] })).toBe('transfer');
    expect(new Set([AddKind.Expense, 'income', 'transfer'])).toEqual(new Set(ADD_KIND));
  });

  it('keeps the names short enough to say every day', () => {
    // Bare nouns. Anything longer is a phrase to remember, said dozens of times a week.
    for (const c of VOICE_COMMANDS) expect(c.name.split(' ')).toHaveLength(1);
  });

  it('gives the commands names Siri can tell apart', () => {
    // Confusing two commands means a spend you believed was filed silently is sitting on an
    // Add screen behind a locked phone. How *phonetically* distinct two names are is a
    // judgment call and not worth a fake assertion — `Log expense` vs `Add expense` was too
    // close, `Log expense` vs `Split expense` is fine, and no string metric separates those
    // cleanly. What is mechanical, and is a real ambiguity for Siri's matching, is one name
    // containing another.
    const names = VOICE_COMMANDS.map(c => c.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    for (const a of names) {
      for (const b of names) {
        if (a === b) continue;
        expect(a.includes(b)).toBe(false);
      }
    }
  });

  it('shows a flow whose spoken beats match the command', () => {
    // The Voice screen renders these verbatim as the "what happens when you say it" timeline,
    // so a flow quoting the wrong wake phrase or the wrong prompt teaches a command that
    // does not exist.
    for (const c of VOICE_COMMANDS) {
      expect(c.flow.length).toBeGreaterThanOrEqual(4);
      const all = c.flow.map(b => b.text).join(' ');
      expect(all).toContain(c.name);
      expect(all).toContain(c.prompt);
      // The app can only act in a flow whose command actually opens it — except the one-way
      // one, where the app acting *later* is the whole point.
      expect(c.flow.some(b => b.actor === 'app')).toBe(true);
      expect(c.why.length).toBeGreaterThan(40);
    }
  });

  it('sends every kind to a deep link that sets that kind', () => {
    // `q` last, always: the phrase is unencoded, so a `kind` after it would be swallowed into
    // the phrase and income would post as an expense.
    for (const c of VOICE_COMMANDS) {
      if (!c.opensApp) continue;
      const all = c.steps.map(s => `${s.title} ${s.body}`).join(' ');
      const link = c.kind === AddKind.Expense ? VOICE_DEEP_LINK
        : c.kind === AddKind.Income ? VOICE_DEEP_LINK_INCOME : VOICE_DEEP_LINK_SETTLE;
      expect(all).toContain(link);
      expect(link).toMatch(/[?&]q=$/);
      if (c.kind !== AddKind.Expense) expect(link).toContain(`kind=${c.kind}`);
    }
  });

  it('points at real Apple-minted shortcut links, or at nothing', () => {
    // A malformed or invented URL 404s, which is strictly worse than showing the steps —
    // so the only two acceptable states are "a genuine iCloud shortcut link" and null.
    for (const c of VOICE_COMMANDS) {
      if (c.installUrl === null) continue;
      expect(c.installUrl).toMatch(/^https:\/\/www\.icloud\.com\/shortcuts\/[0-9a-f]{32}$/);
    }
  });

  it('gives the two commands different links', () => {
    // Re-sharing one shortcut and pasting the link into both slots would silently install
    // the same command twice.
    const urls = VOICE_COMMANDS.map(c => c.installUrl).filter(Boolean);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('warns about the permission prompt before it appears', () => {
    // It arrives unexplained, mid-dictation, and reads as a failure. Saying so is the fix.
    expect(VOICE_FIRST_RUN_NOTE).toMatch(/permission/i);
    expect(VOICE_FIRST_RUN_NOTE).toMatch(/once/i);
  });

  it('pairs each command with the steps that actually build it', () => {
    // Only the one-way command needs the folder; the app-opening ones must not mention it, or
    // the fallback instructions send you to configure something that does not exist.
    for (const c of VOICE_COMMANDS) {
      const all = c.steps.map(s => `${s.title} ${s.body}`).join(' ');
      expect(all).toContain(`named "${c.name}"`);
      if (c.opensApp) {
        expect(all).toContain('Open URLs');
        expect(all).not.toContain(VOICE_INBOX_FOLDER);
      } else {
        expect(all).toContain('Save File');
        expect(all).toContain(VOICE_INBOX_FOLDER);
      }
    }
  });
});
