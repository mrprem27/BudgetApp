import { buildShortcutPlist, shortcutActions, seededUuid, toPlist, postImportStep } from '../lib/voiceShortcutFile';
import { VOICE_COMMANDS, VOICE_ASK_OUTPUT } from '../lib/voiceShortcut';
import { CAPTURE_PREFIX, kindFromCaptureName } from '../lib/voiceInbox';
import { AddKind, type TxnKind } from '../constants/enums';

/**
 * The generated shortcut must say what the app says. That is the entire reason it is generated
 * — the hand-authored ones drifted, asking one question while the setup screen taught another.
 */
describe('the generated shortcut matches the command it came from', () => {
  it('asks the command’s own prompt, not a shared one', () => {
    for (const cmd of VOICE_COMMANDS) {
      const xml = buildShortcutPlist(cmd);
      expect(xml).toContain('is.workflow.actions.ask');
      expect(xml).toContain(`<string>${cmd.prompt}</string>`);
      expect(xml).toMatch(/<key>WFInputType<\/key>\s*<string>Text<\/string>/);
    }
  });

  it('captures to a file and never opens the app', () => {
    // Opening the app is the friction this pipeline exists to remove, so no command may
    // contain a URL action at all.
    for (const cmd of VOICE_COMMANDS) {
      const ids = shortcutActions(cmd).map(a => (a as Record<string, string>).WFWorkflowActionIdentifier);
      expect(ids).toEqual([
        'is.workflow.actions.ask',
        'is.workflow.actions.number.random',
        'is.workflow.actions.documentpicker.save',
        'is.workflow.actions.speaktext',
      ]);
    }
  });

  it('names the file so the drain can read the kind off it', () => {
    // The prefix is the ONLY thing carrying the kind — a text file has nowhere else to put
    // it. Get it wrong and a salary files silently as an expense.
    for (const cmd of VOICE_COMMANDS) {
      const xml = buildShortcutPlist(cmd);
      const kind: TxnKind = cmd.kind === AddKind.Transfer ? 'settlement' : cmd.kind;
      expect(xml).toContain(`${CAPTURE_PREFIX[kind]}-`);
      expect(xml).toContain('.txt');
    }
    // And the prefixes must round-trip through the reader.
    for (const kind of Object.keys(CAPTURE_PREFIX) as TxnKind[]) {
      expect(kindFromCaptureName(`${CAPTURE_PREFIX[kind]}-421887.txt`)).toBe(kind);
    }
  });

  it('speaks a confirmation last', () => {
    // Nothing opens the app any more, so this is the only evidence the capture happened.
    for (const cmd of VOICE_COMMANDS) {
      const ids = shortcutActions(cmd).map(a => (a as Record<string, string>).WFWorkflowActionIdentifier);
      expect(ids[ids.length - 1]).toBe('is.workflow.actions.speaktext');
      expect(buildShortcutPlist(cmd)).toContain(`<string>${cmd.speak}</string>`);
    }
  });

  it('feeds the Ask output into whatever consumes it', () => {
    // A wrong OutputUUID yields an empty file or an empty URL, with no error either way.
    for (const cmd of VOICE_COMMANDS) {
      const xml = buildShortcutPlist(cmd);
      const askUuid = seededUuid(`${cmd.name}:ask`);
      expect(xml).toContain(`<string>${askUuid}</string>`);
      expect(xml).toContain(`<string>${VOICE_ASK_OUTPUT}</string>`);
      // Referenced somewhere other than its own declaration.
      expect(xml.split(askUuid).length - 1).toBeGreaterThanOrEqual(2);
    }
  });

  it('gives each capture its own filename', () => {
    // Without Random Number every file is named after the action that fed it, so two spends
    // said before the next launch collide and one is unrecoverable.
    const filing = VOICE_COMMANDS.find(c => !c.opensApp)!;
    const xml = buildShortcutPlist(filing);
    expect(xml).toMatch(/<key>WFRandomNumberMaximum<\/key>\s*<integer>999999<\/integer>/);
    expect(xml).toMatch(/<key>WFAskWhereToSave<\/key>\s*<false\/>/);
  });

  it('is stable across builds', () => {
    // Random UUIDs would make every rebuild a diff, so a real change could never be spotted.
    for (const cmd of VOICE_COMMANDS) {
      expect(buildShortcutPlist(cmd)).toBe(buildShortcutPlist(cmd));
    }
    expect(seededUuid('a')).not.toBe(seededUuid('b'));
    expect(seededUuid('a')).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/);
  });

  it('admits the one thing a file cannot carry', () => {
    // The Save File destination is a security-scoped bookmark to a folder on the device that
    // authored it. Silently shipping a shortcut that saves to the wrong place would look like
    // the app losing captures.
    for (const cmd of VOICE_COMMANDS) {
      const step = postImportStep(cmd);
      if (cmd.opensApp) expect(step).toBeNull();
      else expect(step).toMatch(/destination/i);
    }
  });

  it('escapes plist-hostile characters', () => {
    expect(toPlist('a & b < c')).toBe('<string>a &amp; b &lt; c</string>');
    expect(toPlist([])).toBe('<array/>');
    expect(toPlist({})).toBe('<dict/>');
    expect(toPlist(false)).toBe('<false/>');
  });
});
