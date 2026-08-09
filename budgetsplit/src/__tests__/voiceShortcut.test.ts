import {
  VOICE_INBOX_FOLDER, VOICE_FILES_LOCATION, VOICE_SHORTCUT_STEPS, VOICE_SHORTCUT_URL,
  VOICE_PHRASE_EXAMPLES, VOICE_GROUP_KEYWORDS, VOICE_ROUTING_SUMMARY,
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
  it('names it, dictates, saves, then sets the destination', () => {
    expect(VOICE_SHORTCUT_STEPS).toHaveLength(4);
    const titles = VOICE_SHORTCUT_STEPS.map(s => s.title.toLowerCase());
    const dictateAt = titles.findIndex(t => t.includes('dictate text'));
    const saveAt = titles.findIndex(t => t.includes('save file'));
    const destAt = titles.findIndex(t => t.includes('destination'));
    expect(dictateAt).toBeGreaterThanOrEqual(0);
    // Nothing can be saved before it has been dictated, and there is no destination to
    // change until the Save File action exists.
    expect(saveAt).toBeGreaterThan(dictateAt);
    expect(destAt).toBeGreaterThan(saveAt);
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
