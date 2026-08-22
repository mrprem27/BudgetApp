import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { dateTime } from '../../src/lib/dateFormat';
import { colors, type, space, radius, layout, shadow } from '../../src/theme';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { SettingsRow, settingsRowDivider } from '../../src/components/ui/SettingsRow';
import { IconCircle } from '../../src/components/ui/IconCircle';
import { PassphraseSheet } from '../../src/components/finance/backup/PassphraseSheet';
import { settings } from '../../src/lib/settings';
import { useDataRefresh } from '../../src/components/system/DataRefreshProvider';
import { haptic } from '../../src/lib/haptics';
import {
  buildBackupPayload, backupFileName, encryptPayload, decryptEnvelope,
  BackupWrongPassphraseError, BackupVersionError, canReadCipher,
  type BackupEnvelope, type BackupPayload,
} from '../../src/lib/backup';
import {
  readAllTables, restoreAllTables, readPhotoFiles, restorePhotoFiles, reapUnreferencedPhotos,
} from '../../src/db/queries/backup';
import { ServerBackupSheet } from '../../src/components/finance/backup/ServerBackupSheet';
import { useServerSession } from '../../src/hooks/useServerSession';
import { formatBytes } from '../../src/lib/storage';
import { beginRestore, endRestore } from '../../src/lib/restoreGuard';
import {
  uploadBackup, listServerBackups, downloadServerBackup, deleteServerBackup,
  type ServerBackup,
} from '../../src/lib/serverApi';

/**
 * The smaller of the two server ceilings — KV's hard 25 MiB per value.
 *
 * Deliberately conservative: `storage.ts` raises this to 50 MB once R2 is bound,
 * but a client that assumed the larger number would let someone spend a full
 * encrypt before a 413 on the deployment that is actually live.
 */
const MAX_SERVER_BACKUP_BYTES = 25 * 1024 * 1024;

