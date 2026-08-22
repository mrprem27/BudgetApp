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
  BackupWrongPassphraseError, type BackupEnvelope, type BackupPayload,
} from '../../src/lib/backup';
import { readAllTables, restoreAllTables, readPhotoFiles, restorePhotoFiles } from '../../src/db/queries/backup';
import { ServerBackupSheet } from '../../src/components/finance/backup/ServerBackupSheet';
import { useServerSession } from '../../src/hooks/useServerSession';
import { formatBytes } from '../../src/lib/storage';
import {
  uploadBackup, listServerBackups, downloadServerBackup, deleteServerBackup,
  type ServerBackup,
} from '../../src/lib/serverApi';

export default function BackupScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { refresh } = useDataRefresh();

  const { session: serverSession, configured: serverConfigured } = useServerSession();

  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
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
    setCreating(true);
    try {
      const tables = await readAllTables(db);
      // Opt-in. Receipt photos dwarf the rows — a few hundred transactions is
      // tens of KB, one receipt can be a megabyte — so this is the user's call
      // rather than a default that quietly makes every backup unshareable.
      const photos = includePhotos ? await readPhotoFiles(tables) : undefined;
      const payload = buildBackupPayload(tables, photos);
      const envelope = encryptPayload(payload, passphrase);

      if (createTarget === 'server') {
        // Uploaded already-encrypted: the server stores the same bytes this
        // device would have written to a file, and can't read either.
        const saved = await uploadBackup(JSON.stringify(envelope));
        Alert.alert(
          'Backed up to your account',
          `${formatBytes(saved.sizeBytes)}, encrypted on this phone. You'll need this passphrase to restore it — it was never sent.`,
        );
      } else {
        const file = new File(Paths.cache, backupFileName());
        file.create({ overwrite: true });
        file.write(JSON.stringify(envelope));
        if (!(await Sharing.isAvailableAsync())) {
          Alert.alert('Saved', `Sharing isn’t available here. The backup was saved to:\n${file.uri}`);
        } else {
          await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save backup' });
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

  async function handlePickRestoreFile() {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;

      const text = await new File(res.assets[0].uri).text();
      let envelope: BackupEnvelope;
      try {
        const json = JSON.parse(text) as Partial<BackupEnvelope>;
        if (typeof json.ciphertext !== 'string') throw new Error('missing ciphertext');
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
    setUnlocking(true);
    try {
      const payload = decryptEnvelope(pickedEnvelope, passphrase);
      setShowRestoreSheet(false);
      setPickedEnvelope(null);
      setRestoreError(null);
      confirmRestore(payload);
    } catch (e) {
      if (e instanceof BackupWrongPassphraseError) {
        setRestoreError(e.message);
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

  function confirmRestore(payload: BackupPayload) {
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
    try {
      // Photos first: the tables come back with every photo URI repointed at this
      // install's directories, or nulled where the backup did not carry the file.
      // Restoring the rows verbatim is what left every restore showing "Receipt
      // attached" over a path that no longer exists.
      const tables = await restorePhotoFiles(payload.tables, payload.photos);
      await restoreAllTables(db, tables);
      // Both: a real export is genuinely the new reminder anchor *and* the
      // moment a backup exists.
      await settings.setBackupAnchorAt(Date.now());
      await settings.setLastBackupAt(Date.now());
      setLastBackupAt(Date.now());
      haptic.success();
      refresh();
      Alert.alert('Restored', 'Your data has been restored from the backup.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      haptic.error();
      Alert.alert('Restore failed', e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
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
            value={creating ? undefined : 'Encrypted file'}
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
                value={busy ? undefined : 'Pick a backup'}
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
