/**
 * An in-memory stand-in for `expo-file-system`'s `File` / `Directory` / `Paths` surface.
 *
 * `expo-file-system` has no entry in jest's `moduleNameMapper`, so anything importing it was
 * untestable — which included `voiceDrain`, the one place in the voice path that writes money.
 * This is a real module rather than an inline `jest.mock` factory because a factory may not
 * reference anything outside its own scope (not even a local type alias), and because the fake
 * is worth reusing for `deviceStorage` and `attachment` later.
 *
 * Use it as:  `jest.mock('expo-file-system', () => require('./__mocks__/expoFileSystem'));`
 *
 * Only the members the app actually calls are implemented, deliberately — an unimplemented
 * one should fail loudly rather than quietly return nothing.
 */

type Entry = { name: string; content: string; creationTime?: number | null };

export const state = {
  dirExists: true,
  entries: [] as Entry[],
  /** Names whose `text()` throws — a corrupt or mid-write capture. */
  unreadable: new Set<string>(),
  /** Names whose `delete()` throws — a file held open by something else. */
  undeletable: new Set<string>(),
  /** Names whose `write()` throws — a read-only or full volume. */
  unwritable: new Set<string>(),
};

export const Paths = { document: '/doc', cache: '/cache' };

export class File {
  constructor(public name: string) {}

  get exists(): boolean {
    return state.entries.some(e => e.name === this.name);
  }

  get size(): number {
    return state.entries.find(e => e.name === this.name)?.content.length ?? 0;
  }

  /**
   * When the file was written. Real on device — the drain uses it as the capture time when the
   * filename carries no timestamp, which is what lets the Shortcut skip its date actions.
   * `null` is a valid answer from the real API, so the fake can return it too.
   */
  get creationTime(): number | null {
    return state.entries.find(e => e.name === this.name)?.creationTime ?? null;
  }

  async text(): Promise<string> {
    if (state.unreadable.has(this.name)) throw new Error('unreadable');
    return state.entries.find(e => e.name === this.name)?.content ?? '';
  }

  delete(): void {
    if (state.undeletable.has(this.name)) throw new Error('locked');
    state.entries = state.entries.filter(e => e.name !== this.name);
  }

  write(content: string): void {
    if (state.unwritable.has(this.name)) throw new Error('read-only');
    const hit = state.entries.find(e => e.name === this.name);
    if (hit) hit.content = content;
    else state.entries.push({ name: this.name, content });
  }

  create(): void { this.write(''); }
}

export class Directory {
  // The app constructs these as `new Directory(Paths.document, 'voice-inbox')`; the fake is
  // flat, so the path arguments are accepted and ignored.
  constructor(..._path: unknown[]) {}

  get exists(): boolean { return state.dirExists; }

  create(): void { state.dirExists = true; }

  list(): File[] {
    // Matches the real API, which throws when the parent directory is absent.
    if (!state.dirExists) throw new Error('no such directory');
    return state.entries.map(e => new File(e.name));
  }
}

/** Back to empty. Call in `beforeEach`, or state leaks between tests. */
export function __reset(): void {
  state.dirExists = true;
  state.entries = [];
  state.unreadable.clear();
  state.undeletable.clear();
  state.unwritable.clear();
}
