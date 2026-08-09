/**
 * Lets Node run the app's TypeScript directly, extensionless imports and all.
 *
 * The source tree writes `import … from './voiceInbox'`, which Metro and jest resolve but
 * Node ESM does not. This appends the extension at resolve time so a script can import app
 * code as-is, rather than the alternative of a bundler dependency or a duplicated copy of the
 * constants (which is the whole thing these scripts exist to avoid).
 */
import { registerHooks } from 'node:module';

const HAS_EXT = /\.[cm]?[jt]sx?$/;

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !HAS_EXT.test(specifier)) {
      for (const ext of ['.ts', '.tsx', '/index.ts']) {
        try {
          return next(specifier + ext, context);
        } catch {
          // Try the next shape; fall through to the bare specifier below.
        }
      }
    }
    return next(specifier, context);
  },
});
