import { AddKind, type TxnKind } from '../constants/enums';
import { CAPTURE_PREFIX } from './voiceInbox';
import {
  VOICE_ASK_OUTPUT, VOICE_FILES_LOCATION, VOICE_INBOX_FOLDER, type VoiceCommand,
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

/** The actions for a command, in the order Shortcuts runs them. */
export function shortcutActions(cmd: VoiceCommand): Plist[] {
  const askUuid = seededUuid(`${cmd.name}:ask`);
  const ask = action('is.workflow.actions.ask', {
    WFAskActionPrompt: cmd.prompt,
    WFInputType: 'Text',
    UUID: askUuid,
  });

  // Every command files. Nothing opens the app, so nothing interrupts you — the kind is
  // carried in the filename rather than in a deep link.
  const randUuid = seededUuid(`${cmd.name}:rand`);
  return [
    ask,
    action('is.workflow.actions.number.random', {
      // Capped at six digits deliberately. `captureTimeFromName` reads an all-digit stem of
      // 8/12/14 digits as a calendar stamp, so a wider range would occasionally produce a
      // filename that parses as a date and file the spend on a day it did not happen.
      WFRandomNumberMinimum: 1,
      WFRandomNumberMaximum: 999999,
      UUID: randUuid,
    }),
    action('is.workflow.actions.documentpicker.save', {
      // ⚠️ The destination folder is NOT set here and cannot be: it is a security-scoped
      // bookmark to a folder on the device that authored the shortcut, so it does not survive
      // sharing. Left unset, Shortcuts saves into its own iCloud folder and the app never sees
      // the capture — which is why `postImportStep` makes picking it the one required step.
      WFAskWhereToSave: false,
      WFFileDestinationPath: tokenString(`${CAPTURE_PREFIX[txnKind(cmd.kind)]}-`, randUuid, 'Random Number', '.txt'),
      WFInput: {
        Value: { OutputUUID: askUuid, OutputName: VOICE_ASK_OUTPUT, Type: 'ActionOutput' },
        WFSerializationType: 'WFTextTokenAttachment',
      },
    }),
    // The only signal the capture worked. Without it you speak into silence and cannot tell a
    // success from Siri having missed the phrase entirely.
    action('is.workflow.actions.speaktext', {
      WFText: cmd.speak,
      WFSpeakTextWait: true,
    }),
  ];
}

/** `AddKind.Transfer` is stored as a `settlement`; everything else maps straight across. */
function txnKind(kind: AddKind): TxnKind {
  return kind === AddKind.Transfer ? 'settlement' : kind;
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
 * What a generated file still cannot carry, per command.
 *
 * `Save File`'s destination is a security-scoped bookmark to a folder on the phone that
 * authored it. There is no way to express "the BudgetSplit container on *your* device" in a
 * portable file, so the filing command needs its destination picked once after import. The
 * app-opening commands have no folder and import complete.
 */
export function postImportStep(cmd: VoiceCommand): string | null {
  if (cmd.opensApp) return null;
  return `Open the shortcut once and set Save File's destination to ${VOICE_FILES_LOCATION}. `
    + `A folder bookmark is specific to your device, so it cannot travel in the file — this is `
    + `the only step left, and the "${VOICE_INBOX_FOLDER}" folder already exists.`;
}
