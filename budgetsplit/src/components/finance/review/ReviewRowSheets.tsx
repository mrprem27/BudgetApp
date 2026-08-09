import React from 'react';
import { CategoryPicker } from '../CategoryPicker';
import { PayMethodSheet } from '../add/PayMethodSheet';
import { ReviewDestSheet } from './ReviewDestSheet';
import { CounterpartySheet } from './CounterpartySheet';
import type { Category } from '../../../db/queries/categories';
import type { Person } from '../../../db/queries/persons';
import type { PayMethod } from '../../../constants/enums';

type Group = { id: string; name: string };

type Props = {
  /** The row each sheet is editing, or null when that sheet is closed. */
  catRow: { category: string; kind: string } | null;
  categories: Category[];
  onCategory: (name: string) => void;
  onCloseCategory: () => void;

  destOpen: boolean;
  dest: string;
  groups: Group[];
  onDest: (dest: string) => void;
  onCloseDest: () => void;

  whoOpen: boolean;
  whoMembers: Person[];
  counterparty: string;
  inbound: boolean;
  onCounterparty: (personId: string) => void;
  onCloseWho: () => void;

  payOpen: boolean;
  payMethod: PayMethod | '';
  onPayMethod: (m: PayMethod) => void;
  onClearPay: () => void;
  onClosePay: () => void;
};

/**
 * The four per-row editors, mounted once for the whole list.
 *
 * One component rather than four blocks in the screen, because `review.tsx` has a line ceiling
 * (`sourceCounts.test.ts`) that is only ever lowered, and these are pure pass-through: every
 * one is a controlled overlay whose only job is to hand a value back.
 *
 * The category and pay-method sheets are the **same components the Add screen uses**, which is
 * what stops Review growing its own divergent pickers — it had exactly that before, with a
 * second pay-method list of its own.
 */
export function ReviewRowSheets({
  catRow, categories, onCategory, onCloseCategory,
  destOpen, dest, groups, onDest, onCloseDest,
  whoOpen, whoMembers, counterparty, inbound, onCounterparty, onCloseWho,
  payOpen, payMethod, onPayMethod, onClearPay, onClosePay,
}: Props) {
  return (
    <>
      {catRow && (
        <CategoryPicker
          categories={categories}
          value={categories.find(c => c.name === catRow.category) ?? null}
          forceOpen
          hideTrigger
          onClose={onCloseCategory}
          onChange={(c) => onCategory(c.name)}
        />
      )}

      <ReviewDestSheet
        visible={destOpen}
        onClose={onCloseDest}
        groups={groups}
        dest={dest}
        onSelect={onDest}
      />

      <CounterpartySheet
        visible={whoOpen}
        onClose={onCloseWho}
        members={whoMembers}
        counterparty={counterparty}
        inbound={inbound}
        onSelect={onCounterparty}
      />

      <PayMethodSheet
        visible={payOpen}
        onClose={onClosePay}
        value={payMethod}
        onChange={onPayMethod}
        onClear={onClearPay}
      />
    </>
  );
}
