import { AddKind } from '../constants/enums';
import {
  VOICE_ASK_OUTPUT, VOICE_DEEP_LINK, VOICE_DEEP_LINK_INCOME, VOICE_DEEP_LINK_SETTLE,
  type VoiceCommand,
} from './voiceShortcut';

/**
 * Builds a `.shortcut` file for a {@link VoiceCommand}, as Shortcuts' own plist format.
 *
 * The point is that the shortcut and the instructions come from **one** definition. Every
 * previous version of this was authored by hand in the Shortcuts app, which is why the app
 * could tell you to type one prompt while the installed shortcut asked another — and why
 * fixing a wording nit meant re-sharing and pasting a new iCloud URL.
 *
 * Output is unsigned XML. `scripts/build-shortcuts.ts` runs it through macOS's
 * `shortcuts sign -m anyone`, which is what makes a file iOS will import without
 * "Allow Untrusted Shortcuts".
 *
 * Pure string building — no filesystem, so `voiceShortcutFile.test.ts` can assert on the
 * result without writing anything.
 */

/** U+FFFC. Where a variable sits inside a text field; the range map points back at it. */
const OBJ = '￼';

type Plist = string | number | boolean | Plist[] | { [k: string]: Plist };

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Minimal plist serializer — enough for the value shapes Shortcuts uses. */
export function toPlist(v: Plist, indent = ''): string {
  const pad = indent + '\t';
  if (typeof v === 'string') return `${indent}<string>${esc(v)}</string>`;
  if (typeof v === 'boolean') return `${indent}<${v}/>`;
  if (typeof v === 'number') {
    return Number.isInteger(v) ? `${indent}<integer>${v}</integer>` : `${indent}<real>${v}</real>`;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return `${indent}<array/>`;
    return `${indent}<array>\n${v.map(x => toPlist(x, pad)).join('\n')}\n${indent}</array>`;
  }
  const keys = Object.keys(v);
  if (keys.length === 0) return `${indent}<dict/>`;
  const body = keys
    .map(k => `${pad}<key>${esc(k)}</key>\n${toPlist(v[k], pad)}`)
    .join('\n');
  return `${indent}<dict>\n${body}\n${indent}</dict>`;
}

/**
 * A deterministic UUID from a seed.
 *
 * Deterministic on purpose: a random one would make every build produce a different file, so
 * `git diff` could never tell a real change from a rebuild.
 */
export function seededUuid(seed: string): string {
  let h = 0x811c9dc5;
  const bytes: number[] = [];
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < seed.length; j++) {
      h ^= seed.charCodeAt(j) + i;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    bytes.push(h & 0xff);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function action(id: string, params: Record<string, Plist>): Plist {
  return { WFWorkflowActionIdentifier: id, WFWorkflowActionParameters: params };
}

/** A text field carrying one action's output between a literal prefix and suffix. */
function tokenString(prefix: string, outputUuid: string, outputName: string, suffix = ''): Plist {
  return {
    Value: {
      string: `${prefix}${OBJ}${suffix}`,
      attachmentsByRange: {
        [`{${prefix.length}, 1}`]: {
          Type: 'ActionOutput',
          OutputUUID: outputUuid,
          OutputName: outputName,
        },
      },
    },
    WFSerializationType: 'WFTextTokenString',
  };
}

/**
 * Icon tints, from Shortcuts' own fixed palette — arbitrary integers are not accepted, so
 * these are the documented named values (sebj/iOS-Shortcuts-Reference), picked to match the
 * app's kind colours: Teal for `colors.accent`, Green for `colors.income`, and Violet
 * (0x7B72E9) which is within a shade of `colors.settle` (#8B7CF8).
 */
const TINT: Record<AddKind, number> = {
  [AddKind.Expense]: 431817727,   // Teal
  [AddKind.Income]: 4292093695,   // Green
  [AddKind.Transfer]: 2071128575, // Violet
};

/**
 * Glyphs, which are indices into Shortcuts' internal symbol set.
 *
 * ⚠️ **Unverified.** Apple publishes no mapping and none of the community references document
 * one; only 59511 is attested in the wild. A wrong number does not fail the build or the
 * signing — it just renders some other symbol, so check the tile in the Shortcuts app after a
 * rebuild rather than trusting these.
 */
const GLYPH: Record<AddKind, number> = {
  [AddKind.Expense]: 59511,
  [AddKind.Income]: 59473,
  [AddKind.Transfer]: 59461,
};

/**
 * The actions for a command: ask, build a deep link, open it.
 *
 * **Three actions and no folder** — which is the whole point. The file-capture version this
 * replaced never opened the app, but its `Save File` destination is a security-scoped bookmark
 * to a folder on the authoring device, so it could not survive being shared: every installer
 * had to find the action and re-pick the folder, and when they got it wrong nothing happened
 * ever again, silently. A setup step that fails invisibly is worse than a visible extra tap.
 *
 * `Open URLs` (plural) consumes its input rather than offering a field, so the URL action has
 * to build the address first.
 */
export function shortcutActions(cmd: VoiceCommand): Plist[] {
  const askUuid = seededUuid(`${cmd.name}:ask`);
  return [
    action('is.workflow.actions.ask', {
      WFAskActionPrompt: cmd.prompt,
      WFInputType: 'Text',
      UUID: askUuid,
    }),
    action('is.workflow.actions.url', {
      WFURLActionURL: tokenString(deepLinkFor(cmd.kind), askUuid, VOICE_ASK_OUTPUT),
    }),
    action('is.workflow.actions.openurl', {}),
  ];
}

/** ⚠️ `q` must stay last — the phrase goes in unencoded and a query value ends at the next `&`. */
function deepLinkFor(kind: AddKind): string {
  return kind === AddKind.Income ? VOICE_DEEP_LINK_INCOME
    : kind === AddKind.Transfer ? VOICE_DEEP_LINK_SETTLE
    : VOICE_DEEP_LINK;
}

/** The complete unsigned `.shortcut` document for one command. */
export function buildShortcutPlist(cmd: VoiceCommand): string {
  const doc: Plist = {
    WFWorkflowClientVersion: '2607.1.2',
    WFWorkflowMinimumClientVersion: 900,
    WFWorkflowMinimumClientVersionString: '900',
    WFWorkflowIcon: {
      WFWorkflowIconStartColor: TINT[cmd.kind],
      WFWorkflowIconGlyphNumber: GLYPH[cmd.kind],
    },
    WFWorkflowImportQuestions: [],
    WFWorkflowTypes: [],
    WFWorkflowInputContentItemClasses: [],
    WFWorkflowActions: shortcutActions(cmd),
  };
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" '
    + '"http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
    + '<plist version="1.0">\n'
    + toPlist(doc)
    + '\n</plist>\n';
}

/**
 * Anything the installer has to do by hand after importing. Nothing — which is the entire
 * reason for the deep-link shape.
 *
 * Kept as a function rather than deleted so the build script keeps surfacing a step if one is
 * ever reintroduced; returning null is a claim worth making explicitly.
 */
export function postImportStep(cmd: VoiceCommand): string | null {
  return cmd.opensApp ? null : 'Set the Save File destination before first use.';
}
