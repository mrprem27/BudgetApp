import { buildShortcutPlist, shortcutActions, seededUuid, toPlist, postImportStep } from '../lib/voiceShortcutFile';
import {
  VOICE_COMMANDS, VOICE_ASK_OUTPUT, VOICE_DEEP_LINK, VOICE_DEEP_LINK_INCOME, VOICE_DEEP_LINK_SETTLE,
} from '../lib/voiceShortcut';
import { AddKind } from '../constants/enums';

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

  it('asks, builds a link, opens it — and touches no file', () => {
    // A Save File action is what needed a folder re-picked per device, and got it wrong
    // silently. No command may contain one.
    for (const cmd of VOICE_COMMANDS) {
      const ids = shortcutActions(cmd).map(a => (a as Record<string, string>).WFWorkflowActionIdentifier);
      expect(ids).toEqual([
        'is.workflow.actions.ask',
        'is.workflow.actions.url',
        'is.workflow.actions.openurl',
      ]);
    }
  });

  it('embeds the link that sets the kind, with q last', () => {
    // The kind rides in the URL now. `&` is escaped in the plist, so compare the escaped form.
    for (const cmd of VOICE_COMMANDS) {
      const xml = buildShortcutPlist(cmd);
      const link = cmd.kind === AddKind.Income ? VOICE_DEEP_LINK_INCOME
        : cmd.kind === AddKind.Transfer ? VOICE_DEEP_LINK_SETTLE : VOICE_DEEP_LINK;
      expect(xml).toContain(link.replace(/&/g, '&amp;'));
      expect(link).toMatch(/[?&]q=$/);
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

  it('is stable across builds', () => {
    // Random UUIDs would make every rebuild a diff, so a real change could never be spotted.
    for (const cmd of VOICE_COMMANDS) {
      expect(buildShortcutPlist(cmd)).toBe(buildShortcutPlist(cmd));
    }
    expect(seededUuid('a')).not.toBe(seededUuid('b'));
    expect(seededUuid('a')).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/);
  });

  it('leaves nothing for the installer to configure', () => {
    // The claim the whole design rests on. A non-null step here means setup can fail again.
    for (const cmd of VOICE_COMMANDS) expect(postImportStep(cmd)).toBeNull();
  });

  it('escapes plist-hostile characters', () => {
    expect(toPlist('a & b < c')).toBe('<string>a &amp; b &lt; c</string>');
    expect(toPlist([])).toBe('<array/>');
    expect(toPlist({})).toBe('<dict/>');
    expect(toPlist(false)).toBe('<false/>');
  });
});
