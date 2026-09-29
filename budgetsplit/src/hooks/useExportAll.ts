import { useState } from 'react';
import { Alert } from 'react-native';
import type * as SQLite from 'expo-sqlite';
import { exportAllGroups } from '../lib/settingsData';
import { shareCsv } from '../lib/shareCsv';
import { haptic } from '../lib/haptics';

/** "Export all data" as CSV: one call, one in-flight guard, every outcome told to the user. */
export function useExportAll(db: SQLite.SQLiteDatabase) {
  const [exporting, setExporting] = useState(false);

  async function exportAll() {
    if (exporting) return;
    setExporting(true);
    haptic.light();
    try {
      const { csv, rowCount } = await exportAllGroups(db);
      if (rowCount === 0) { Alert.alert('Nothing to export', 'There are no transactions yet.'); return; }
      const { uri, shared } = await shareCsv(csv, 'budgetsplit_all.csv', 'Export all data');
      if (!shared) Alert.alert('Saved', `Sharing isn't available here. The CSV was saved to:\n${uri}`);
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  return { exporting, exportAll };
}
