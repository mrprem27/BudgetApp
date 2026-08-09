import {
  VOICE_INBOX_FOLDER, VOICE_FILES_LOCATION, VOICE_SHORTCUT_STEPS, VOICE_SHORTCUT_URL,
  VOICE_PHRASE_EXAMPLES, VOICE_GROUP_KEYWORDS, VOICE_ROUTING_SUMMARY,
  VOICE_TWO_WAY_STEPS,
  VOICE_DEEP_LINK,
  VOICE_COMMANDS,
  VOICE_FIRST_RUN_NOTE,
} from '../lib/voiceShortcut';
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
    expect(VOICE_SHORTCUT_STEPS).toHaveLength(5);
    const titles = VOICE_SHORTCUT_STEPS.map(s => s.title.toLowerCase());
    const dictateAt = titles.findIndex(t => t.includes('dictate text'));
    const randomAt = titles.findIndex(t => t.includes('random number'));
    const saveAt = titles.findIndex(t => t.includes('save file'));
    const destAt = titles.findIndex(t => t.includes('destination'));

    // Nothing can be saved before it has been dictated; the filename must exist before the
    // action that uses it; and there is no destination to change until Save File is there.
    expect(dictateAt).toBeGreaterThanOrEqual(0);
    expect(randomAt).toBeGreaterThanOrEqual(0);
    expect(saveAt).toBeGreaterThan(dictateAt);
    expect(saveAt).toBeGreaterThan(randomAt);
    expect(destAt).toBeGreaterThan(saveAt);
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

describe('the two-way command', () => {
  it('builds the URL before opening it', () => {
    // "Open URLs" consumes its input rather than offering a field to type in, so the URL
    // action must come first — Apple's own documented pattern.
    const titles = VOICE_TWO_WAY_STEPS.map(s => s.title.toLowerCase());
    const urlAt = titles.findIndex(t => t.includes('"url"'));
    const openAt = titles.findIndex(t => t.includes('open urls'));
    expect(urlAt).toBeGreaterThanOrEqual(0);
    expect(openAt).toBeGreaterThan(urlAt);
  });

  it('warns about the app-provided lookalikes', () => {
    // The action list shows several "Open URL" rows carrying an app's icon; picking one opens
    // that app instead. This cost a round trip, so the warning is pinned.
    const all = VOICE_TWO_WAY_STEPS.map(s => `${s.title} ${s.body}`).join(' ');
    expect(all).toMatch(/open urls/i);
    expect(all.toLowerCase()).toContain('zomato');
  });

  it('tells the user the same link the Add screen reads', () => {
    const all = VOICE_TWO_WAY_STEPS.map(s => `${s.title} ${s.body}`).join(' ');
    expect(all).toContain(VOICE_DEEP_LINK);
    // The route and the param name the screen actually uses.
    expect(VOICE_DEEP_LINK).toContain('/add/quick');
    expect(VOICE_DEEP_LINK).toMatch(/[?&]q=$/);
  });

  it('needs no folder, unlike the one-way command', () => {
    // Which is why it is the portable one: nothing to re-pick on someone else's device.
    const all = VOICE_TWO_WAY_STEPS.map(s => `${s.title} ${s.body}`).join(' ');
    expect(all.toLowerCase()).not.toContain('subpath');
    expect(all).not.toContain(VOICE_INBOX_FOLDER);
  });
});

describe('the install links', () => {
  it('gives every command its own one-tap install and its own fallback steps', () => {
    // One button for two shortcuts left it ambiguous which one you were installing.
    expect(VOICE_COMMANDS).toHaveLength(2);
    for (const c of VOICE_COMMANDS) {
      expect(c.steps.length).toBeGreaterThan(0);
      expect(c.name.length).toBeGreaterThan(3);
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
    // The one-way command needs the folder; the two-way must not mention it, or the
    // fallback instructions send you to configure something that does not exist.
    const [oneWay, twoWay] = VOICE_COMMANDS;
    expect(oneWay.steps).toBe(VOICE_SHORTCUT_STEPS);
    expect(twoWay.steps).toBe(VOICE_TWO_WAY_STEPS);
    expect(twoWay.steps.map(s => `${s.title} ${s.body}`).join(' ')).toContain(VOICE_DEEP_LINK);
    expect(oneWay.steps.map(s => `${s.title} ${s.body}`).join(' ')).toContain('Save File');
  });
});