export default function BackupScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { refresh } = useDataRefresh();

  const { session: serverSession, configured: serverConfigured } = useServerSession();

  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  /**
   * How far the key derivation has got, 0-100.
   *
   * Shown because it is the slow part and it is otherwise indistinguishable from
   * a hang: 50,000 PBKDF2 rounds take most of a second on a phone, and a row that
   * only spins tells someone nothing about whether to wait or force-quit. Now that
   * the derivation yields, this can actually repaint.
   */
  const [kdfPct, setKdfPct] = useState(0);
  const onKdf = (f: number) => setKdfPct(Math.round(f * 100));
  const [unlocking, setUnlocking] = useState(false);
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  /** Where the encrypted envelope goes once it's built — the only difference
   *  between the two "create" rows. Everything up to that point is identical. */
  const [createTarget, setCreateTarget] = useState<'file' | 'server'>('file');
  const [showServerList, setShowServerList] = useState(false);
  const [serverBackups, setServerBackups] = useState<ServerBackup[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [includePhotos, setIncludePhotos] = useState(false);
  const [showRestoreSheet, setShowRestoreSheet] = useState(false);
  const [pickedEnvelope, setPickedEnvelope] = useState<BackupEnvelope | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<number | null>(null);

  // The *backup* timestamp, not the reminder anchor — enabling the reminder
  // stamps the anchor, which is how this row came to claim a backup that never
  // happened. Only handleCreateBackup / doRestore below write it.
  useEffect(() => { settings.lastBackupAt().then(setLastBackupAt); }, []);

  async function handleCreateBackup(passphrase: string) {
    setShowCreateSheet(false);
    setKdfPct(0);
    setCreating(true);
    try {
      const tables = await readAllTables(db);
      // Opt-in. Receipt photos dwarf the rows — a few hundred transactions is
      // tens of KB, one receipt can be a megabyte — so this is the user's call
      // rather than a default that quietly makes every backup unshareable.
      const photos = includePhotos ? await readPhotoFiles(tables) : undefined;
      const payload = buildBackupPayload(tables, photos);
      const envelope = await encryptPayload(payload, passphrase, onKdf);

      if (createTarget === 'server') {
        /*
         * Checked here, before the upload, because the alternative is cruel:
         * the whole payload is held as base64, copied by JSON.stringify, copied
         * again by the cipher, and only then rejected with a 413 — after the user
         * has already waited through the key derivation.
         *
         * The ceiling is the server's, not a guess: KV stops at 25 MiB where R2
         * keeps going, and `createBackup` reads it from whichever backend is
         * actually bound. This number matches the smaller one, so the message is
         * right on either.
         */
        const body = JSON.stringify(envelope);
        if (body.length > MAX_SERVER_BACKUP_BYTES) {
          haptic.warning();
          Alert.alert(
            'Too large for your account',
            `This backup is ${formatBytes(body.length)}, and the limit is `
            + `${formatBytes(MAX_SERVER_BACKUP_BYTES)}. Receipt photos are almost always the reason — `
            + 'make one without them, or save it as a file instead.',
          );
          return;
        }
        // Uploaded already-encrypted: the server stores the same bytes this
        // device would have written to a file, and can't read either.
        const saved = await uploadBackup(body);
        Alert.alert(
          'Backed up to your account',
          `${formatBytes(saved.sizeBytes)}, encrypted on this phone. You'll need this passphrase to restore it — it was never sent.`,
        );
      } else {
        const file = new File(Paths.cache, backupFileName());
        file.create({ overwrite: true });
        file.write(JSON.stringify(envelope));
        if (!(await Sharing.isAvailableAsync())) {
          // Nowhere to share to, so the file in the cache directory IS the
          // backup — and the OS may evict it. Recorded as done because it is as
          // done as it can get here, and named so the user can go and move it.
          Alert.alert('Saved', `Sharing isn’t available here. The backup was saved to:\n${file.uri}`);
        } else {
          await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save backup' });
          /*
           * `shareAsync` resolves when the sheet CLOSES — the same whether the
           * user saved the file or swiped the sheet away. Treating that as
           * success meant a cancelled share was recorded as a backup: Settings
           * then read "Backed up just now" and the nudge went quiet for a month,
           * on the strength of a file that only exists in a cache the OS is free
           * to delete.
           *
           * iOS gives no callback that distinguishes the two, so the only
           * truthful source is the person who was just looking at the sheet. One
           * tap, on something that happens monthly, to keep the one record that
           * matters after losing a phone from being a guess.
           */
          const saved = await confirmSaved();
          if (!saved) { haptic.warning(); return; }
        }
      }
      // Both: a real export is genuinely the new reminder anchor *and* the
      // moment a backup exists.
      await settings.setBackupAnchorAt(Date.now());
      await settings.setLastBackupAt(Date.now());
      setLastBackupAt(Date.now());
      haptic.success();
    } catch (e) {
      haptic.error();
      Alert.alert('Backup failed', e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  /**
   * Did the share sheet actually save anything?
   *
   * Phrased so the safe answer is the honest one: "Not yet" simply leaves the
   * record alone and the monthly nudge running, which is the correct state for
   * someone who dismissed the sheet. Nothing is lost by answering it wrongly in
   * that direction — the file is still there to share again.
   */
  function confirmSaved(): Promise<boolean> {
    return new Promise(resolve => {
      Alert.alert(
        'Did you save it?',
        'Keep it somewhere you will still have if this phone is lost — Files, iCloud Drive, or Google Drive.',
        [
          { text: 'Not yet', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Saved', onPress: () => resolve(true) },
        ],
        { cancelable: false },
      );
    });
  }

  async function handlePickRestoreFile() {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;

      const text = await new File(res.assets[0].uri).text();
      let envelope: BackupEnvelope;
      try {
        const json = JSON.parse(text) as Partial<BackupEnvelope>;
        if (typeof json.ciphertext !== 'string') throw new Error('missing ciphertext');
        // Version checked HERE, before the passphrase sheet ever opens. A file this
        // build cannot read must say so plainly — not send someone into a
        // passphrase prompt that can never succeed.
        //
        // The question goes to `canReadCipher` rather than being answered inline:
        // this guard once hardcoded "v1 only" and stayed that way after backups
        // moved to v2, so it rejected every file the app itself had just written.
        if (!canReadCipher(json.v)) {
          haptic.warning();
          Alert.alert(
            'Made by a newer version',
            'Update BudgetSplit and try again. Your passphrase is fine — this build just can\u2019t read this file yet.',
          );
          return;
        }
        envelope = json as BackupEnvelope;
      } catch {
        haptic.warning();
        Alert.alert('Not a valid backup file', 'Pick the .bsbackup file this app created.');
        return;
      }
      setPickedEnvelope(envelope);
      setRestoreError(null);
      setShowRestoreSheet(true);
    } catch {
      haptic.error();
      Alert.alert('Could not read that file', 'Try picking it again.');
    }
  }

  async function openServerList() {
    setShowServerList(true);
    setListLoading(true);
    setListError(null);
    try {
      setServerBackups(await listServerBackups());
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Could not load your backups.');
    } finally {
      setListLoading(false);
    }
  }

  /** Downloads one, then hands it to the exact same passphrase → confirm → restore
   *  path a picked file goes through. The transport is the only difference. */
  async function handlePickServerBackup(backup: ServerBackup) {
    setDownloadingId(backup.id);
    try {
      const text = await downloadServerBackup(backup.id);
      const json = JSON.parse(text) as Partial<BackupEnvelope>;
      if (typeof json.ciphertext !== 'string') throw new Error('missing ciphertext');
      // Same guard as the file path. Server backups are retained ten deep, so
      // without this a single newer snapshot would report "wrong passphrase" on a
      // screen where the user has no way to tell which of the ten is at fault.
      if (!canReadCipher(json.v)) {
        throw new Error('This backup was made by a newer version of BudgetSplit. Update the app, then restore it.');
      }
      setShowServerList(false);
      setPickedEnvelope(json as BackupEnvelope);
      setRestoreError(null);
      setShowRestoreSheet(true);
    } catch (e) {
      haptic.error();
      setListError(e instanceof Error ? e.message : 'Could not download that backup.');
    } finally {
      setDownloadingId(null);
    }
  }

  function handleDeleteServerBackup(backup: ServerBackup) {
    Alert.alert(
      'Delete this backup?',
      `The copy from ${dateTime(new Date(backup.createdAt))} is removed from your account. Anything on this device is untouched.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteServerBackup(backup.id);
              setServerBackups(prev => prev.filter(b => b.id !== backup.id));
              haptic.warning();
            } catch (e) {
              haptic.error();
              setListError(e instanceof Error ? e.message : 'Could not delete that backup.');
            }
          },
        },
      ],
    );
  }

  async function handleRestoreSubmit(passphrase: string) {
    if (!pickedEnvelope) return;
    setKdfPct(0);
    setUnlocking(true);
    try {
      const payload = await decryptEnvelope(pickedEnvelope, passphrase, onKdf);
      setShowRestoreSheet(false);
      setPickedEnvelope(null);
      setRestoreError(null);
      await confirmRestore(payload);
    } catch (e) {
      if (e instanceof BackupWrongPassphraseError) {
        setRestoreError(e.message);
      } else if (e instanceof BackupVersionError) {
        // Neither wrong-passphrase nor corrupt. Keeping the sheet open would
        // invite a retry that can never work, and calling it corrupt would invite
        // deleting a file that is perfectly fine.
        setShowRestoreSheet(false);
        setPickedEnvelope(null);
        haptic.warning();
        Alert.alert('Made by a newer version', e.message);
      } else {
        setShowRestoreSheet(false);
        setPickedEnvelope(null);
        haptic.error();
        Alert.alert('This backup looks corrupted', e instanceof Error ? e.message : 'Could not read this backup file.');
      }
    } finally {
      setUnlocking(false);
    }
  }

  /**
   * Refuse a restore while sync is on — F9.
   *
   * Restore is wipe-and-replace, so with sync live it would push this snapshot
   * over everyone else's copy: a shared group's history rewritten on other
   * people's phones from a state they never saw and cannot judge. The damage lands
   * where the person who caused it cannot see it and the people who suffer it
   * cannot undo it, which is why this is a refusal rather than a warning.
   *
   * Not a silent block: it says what to do, and turning sync off is one tap away.
   */
  async function confirmRestore(payload: BackupPayload) {
    if (await settings.syncEnabled().catch(() => false)) {
      haptic.warning();
      Alert.alert(
        'Turn off sync first',
        'Restoring replaces everything on this phone. With sync on, that would also '
        + 'replace what the people in your shared groups can see — from a backup they '
        + 'were never part of.\n\nTurn sync off under Settings → Sync, restore, then '
        + 'turn it back on when you are happy with what is here.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Sync', onPress: () => router.push('/settings/sync') },
        ],
      );
      return;
    }
    const when = dateTime(new Date(payload.createdAt));
    Alert.alert(
      'Restore this backup?',
      `This replaces ALL current data on this device with the backup from ${when}. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', style: 'destructive', onPress: () => doRestore(payload) },
      ],
    );
  }

  async function doRestore(payload: BackupPayload) {
    setRestoring(true);
    // Stops the root layout's foreground maintenance from writing into a
    // half-replaced database on its own connection. See `restoreGuard`.
    beginRestore();
    try {
      // Photos first: the tables come back with every photo URI repointed at this
      // install's directories, or nulled where the backup did not carry the file.
      // Restoring the rows verbatim is what left every restore showing "Receipt
      // attached" over a path that no longer exists.
      const tables = await restorePhotoFiles(payload.tables, payload.photos);
      await restoreAllTables(db, tables);
      /*
       * The previous install's receipts and avatars, now referenced by nothing.
       *
       * A restore hard-deletes every old row, which puts those files beyond the
       * ordinary reaper forever — it looks for soft-deleted transactions, and
       * these have no row at all. They would sit on disk being counted on the
       * storage screen for the life of the install.
       *
       * After the transaction commits, never before: deciding what is
       * unreferenced from a database about to be replaced would delete exactly
       * the files the restore is about to need.
       */
      await reapUnreferencedPhotos(db).catch(() => {});
      /*
       * Stamped with the BACKUP's date, not now. Restoring is not backing up, and
       * dating it now makes Settings read "Backed up just now" when the newest
       * backup that exists may be six months old — the same class of lie the
       * anchor exists to kill, reintroduced on the way back in.
       *
       * It follows that restoring an old backup makes the nudge fire immediately
       * rather than go quiet for a month. That is correct: a phone holding
       * six-month-old data is exactly when a fresh backup matters most.
       */
      await settings.setBackupAnchorAt(payload.createdAt);
      await settings.setLastBackupAt(payload.createdAt);
      setLastBackupAt(payload.createdAt);
      haptic.success();
      refresh();
      Alert.alert('Restored', 'Your data has been restored from the backup.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      haptic.error();
      Alert.alert('Restore failed', e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      // In `finally`, always: a restore that throws must still release the flag,
      // or recurring bills silently stop posting for the rest of the session.
      endRestore();
      setRestoring(false);
    }
  }

  const busy = creating || restoring;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Backup & restore" onBack={() => router.back()} />
      <View style={styles.content}>
        <View style={styles.card}>
          <IconCircle icon="shield" size={56} iconSize={20} color={colors.accent} bg={colors.accentMuted} style={styles.iconCircle} />
          <Text style={styles.note}>
            {serverSession
              ? 'Your transactions live on this device — signing in didn’t change that. What an account adds is somewhere to keep a backup. Nothing happens automatically: a backup is a snapshot you make, encrypted here first with a passphrase that never leaves this phone. Forget the passphrase and that backup cannot be opened by anyone, including us.'
              : 'Your data lives only on this device — nothing is uploaded. Make an encrypted backup and save it to Files, iCloud Drive or Google Drive. Nothing happens automatically, and the passphrase never leaves this phone — forget it and that backup cannot be opened by anyone.'}
          </Text>
          {lastBackupAt != null && (
            <Text style={styles.lastBackup}>Last backup: {dateTime(new Date(lastBackupAt))}</Text>
          )}
        </View>

        <View style={styles.settingsCard}>
          <SettingsRow
            icon="upload-cloud"
            label="Create backup"
            value={creating ? `Encrypting… ${kdfPct}%` : 'Encrypted file'}
            onPress={busy ? undefined : () => { setCreateTarget('file'); setShowCreateSheet(true); }}
            right={creating ? <ActivityIndicator size="small" color={colors.accent} /> : undefined}
          />
          <View style={settingsRowDivider} />
          <SettingsRow
            icon="download-cloud"
            label="Restore from backup"
            value={restoring ? undefined : 'Pick a file'}
            onPress={busy ? undefined : handlePickRestoreFile}
            right={restoring ? <ActivityIndicator size="small" color={colors.accent} /> : undefined}
          />
          {/* The same two actions, over the network instead of the share sheet.
              Only in a build with a server configured, and only once signed in —
              an account is what gives the blob somewhere to go. */}
          {serverSession ? (
            <>
              <View style={settingsRowDivider} />
              <SettingsRow
                icon="cloud"
                label="Back up to your account"
                value={busy ? undefined : serverSession.user.email}
                onPress={busy ? undefined : () => { setCreateTarget('server'); setShowCreateSheet(true); }}
              />
              <View style={settingsRowDivider} />
              <SettingsRow
                icon="rotate-ccw"
                label="Restore from your account"
                /*
                 * Names the signed-in account, like the row above it (F8).
                 *
                 * Email is the only identity here and there is no merge: a typo at
                 * sign-in is a second account with none of your backups. Someone
                 * staring at an empty restore list needs to see WHICH account they
                 * are looking at, because "my backups are gone" and "I am signed
                 * into the wrong address" look identical otherwise.
                 */
                value={busy ? undefined : serverSession.user.email}
                onPress={busy ? undefined : openServerList}
              />
            </>
          ) : serverConfigured ? (
            <>
              <View style={settingsRowDivider} />
              <SettingsRow
                icon="cloud"
                label="Back up off this phone"
                value="Sign in"
                onPress={() => router.push('/settings/account')}
              />
            </>
          ) : null}
        </View>

        <Text style={styles.warning}>Restoring replaces ALL current data on this device. This cannot be undone.</Text>
      </View>

      <PassphraseSheet
        visible={showCreateSheet}
        onClose={() => setShowCreateSheet(false)}
        mode="create"
        onSubmit={handleCreateBackup}
        extra={
          <TouchableOpacity
            style={styles.includeRow}
            onPress={() => { haptic.selection(); setIncludePhotos(v => !v); }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: includePhotos }}
            accessibilityLabel="Include receipt photos"
          >
            <Feather
              name={includePhotos ? 'check-square' : 'square'}
              size={18}
              color={includePhotos ? colors.accent : colors.textMuted}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.includeLabel}>Include receipt photos</Text>
              <Text style={styles.includeHint}>
                {includePhotos
                  ? 'Receipts and profile pictures are restored too. The file will be much larger.'
                  : 'Rows only — small file. Receipts will not come back on restore.'}
              </Text>
            </View>
          </TouchableOpacity>
        }
        submitting={creating}
      />
      <ServerBackupSheet
        visible={showServerList}
        onClose={() => { setShowServerList(false); setListError(null); }}
        backups={serverBackups}
        loading={listLoading}
        error={listError}
        onPick={handlePickServerBackup}
        onDelete={handleDeleteServerBackup}
        busyId={downloadingId}
      />
      <PassphraseSheet
        visible={showRestoreSheet}
        onClose={() => { setShowRestoreSheet(false); setPickedEnvelope(null); setRestoreError(null); }}
        mode="restore"
        onSubmit={handleRestoreSubmit}
        submitting={unlocking}
        progress={unlocking ? kdfPct : null}
        error={restoreError}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  includeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.smd, paddingVertical: space.smd, minHeight: layout.touchMin },
  includeLabel: { ...type.body, color: colors.textPrimary },
  includeHint: { ...type.caption, color: colors.textMuted, lineHeight: 16, marginTop: 2 },
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: layout.screenPaddingH, gap: space.lg },
  card: { alignItems: 'center', gap: space.sm, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.xl, ...shadow.sm },
  iconCircle: { marginBottom: space.xs },
  note: { ...type.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  lastBackup: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
  settingsCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  warning: { ...type.caption, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
});
