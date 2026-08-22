import { settings } from './settings';
import { listServerBackups, serverConfigured } from './serverApi';

/**
 * When this user last actually had a backup — counting the ones on their account.
 *
 * `settings.lastBackupAt` lives in **AsyncStorage**, so it is not in a backup and
 * does not survive a reinstall. Someone who signs in on a new phone with ten
 * snapshots sitting on their account was told, in amber, "Never backed up" — the
 * exact prompt designed to make them act, shown to the one person who already
 * has. Worse, it invites them to make an eleventh instead of restoring the ten.
 *
 * So the server is asked, and the newer of the two answers wins. Never the local
 * value alone, and never the server's alone either: a file backup they shared to
 * Drive is real and the server knows nothing about it.
 *
 * Falls back silently to the local value. This drives one label on a settings
 * row — being offline should not make it show an error, and it must never block
 * the screen.
 */
export async function reconciledBackupAt(): Promise<number | null> {
  const local = await settings.lastBackupAt().catch(() => null);
  if (!serverConfigured()) return local;

  try {
    const remote = await listServerBackups();
    if (remote.length === 0) return local;
    const newest = Math.max(...remote.map(b => b.createdAt));
    // Written back so the next launch is right even offline, and so the monthly
    // nudge stops firing at someone who is demonstrably backed up.
    if (local === null || newest > local) {
      await settings.setLastBackupAt(newest).catch(() => {});
      return newest;
    }
    return local;
  } catch {
    // Not signed in, offline, or the Worker is down. All three mean "I cannot
    // improve on what I know", which is not the same as "there is no backup".
    return local;
  }
}
