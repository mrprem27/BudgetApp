/**
 * Counts preference writes that a screen's figures depend on (the budget target, the money
 * engine's settings). `readDataStamp` folds it in, so a screen that skipped its reload on focus
 * because the database had not changed still reloads when one of these did.
 */
let version = 0;
export const bumpPrefs = (): void => { version += 1; };
export const prefsVersion = (): number => version;
