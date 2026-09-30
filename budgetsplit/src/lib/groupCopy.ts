/**
 * The words for a group's three end states (`OV-11`), said once:
 * **Archive** — hidden, still yours, reversible · **Leave** — you are out, it continues ·
 * **Delete for everyone** — closed for all, history kept. Archive is never worded or tinted as
 * destructive: nothing is lost and one tap restores it.
 */
export const ARCHIVE_GROUP = {
  action: 'Archive group',
  title: (name: string) => `Archive ${name}?`,
  body: 'It moves to Archived, with everything in it kept. Restore it from there any time.',
  confirm: 'Archive',
} as const;
