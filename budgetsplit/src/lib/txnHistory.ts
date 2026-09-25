import { format } from 'date-fns';
import { formatRupees, formatRupeesShort } from './money';

/**
 * A transaction's History in words (SPEC-SERVER.md §6.4): "Aarav changed ₹400 →
 * ₹450 · 2 Sep". Pure — the server hands back every saved version as a whole
 * snapshot, and this compares each with the one before it.
 */

export type HistoryVersion = {
  version: number;
  editedAt: number;
  editedBy: string;
  editorName: string | null;
  snapshot: Record<string, unknown>;
};

export type HistoryLine = { id: string; action: 'created' | 'updated' | 'deleted'; text: string; at: number };

type Money = Array<{ person_id?: unknown; amount?: unknown }>;
const total = (list: unknown) => ((list ?? []) as Money).reduce((a, p) => a + (Number(p.amount) || 0), 0);
const shape = (list: unknown) => JSON.stringify(((list ?? []) as Money)
  .map(p => [String(p.person_id), Number(p.amount) || 0]).sort());
const day = (ms: unknown) => (typeof ms === 'number' ? format(new Date(ms), 'd MMM') : '—');

/** What changed between two versions, as short phrases. */
export function changesBetween(prev: Record<string, unknown>, next: Record<string, unknown>): string[] {
  const out: string[] = [];
  const a = total(prev.payers); const b = total(next.payers);
  if (a !== b) {
    // Whole rupees read better — unless the change is in the paise, when they'd
    // read "₹400 → ₹400".
    const same = formatRupeesShort(a) === formatRupeesShort(b);
    const fmt = same ? formatRupees : formatRupeesShort;
    out.push(`${fmt(a)} → ${fmt(b)}`);
  }
  else if (shape(prev.payers) !== shape(next.payers)) out.push('who paid');
  if (a === b && shape(prev.splits) !== shape(next.splits)) out.push('the split');
  if (prev.category !== next.category) out.push(`${String(prev.category ?? '—')} → ${String(next.category ?? '—')}`);
  if (day(prev.date) !== day(next.date)) out.push(`the date to ${day(next.date)}`);
  if ((prev.note ?? null) !== (next.note ?? null)) out.push('the note');
  if (JSON.stringify(prev.tags ?? []) !== JSON.stringify(next.tags ?? [])) out.push('the tags');
  if (JSON.stringify(prev.items ?? []) !== JSON.stringify(next.items ?? [])) out.push('the items');
  return out;
}

/** Newest first, the way the timeline reads. `myUserId` turns my own edits into "You". */
export function describeHistory(versions: HistoryVersion[], myUserId: string | null): HistoryLine[] {
  const sorted = [...versions].sort((x, y) => x.version - y.version);
  const lines = sorted.map((v, i): HistoryLine => {
    const who = v.editedBy === myUserId ? 'You' : (v.editorName?.trim() || 'Someone');
    const id = `v${v.version}`;
    if (v.snapshot.deleted_at != null) return { id, action: 'deleted', text: `${who} deleted it`, at: v.editedAt };
    if (i === 0) return { id, action: 'created', text: `${who} added it · ${formatRupeesShort(total(v.snapshot.payers))}`, at: v.editedAt };
    const changes = changesBetween(sorted[i - 1].snapshot, v.snapshot);
    return {
      id, action: 'updated', at: v.editedAt,
      text: changes.length ? `${who} changed ${changes.join(', ')}` : `${who} saved it again`,
    };
  });
  return lines.reverse();
}

export type ConflictField = { field: string; yours: string; theirs: string; differs: boolean };

/**
 * The fields a person compares to choose between two versions of one
 * transaction — the same ones History talks about — with the ones that differ
 * marked. Differing fields first would reorder the card between conflicts; a
 * fixed order is easier to read.
 */
export function conflictFields(yours: Record<string, unknown>, theirs: Record<string, unknown>): ConflictField[] {
  const f = (field: string, show: (s: Record<string, unknown>) => string): ConflictField => {
    const y = show(yours); const t = show(theirs);
    return { field, yours: y, theirs: t, differs: y !== t };
  };
  return [
    f('Amount', s => formatRupees(total(s.payers))),
    f('Category', s => String(s.category ?? '—')),
    f('Date', s => day(s.date)),
    f('Note', s => (typeof s.note === 'string' && s.note.trim() ? s.note : '—')),
    f('Split', s => shape(s.splits)),
  ].map(r => (r.field === 'Split' ? { ...r, yours: r.differs ? 'Different' : 'Same', theirs: r.differs ? 'Different' : 'Same' } : r));
}

/**
 * A refusal, in words (SPEC-SERVER.md §6.3): "This wasn't saved: you're no longer
 * in this group." The server writes its reasons for people, prefixed with the
 * table it was guarding; the prefix is not for them.
 */
export function refusalText(serverMessage: string): string {
  const reason = serverMessage.replace(/^[a-z_]+:\s*/, '').trim();
  if (!reason) return 'This change wasn’t saved, and it’s back to how it was.';
  return `This wasn’t saved: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}. It’s back to how it was.`;
}
