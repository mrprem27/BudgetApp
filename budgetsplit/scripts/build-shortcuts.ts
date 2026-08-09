/**
 * Generates and signs the Siri shortcuts from `VOICE_COMMANDS`.
 *
 *   npm run build:shortcuts
 *
 * Output lands in `build/shortcuts/`. Signing uses macOS's own `shortcuts sign -m anyone`,
 * so this only runs on a Mac.
 *
 * **This does not replace the iCloud links.** A signed `.shortcut` file still counts as
 * "untrusted" on iOS unless it arrived via an Apple-minted iCloud share link, so handing these
 * files to end users would make them dig out Settings › Shortcuts › Allow Untrusted Shortcuts.
 * What it replaces is *authoring by hand*: import these once on your own device, share each
 * from the Shortcuts app, and paste the resulting links into `voiceShortcut.ts`. The actions,
 * prompts and deep links then come from the same constants the app shows on screen, which is
 * the drift this exists to kill.
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { VOICE_COMMANDS } from '../src/lib/voiceShortcut';
import { buildShortcutPlist, postImportStep } from '../src/lib/voiceShortcutFile';

const OUT = join(import.meta.dirname, '..', 'build', 'shortcuts');

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let signed = 0;
for (const cmd of VOICE_COMMANDS) {
  const base = join(OUT, slug(cmd.name));
  const unsigned = `${base}.unsigned.shortcut`;
  const out = `${base}.shortcut`;

  writeFileSync(unsigned, buildShortcutPlist(cmd));

  try {
    execFileSync('/usr/bin/shortcuts', ['sign', '-m', 'anyone', '-i', unsigned, '-o', out], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    rmSync(unsigned);
    signed++;
    console.log(`✓ ${cmd.name} → ${out}`);
  } catch (e) {
    // Keep the unsigned file: it is still importable on a device with untrusted shortcuts
    // allowed, and it is what you inspect when signing is the thing that broke.
    const msg = e instanceof Error && 'stderr' in e ? String((e as { stderr: Buffer }).stderr).trim() : String(e);
    console.error(`✗ ${cmd.name} — signing failed, kept ${unsigned}\n  ${msg}`);
  }

  const step = postImportStep(cmd);
  if (step) console.log(`  ↳ after importing: ${step}`);
}

console.log(`\n${signed}/${VOICE_COMMANDS.length} signed into ${OUT}`);
console.log('AirDrop them to your iPhone, then share each from Shortcuts and paste the iCloud');
console.log('links into VOICE_SHORTCUT_URL / VOICE_INCOME_URL / VOICE_SETTLE_URL.');
