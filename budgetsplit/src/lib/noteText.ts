/**
 * A note as one clean line for a list row: trimmed, every run of whitespace (newlines included)
 * collapsed to one space. Empty or whitespace-only is `null`, so a row never shows a blank line.
 */
export function oneLine(note: string | null | undefined): string | null {
  const t = (note ?? '').replace(/\s+/g, ' ').trim();
  return t || null;
}

/**
 * A ledger row's two lines. A transfer's own sentence ("Aarav paid you") leads, and its note — which
 * used to vanish, because the sentence took the only slot it had — is the second line. Otherwise the
 * note leads and the category (or the asset move's line) sits under it; with no note, the category
 * or move line stands alone.
 */
export function rowText(input: {
  settlementTitle: string | null;
  note: string | null | undefined;
  settleLine: string | null;
  category: string;
}): { primary: string; secondary: string | null } {
  const note = oneLine(input.note);
  if (input.settlementTitle) return { primary: input.settlementTitle, secondary: note };
  if (note) return { primary: note, secondary: input.settleLine ?? input.category };
  return { primary: input.settleLine ?? input.category, secondary: null };
}
