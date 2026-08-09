import {
  VOICE_INBOX_FOLDER, VOICE_FILES_LOCATION, VOICE_SHORTCUT_STEPS, VOICE_SHORTCUT_URL,
  VOICE_PHRASE_EXAMPLES, VOICE_GROUP_KEYWORDS, VOICE_ROUTING_SUMMARY,
  VOICE_TWO_WAY_STEPS,
  VOICE_DEEP_LINK,
  VOICE_COMMANDS,
  VOICE_FIRST_RUN_NOTE,
  VOICE_ASK_PROMPT,
  VOICE_ASK_OUTPUT,
} from '../lib/voiceShortcut';
import { CAPTURE_PREFIX } from '../lib/voiceInbox';
import { ADD_KIND, AddKind } from '../constants/enums';
import { GROUP_HINTS, isGroupish } from '../lib/voiceInbox';
import { parseVoice } from '../lib/voiceParse';

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

  it('points the setup steps at the folder the app actually creates', () => {
    expect(VOICE_FILES_LOCATION).toContain(VOICE_INBOX_FOLDER);
    // Which step names it does not matter; that the instructions name the real folder does.
    // `voiceDrain.INBOX_DIR_NAME` must equal `VOICE_INBOX_FOLDER`, or the user is told to
    // point the Shortcut at a folder the drain never reads.
    const all = VOICE_SHORTCUT_STEPS.map(s => `${s.title} ${s.body}`).join(' ');
    expect(all).toContain(VOICE_INBOX_FOLDER);
  });
});

