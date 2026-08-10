import { AddKind } from '../constants/enums';
import {
  VOICE_ASK_OUTPUT, VOICE_DEEP_LINK, VOICE_ENCODED_OUTPUT, VOICE_GIVE_UP_LINE,
  VOICE_HEARD_PREFIX, VOICE_RETRY_LINE, type VoiceCommand,
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

/**
 * The thing an `If` compares. **Double-wrapped, and it has to be.**
 *
 * A text *field* takes the attachment directly; a conditional's `WFInput` takes
 * `{Type: Variable, Variable: <attachment>}`. Handing it the bare attachment is not rejected —
 * it imports, it signs, it survives a device round trip — the If simply renders with an empty
 * Condition chip and never matches, so every phrase falls to the Otherwise branch. Verified
 * against real exported shortcuts, which is the only way this shape is knowable.
 */
function conditionInput(outputUuid: string, outputName: string): Plist {
  return {
    Type: 'Variable',
    Variable: {
      Value: { OutputUUID: outputUuid, OutputName: outputName, Type: 'ActionOutput' },
      WFSerializationType: 'WFTextTokenAttachment',
    },
  };
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
 * How many times it will ask before giving up.
 *
 * Bounded on purpose. Shortcuts has no while-loop, so "keep asking until it hears something"
 * is a `Repeat` with an early exit — and an *unbounded* one would hang on a phone that simply
 * cannot hear you (a noisy room, a broken mic), with Siri talking at you forever.
 */
const ASK_ATTEMPTS = 3;

/** A control-flow action. Start/else/end share one `GroupingIdentifier`; the mode says which. */
function flow(id: string, groupId: string, mode: 0 | 1 | 2, extra: Record<string, Plist> = {}): Plist {
  return action(id, { GroupingIdentifier: groupId, WFControlFlowMode: mode, ...extra });
}

/**
 * The actions: ask, and if it heard something, hand it to the app — otherwise say so and ask
 * again, up to {@link ASK_ATTEMPTS} times.
 *
 * No folder anywhere, which is the point. The file-capture version this replaced never opened
 * the app, but its `Save File` destination is a security-scoped bookmark to a folder on the
 * authoring device, so it could not survive being shared: every installer had to re-pick the
 * folder, and when they got it wrong nothing happened ever again, silently.
 *
 * `Open URLs` (plural) consumes its input rather than offering a field, so the URL action has
 * to build the address first, and `URL Encode` has to run before *that* — see
 * {@link VOICE_DEEP_LINK} for why raw dictation in a query string is not safe. `Stop This
 * Shortcut` is what breaks the loop on success — the alternative is a flag variable and a
 * second condition, for the same behaviour.
 *
 * ⚠️ **What this cannot catch.** Only *silence* is detectable here. If Siri mishears "four
 * fifty groceries" as "for fifty grocery" the input is non-empty and looks fine, so the retry
 * never fires — the app opens with whatever was heard, which is where a mis-hearing becomes
 * visible and fixable.
 */
export function shortcutActions(cmd: VoiceCommand): Plist[] {
  const askUuid = seededUuid(`${cmd.name}:ask`);
  const encUuid = seededUuid(`${cmd.name}:encode`);
  const loopId = seededUuid(`${cmd.name}:loop`);
  const ifId = seededUuid(`${cmd.name}:if`);

  return [
    flow('is.workflow.actions.repeat.count', loopId, 0, { WFRepeatCount: ASK_ATTEMPTS }),

    action('is.workflow.actions.ask', {
      WFAskActionPrompt: cmd.prompt,
      WFInputType: 'Text',
      UUID: askUuid,
    }),

    // `WFCondition: 100` is "has any value" — confirmed against real exported shortcuts, where
    // it always appears as an integer alongside a `WFInput` in the shape `conditionInput`
    // builds. Both halves matter: the code alone, on a bare attachment, renders blank.
    flow('is.workflow.actions.conditional', ifId, 0, {
      WFCondition: 100,
      WFInput: conditionInput(askUuid, VOICE_ASK_OUTPUT),
    }),

    // Percent-encode before splicing. Inside the If rather than before it: there is nothing to
    // encode when the user said nothing, and the condition is about what was *heard*.
    action('is.workflow.actions.urlencode', {
      WFInput: tokenString('', askUuid, VOICE_ASK_OUTPUT),
      WFEncodeMode: 'Encode',
      UUID: encUuid,
    }),

    // Reads back what it heard, BEFORE the app opens — see `VOICE_HEARD_PREFIX`. It sits above
    // the URL action rather than below it because `Open URLs` takes its input implicitly from
    // whatever ran last, so nothing may come between that pair.
    action('is.workflow.actions.speaktext', {
      WFText: tokenString(VOICE_HEARD_PREFIX, askUuid, VOICE_ASK_OUTPUT),
      WFSpeakTextWait: true,
    }),

    action('is.workflow.actions.url', {
      WFURLActionURL: tokenString(VOICE_DEEP_LINK, encUuid, VOICE_ENCODED_OUTPUT),
    }),
    action('is.workflow.actions.openurl', {}),
    // Heard something and handed it over — stop, or the loop would ask twice more. No Dismiss
    // Siri here: the app coming to the foreground is what closes Siri, and inserting an action
    // between the hand-off and the launch is a risk taken for something already happening.
    action('is.workflow.actions.exit', {}),

    flow('is.workflow.actions.conditional', ifId, 1),
    action('is.workflow.actions.speaktext', { WFText: VOICE_RETRY_LINE, WFSpeakTextWait: true }),
    flow('is.workflow.actions.conditional', ifId, 2),

    flow('is.workflow.actions.repeat.count', loopId, 2),

    // Only silence reaches past the loop — success exits above.
    //
    // No `Dismiss Siri` after this. It reads as the action that "closes cleanly", but its real
    // name is *Dismiss Siri and Continue*: it tears the interface down and keeps running, which
    // cut the line off mid-sentence — the one ending that most needs to be heard. Reaching the
    // end of a shortcut closes Siri by itself, after the speech has finished.
    action('is.workflow.actions.speaktext', { WFText: VOICE_GIVE_UP_LINE, WFSpeakTextWait: true }),
  ];
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
