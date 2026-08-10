import { buildShortcutPlist, shortcutActions, seededUuid, toPlist, postImportStep } from '../lib/voiceShortcutFile';
import {
  VOICE_COMMANDS, VOICE_ASK_OUTPUT, VOICE_DEEP_LINK, VOICE_RETRY_LINE, VOICE_GIVE_UP_LINE,
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
        'is.workflow.actions.repeat.count',
        'is.workflow.actions.ask',
        'is.workflow.actions.conditional',
        'is.workflow.actions.urlencode',
        'is.workflow.actions.speaktext',
        'is.workflow.actions.url',
        'is.workflow.actions.openurl',
        'is.workflow.actions.exit',
        'is.workflow.actions.conditional',
        'is.workflow.actions.speaktext',
        'is.workflow.actions.conditional',
        'is.workflow.actions.repeat.count',
        'is.workflow.actions.speaktext',
      ]);

      // `Open URLs` takes its input implicitly from whatever ran last, so the read-back Speak
      // must sit above the URL action. Slipping it between the two is the kind of edit that
      // looks tidier and hands the launcher a spoken string instead of an address.
      expect(ids[ids.indexOf('is.workflow.actions.openurl') - 1]).toBe('is.workflow.actions.url');
      expect(ids).not.toContain('is.workflow.actions.documentpicker.save');
    }
  });

  it('nests the retry loop so Shortcuts can parse it', () => {
    // Control flow is start/else/end sharing one GroupingIdentifier. Mis-order them and the
    // file still signs — signing checks structure, not that the blocks make sense — so the
    // shortcut imports and then behaves like something nobody designed.
    for (const cmd of VOICE_COMMANDS) {
      const flows = shortcutActions(cmd)
        .map(a => a as { WFWorkflowActionIdentifier: string; WFWorkflowActionParameters: Record<string, unknown> })
        .filter(a => a.WFWorkflowActionParameters.WFControlFlowMode !== undefined);

      // Each block: opens (0), may branch (1), closes (2) — in that order, once each.
      const byGroup = new Map<string, number[]>();
      for (const f of flows) {
        const g = String(f.WFWorkflowActionParameters.GroupingIdentifier);
        byGroup.set(g, [...(byGroup.get(g) ?? []), f.WFWorkflowActionParameters.WFControlFlowMode as number]);
      }
      expect([...byGroup.values()]).toEqual(
        expect.arrayContaining([[0, 2], [0, 1, 2]]),
      );

      // The If must close before the Repeat does, or the blocks interleave.
      const ids = shortcutActions(cmd).map(a => (a as Record<string, string>).WFWorkflowActionIdentifier);
      expect(ids.lastIndexOf('is.workflow.actions.conditional'))
        .toBeLessThan(ids.lastIndexOf('is.workflow.actions.repeat.count'));
    }
  });

  it('says it did not catch, and stops once it did', () => {
    for (const cmd of VOICE_COMMANDS) {
      const xml = buildShortcutPlist(cmd);
      expect(xml).toContain(VOICE_RETRY_LINE.replace(/'/g, '&#39;').replace(/&#39;/g, "'"));
      // Without the exit, a successful first try would open the app and then ask twice more.
      expect(xml).toContain('is.workflow.actions.exit');
    }
  });

  it('always answers, and never says "nothing logged" after a success', () => {
    // Both endings speak: silence is what a working capture also sounds like once the phone is
    // back in a pocket, so an unspoken failure reads as a spend that was saved.
    for (const cmd of VOICE_COMMANDS) {
      const ids = shortcutActions(cmd).map(a => (a as Record<string, string>).WFWorkflowActionIdentifier);
      const loopEnd = ids.lastIndexOf('is.workflow.actions.repeat.count');

      // The give-up line and the dismiss sit OUTSIDE the loop; the success exit is inside it.
      // Were they inside, every silent attempt would announce that nothing was logged — and a
      // success would announce it too, right after handing the phrase to the app.
      expect(ids.indexOf('is.workflow.actions.exit')).toBeLessThan(loopEnd);
      expect(ids.lastIndexOf('is.workflow.actions.speaktext')).toBeGreaterThan(loopEnd);

      expect(buildShortcutPlist(cmd)).toContain(VOICE_GIVE_UP_LINE);
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

  it('puts the ENCODED text in the URL, not the raw dictation', () => {
    // The bug this pins: splicing `Provided Input` straight into `?q=` looks fine until the
    // phrase contains a % ("fifty percent off" dictates as "50%"), which is a malformed escape
    // rather than an odd character — parsers reject it outright. Both variables are in scope at
    // that point, so picking the wrong one is a one-word mistake with no visible symptom.
    for (const cmd of VOICE_COMMANDS) {
      const url = shortcutActions(cmd)
        .map(a => a as { WFWorkflowActionIdentifier: string; WFWorkflowActionParameters: Record<string, unknown> })
        .find(a => a.WFWorkflowActionIdentifier === 'is.workflow.actions.url');
      const attachments = (url?.WFWorkflowActionParameters.WFURLActionURL as
        { Value: { attachmentsByRange: Record<string, { OutputUUID: string }> } }).Value.attachmentsByRange;
      const bound = Object.values(attachments).map(a => a.OutputUUID);

      expect(bound).toEqual([seededUuid(`${cmd.name}:encode`)]);
      expect(bound).not.toContain(seededUuid(`${cmd.name}:ask`));
    }
  });

  it('double-wraps the If input, or the condition renders blank', () => {
    // Shipped once, and nothing caught it: a conditional's WFInput takes
    // {Type: Variable, Variable: <attachment>}, NOT the bare attachment a text field takes.
    // The bare form imports, signs, and survives a device round trip with WFCondition intact —
    // it just leaves the If showing an empty Condition chip, so every phrase falls through to
    // Otherwise and the shortcut only ever says it didn't catch anything.
    for (const cmd of VOICE_COMMANDS) {
      const iff = shortcutActions(cmd)
        .map(a => a as { WFWorkflowActionIdentifier: string; WFWorkflowActionParameters: Record<string, unknown> })
        .find(a => a.WFWorkflowActionParameters.WFCondition !== undefined);

      expect(iff?.WFWorkflowActionParameters.WFCondition).toBe(100);
      expect(iff?.WFWorkflowActionParameters.WFInput).toEqual({
        Type: 'Variable',
        Variable: {
          Value: { OutputUUID: seededUuid(`${cmd.name}:ask`), OutputName: VOICE_ASK_OUTPUT, Type: 'ActionOutput' },
          WFSerializationType: 'WFTextTokenAttachment',
        },
      });
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
