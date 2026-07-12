import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * Write a CSV string to a cache file and open the system share sheet. Shared by
 * the report export and the per-group export so the file/share IO lives in one
 * place. Returns the file uri and whether the share sheet actually opened (so the
 * caller can show a "saved to…" fallback when sharing is unavailable).
 */
export async function shareCsv(
  csv: string,
  fileName: string,
  dialogTitle: string,
): Promise<{ uri: string; shared: boolean }> {
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(csv);
  if (!(await Sharing.isAvailableAsync())) return { uri: file.uri, shared: false };
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle });
  return { uri: file.uri, shared: true };
}

/** A filesystem-safe slug for a group name, e.g. "Goa Trip" → "goa_trip". */
export function csvFileSlug(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'group';
}
