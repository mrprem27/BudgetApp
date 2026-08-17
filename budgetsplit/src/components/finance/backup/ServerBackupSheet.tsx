import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { colors, type, space } from '../../tokens';
import { SheetModal } from '../../ui/SheetModal';
import { ListRow } from '../../ui/ListRow';
import { Divider } from '../../ui/Divider';
import { EmptyState } from '../../ui/EmptyState';
import { formatBytes } from '../../../lib/storage';
import type { ServerBackup } from '../../../lib/serverApi';

type Props = {
  visible: boolean;
  onClose: () => void;
  backups: ServerBackup[];
  loading: boolean;
  error: string | null;
  /** Tapping a row: download it and hand it to the passphrase step. */
  onPick: (backup: ServerBackup) => void;
  onDelete: (backup: ServerBackup) => void;
  /** Id currently downloading, so the tapped row shows the spinner. */
  busyId: string | null;
};

/**
 * Picks which server-side snapshot to restore.
 *
 * Deliberately shows only what the server actually knows — when it was made and
 * how big it is. It cannot show a preview, a transaction count, or "made on your
 * iPhone", because the blob is encrypted before it leaves the phone and the
 * server never sees inside it.
 */
export function ServerBackupSheet({ visible, onClose, backups, loading, error, onPick, onDelete, busyId }: Props) {
  return (
    <SheetModal visible={visible} onClose={onClose} title="Restore from your account">
      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.loading} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : backups.length === 0 ? (
        <EmptyState
          icon="cloud-off"
          title="No backups yet"
          body="Back up to your account first, then it will show up here — on this phone or the next one."
        />
      ) : (
        <>
          {backups.map((backup, i) => (
            <View key={backup.id}>
              {i > 0 && <Divider indent="text" />}
              <ListRow
                icon="clock"
                title={format(new Date(backup.createdAt), 'd MMM yyyy, h:mm a')}
                subtitle={formatBytes(backup.sizeBytes)}
                onPress={busyId ? undefined : () => onPick(backup)}
                value={busyId === backup.id ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <TouchableOpacity
                    onPress={() => onDelete(backup)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete the backup from ${format(new Date(backup.createdAt), 'd MMM yyyy')}`}
                  >
                    <Feather name="trash-2" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
                chevron={false}
              />
            </View>
          ))}
          <Text style={styles.hint}>
            Tap a backup to restore it — you'll need the passphrase it was made with. The newest
            10 are kept; older ones fall off as new ones arrive.
          </Text>
        </>
      )}
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  loading: { marginVertical: space.xl },
  error: { ...type.body, color: colors.expense, textAlign: 'center', paddingVertical: space.md, lineHeight: 20 },
  hint: { ...type.caption, color: colors.textMuted, lineHeight: 18, paddingTop: space.md },
});
