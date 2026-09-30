import { PAY_METHOD_LABEL, type PayMethod } from '../constants/enums';

/** The fields of an account a picker needs (`U-68`). */
export type AccountChoice = { id: string; name: string; kind: string; is_default: number };

/** A kind's accounts, when there is more than one to choose between; otherwise none. */
export function accountsToChoose(accounts: readonly AccountChoice[], kind: PayMethod): AccountChoice[] {
  const of = accounts.filter(a => a.kind === kind);
  return of.length > 1 ? of : [];
}

/** The account a row points at: the named one if it is of that kind, else the kind's default. */
export function chosenAccountId(accounts: readonly AccountChoice[], kind: PayMethod, accountId?: string | null): string | undefined {
  const of = accounts.filter(a => a.kind === kind);
  return of.find(a => a.id === accountId)?.id ?? of.find(a => a.is_default)?.id;
}

/**
 * What Paid from reads as: the kind ("Bank") while there is one account of it, exactly as before
 * accounts, and the account's own name once there are several to tell apart.
 */
export function paidFromLabel(accounts: readonly AccountChoice[], kind: PayMethod, accountId?: string | null): string {
  const several = accountsToChoose(accounts, kind);
  const id = chosenAccountId(accounts, kind, accountId);
  return several.find(a => a.id === id)?.name ?? PAY_METHOD_LABEL[kind];
}

/** The account a row points at, by name; the kind's label when it has none. */
export function accountName(accounts: readonly AccountChoice[], kind: PayMethod, accountId?: string | null): string {
  const id = chosenAccountId(accounts, kind, accountId);
  return accounts.find(a => a.id === id)?.name ?? PAY_METHOD_LABEL[kind];
}

/**
 * What a transaction row says about where its money came from (`DQ-18`): the account's name for
 * my own entries, the kind for someone else's (their accounts are not mine to name). Nothing for
 * "Other" or unset, which would only be noise on every row.
 */
export function rowPaidFrom(
  accounts: readonly AccountChoice[],
  t: { pay_method?: string | null; account_id?: string | null; author_person_id?: string | null },
): string | null {
  const kind = t.pay_method as PayMethod | null | undefined;
  if (!kind || !(kind in PAY_METHOD_LABEL) || kind === 'other') return null;
  return t.author_person_id ? PAY_METHOD_LABEL[kind] : accountName(accounts, kind, t.account_id);
}