describe('the setup instructions are complete', () => {
  it('orders the actions so each one has what it needs', () => {
    expect(VOICE_SHORTCUT_STEPS).toHaveLength(6);
    const titles = VOICE_SHORTCUT_STEPS.map(s => s.title.toLowerCase());
    const askAt = titles.findIndex(t => t.includes('ask for input'));
    const randomAt = titles.findIndex(t => t.includes('random number'));
    const saveAt = titles.findIndex(t => t.includes('save file'));
    const destAt = titles.findIndex(t => t.includes('destination'));

    // Nothing can be saved before it has been spoken; the filename must exist before the
    // action that uses it; and there is no destination to change until Save File is there.
    expect(askAt).toBeGreaterThanOrEqual(0);
    expect(randomAt).toBeGreaterThanOrEqual(0);
    expect(saveAt).toBeGreaterThan(askAt);
    expect(saveAt).toBeGreaterThan(randomAt);
    expect(destAt).toBeGreaterThan(saveAt);
    // The confirmation comes last: it claims the capture was written, so it must not run
    // before the action that writes it.
    const speakAt = titles.findIndex(t => t.includes('speak text'));
    expect(speakAt).toBeGreaterThan(destAt);
  });

  it('gives every capture its own filename', () => {
    // Shortcuts names every file after its input, so without this two spends said before the
    // next drain would collide. Whether "Overwrite off" then renames or errors is undocumented
    // — and the app cannot recover a capture that was never written, so the collision is
    // removed rather than relied on to fail safely.
    const all = VOICE_SHORTCUT_STEPS.map(s => `${s.title} ${s.body}`).join(' ');
    expect(all).toMatch(/random number/i);
    expect(all).toMatch(/overwrite/i);
  });

  it('says Subpath cannot be used to reach the folder', () => {
    // The mistake this cost: Subpath is relative to the chosen destination, so a path typed
    // there silently creates a folder of that name inside iCloud Drive's Shortcuts folder.
    const all = VOICE_SHORTCUT_STEPS.map(s => `${s.title} ${s.body}`).join(' ');
    expect(all).toMatch(/subpath/i);
    expect(all).toMatch(/relative to/i);
  });

  it('asks for no date actions at all', () => {
    // `resolveCaptureTime` reads the file's own creation time, so the two date steps this
    // used to require are gone — along with the "couldn't convert from Text to Date" error
    // that wiring Format Date by hand produces.
    const all = VOICE_SHORTCUT_STEPS.map(s => `${s.title} ${s.body}`).join(' ').toLowerCase();
    expect(all).not.toMatch(/format date|current date|unix|timestamp/);
  });

  it('warns against overwriting, so two quick spends cannot collide', () => {
    const all = VOICE_SHORTCUT_STEPS.map(s => `${s.title} ${s.body}`).join(' ');
    expect(all).toMatch(/overwrite/i);
  });

  it('tells the user to turn off "Ask Where to Save"', () => {
    // Left on, the Shortcut prompts every single time and the whole point is lost.
    const all = VOICE_SHORTCUT_STEPS.map(s => `${s.title} ${s.body}`).join(' ');
    expect(all).toMatch(/ask where to save/i);
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

  it('asks a question the kind can actually answer', () => {
    // "What did you spend?" answered with a salary is a question contradicting its own answer.
    // The two expense commands share one prompt; income and transfer must not borrow it.
    const byKind = (k: string) => VOICE_COMMANDS.filter(c => c.kind === k).map(c => c.prompt);
    expect(new Set(byKind('expense')).size).toBe(1);
    for (const p of [...byKind('income'), ...byKind('transfer')]) {
      expect(p).not.toBe(VOICE_ASK_PROMPT);
      expect(p.toLowerCase()).not.toMatch(/spend|spent/);
    }
    // A transfer needs a person as well as an amount, so its prompt has to ask for one.
    expect(byKind('transfer')[0].toLowerCase()).toMatch(/who/);
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

describe('every command captures to a file', () => {
  const textOf = (c: { steps: { title: string; body: string }[] }) =>
    c.steps.map(s => `${s.title} ${s.body}`).join(' ');

  it('saves into the folder the drain actually reads', () => {
    for (const c of VOICE_COMMANDS) {
      expect(textOf(c)).toContain(VOICE_INBOX_FOLDER);
      expect(textOf(c)).toMatch(/save file/i);
      // Nothing builds a URL any more; a command that did would open the app.
      expect(textOf(c).toLowerCase()).not.toContain('open urls');
    }
  });

  it('tells the user the filename prefix its kind is read from', () => {
    // Get this wrong and the capture files as an expense, silently — the prefix is the only
    // thing carrying the kind.
    for (const c of VOICE_COMMANDS) {
      const kind = c.kind === AddKind.Transfer ? 'settlement' : c.kind;
      expect(textOf(c)).toContain(`${CAPTURE_PREFIX[kind as keyof typeof CAPTURE_PREFIX]}-`);
      expect(textOf(c)).toContain('.txt');
    }
  });

  it('warns off the wide random range that reads as a date', () => {
    for (const c of VOICE_COMMANDS) {
      expect(textOf(c)).toContain('999999');
      expect(textOf(c)).toMatch(/six digits/i);
    }
  });
});

describe('the install links', () => {
  it('gives every command its own one-tap install and its own fallback steps', () => {
    // One button for two shortcuts left it ambiguous which one you were installing.
    // Three, not four: the two expense commands collapsed into one. `routeVoiceDraft` already
    // separates "yours alone" from "sounded shared" better than a second wake phrase did, so
    // the split command was a word to remember in exchange for nothing.
    expect(VOICE_COMMANDS).toHaveLength(3);
    // One command per kind, so a name can never map to two behaviours.
    expect(VOICE_COMMANDS.map(c => c.kind)).toHaveLength(new Set(VOICE_COMMANDS.map(c => c.kind)).size);
    for (const c of VOICE_COMMANDS) {
      expect(c.steps.length).toBeGreaterThan(0);
      expect(c.name.length).toBeGreaterThan(3);
    }
  });

  it('covers all three kinds, and none of them opens the app', () => {
    // A kind with no command is a kind you cannot speak. Nothing opens the app to record —
    // that is the whole point of the capture pipeline, and a command that did would be the
    // one place friction crept back in.
    expect(new Set(VOICE_COMMANDS.map(c => c.kind))).toEqual(new Set(ADD_KIND));
    expect(VOICE_COMMANDS.every(c => !c.opensApp)).toBe(true);
    expect(VOICE_COMMANDS.find(c => c.kind === AddKind.Expense)!.steps).toBe(VOICE_SHORTCUT_STEPS);
  });

  it('gives every command a spoken confirmation', () => {
    // Speaking into silence is indistinguishable from Siri having missed the phrase, and it
    // is the only feedback there is now that nothing opens.
    for (const c of VOICE_COMMANDS) {
      expect(c.speak.length).toBeGreaterThan(4);
      expect(c.steps.map(st => `${st.title} ${st.body}`).join(' ')).toContain(c.speak);
    }
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
