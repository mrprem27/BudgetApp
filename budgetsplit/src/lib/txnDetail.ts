import type { TxnWithSplits, LineItem } from '../db/queries/transactions';
import type { Person } from '../db/queries/persons';
import type { AuditLog } from '../db/queries/audit';

/** Everything the transaction-detail screen loads in one pass. */
export type TxnDetailData = {
  txn: TxnWithSplits | null;
  members: Person[];
  me: Person | null;
  groupName: string;
  isPersonal: boolean;
  history: AuditLog[];
  items: LineItem[];
  parentRule: TxnWithSplits | null;
};
