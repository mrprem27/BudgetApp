import React from 'react';
import { AddKind } from '../../../constants/enums';
import { SplitSheet } from './SplitSheet';
import { PayersSheet } from './PayersSheet';
import { TransferSlotSheet } from './TransferSlotSheet';
import { DestinationSheet } from './DestinationSheet';
import { ScopeSheet } from './ScopeSheet';
import { PayMethodSheet } from './PayMethodSheet';
import { RecurringSheet } from './RecurringSheet';
import { NoteSheet } from './NoteSheet';
import { TagSheet } from './TagSheet';
import { AmountCalculatorSheet } from './AmountCalculatorSheet';
import { VoiceEntrySheet } from './VoiceEntrySheet';
import { DatePickerSheet } from '../../ui/DatePickerSheet';
import { TimePickerSheet } from '../../ui/TimePickerSheet';
import { UpiUriSheet } from '../UpiUriSheet';
import { RequestQrSheet } from '../RequestQrSheet';
import type { useAddTxnForm } from '../../../hooks/useAddTxnForm';

/** Which overlay is open. One at a time — they're all modal. */
export type QuickAddSheet =
  | 'split' | 'payers' | 'date' | 'endDate' | 'destination'
  | 'payMethod' | 'recurring' | 'note' | 'scope' | 'tags' | 'time' | 'calc' | 'voice'
  | 'upiUri' | 'requestQr' | null;

type Form = ReturnType<typeof useAddTxnForm>;

type Props = {
  form: Form;
  open: QuickAddSheet;
  /** Switch to another overlay (or `null` to close). One is open at a time. */
  onOpen: (sheet: QuickAddSheet) => void;
  onClose: () => void;
  /** Transfer from/to picker — a separate slot because it carries which end. */
  transferSlot: 'from' | 'to' | null;
  onCloseTransferSlot: () => void;
  /** Kind colour, so a sheet's selected state matches the form behind it. */
  accent: string;
  /** Tag vocabulary from existing transactions (`getTagsByFrequency`). */
  tagSuggestions: string[];
};

/**
 * Every overlay the Add screen can open, in one place.
 *
 * These were nine sheet elements declared inline at the bottom of `quick.tsx`,
 * each with its own visibility `useState`. Hoisting them out keeps the screen a
 * readable top-to-bottom description of the form, and collapses nine booleans into
 * one `open` value — which also makes it structurally impossible to have two
 * sheets open at once.
 */
export function QuickAddSheets({
  form: f, open, onOpen, onClose, transferSlot, onCloseTransferSlot, accent, tagSuggestions,
}: Props) {
  return (
    <>
      <DestinationSheet
        visible={open === 'destination'}
        onClose={onClose}
        groups={f.pickerGroups}
        selectedId={f.selectedGroupId}
        onSelect={f.selectGroup}
        accent={accent}
      />

      <ScopeSheet
        visible={open === 'scope'}
        onClose={onClose}
        scopes={f.transferScopes}
        scope={f.transferScope}
        onSelect={f.setTransferScope}
        accent={accent}
      />

      <SplitSheet
        visible={open === 'split'}
        onClose={onClose}
        members={f.members}
        splitMembers={f.splitMembers}
        setSplitMembers={f.setSplitMembers}
        splitType={f.splitType}
        setSplitType={f.setSplitType}
        exactAmounts={f.exactAmounts}
        setExactAmounts={f.setExactAmounts}
        percentages={f.percentages}
        setPercentages={f.setPercentages}
        ratios={f.ratios}
        setRatios={f.setRatios}
        total={f.total}
        remainder={f.remainder}
      />

      <PayersSheet
        visible={open === 'payers'}
        onClose={onClose}
        members={f.members}
        me={f.me}
        payerAmounts={f.payerAmounts}
        setPayerAmounts={f.setPayerAmounts}
        total={f.total}
        paymentRemainder={f.paymentRemainder}
      />

      <PayMethodSheet
        visible={open === 'payMethod'}
        onClose={onClose}
        value={f.payMethod}
        onChange={f.setPayMethod}
        accent={accent}
        kind={f.kind}
      />

      {/* A transfer's note is a different field, and not a cosmetic one: it is what
          `handleSaveTransfer` persists AND what goes into the UPI payload. Wiring
          this sheet to `f.note` for every kind would have let the Transfer note chip
          edit and save the expense note instead. */}
      <NoteSheet
        visible={open === 'note'}
        onClose={onClose}
        value={f.kind === AddKind.Transfer ? f.transferNote : f.note}
        onChangeText={f.kind === AddKind.Transfer ? f.setTransferNote : f.setNote}
      />

      <VoiceEntrySheet
        visible={open === 'voice'}
        onClose={onClose}
        categories={f.categories}
        learned={f.learned}
        onApply={f.applyVoiceDraft}
        accent={accent}
        kind={f.kind}
        people={f.allPersons}
      />

      <AmountCalculatorSheet
        visible={open === 'calc'}
        onClose={onClose}
        amountText={f.amountText}
        onApply={f.setAmountText}
        accent={accent}
      />

      <TagSheet
        visible={open === 'tags'}
        onClose={onClose}
        value={f.tags}
        onChange={f.setTags}
        suggestions={tagSuggestions}
        accent={accent}
      />

      <RecurringSheet
        visible={open === 'recurring'}
        onClose={onClose}
        enabled={f.recurEnabled} setEnabled={f.setRecurEnabled}
        freq={f.recurFreq} setFreq={f.setRecurFreq}
        interval={f.recurInterval} setInterval={f.setRecurInterval}
        endMode={f.recurEndMode} setEndMode={f.setRecurEndMode}
        endMs={f.recurEndMs} setEndMs={f.setRecurEndMs}
        count={f.recurCount} setCount={f.setRecurCount}
        txnDate={f.txnDate}
        // Swap sheets rather than stacking them: both are RN <Modal>s, and nesting
        // one inside another breaks keyboard handling (see SheetModal's own note).
        // Closing the date picker returns here, so it reads as one flow.
        onPickEndDate={() => onOpen('endDate')}
      />

      <TimePickerSheet
        visible={open === 'time'}
        value={{ hour: new Date(f.txnDate).getHours(), minute: new Date(f.txnDate).getMinutes() }}
        title="What time?"
        onClose={onClose}
        onSave={({ hour, minute }) => { f.setTxnTime(hour, minute); onClose(); }}
      />

      <DatePickerSheet
        visible={open === 'date'}
        value={f.txnDate}
        onClose={onClose}
        onChange={f.setTxnDate}
      />
      <DatePickerSheet
        visible={open === 'endDate'}
        value={f.recurEndMs ?? (f.txnDate + 30 * 24 * 60 * 60 * 1000)}
        onClose={() => onOpen('recurring')}
        onChange={f.setRecurEndMs}
      />

      <TransferSlotSheet
        slot={transferSlot}
        persons={f.allPersons}
        me={f.me}
        fromId={f.transferFromId}
        toId={f.transferToId}
        personNet={f.personNet}
        onClose={onCloseTransferSlot}
        onPick={(pid) => {
          if (transferSlot === 'from') {
            if (pid === f.transferToId) f.setTransferToId(f.transferFromId);
            f.setTransferFromId(pid);
          } else if (transferSlot === 'to') {
            if (pid === f.transferFromId) f.setTransferFromId(f.transferToId);
            f.setTransferToId(pid);
          }
          onCloseTransferSlot();
        }}
      />

      {/* Moved out of TransferBody, which used to mount these from its own local
          state — breaking the one-overlay-at-a-time invariant this file exists
          to enforce. No `opts`: settling up has no code to scan, which is what
          decides where a blocked app lands. Passing nothing here is the same
          as what `pay` passes. */}
      <UpiUriSheet
        visible={open === 'upiUri'}
        onClose={onClose}
        request={f.transferPayee}
        apps={f.transferHandoff.apps}
      />

      <RequestQrSheet
        visible={open === 'requestQr'}
        onClose={onClose}
        vpa={f.me?.upi_vpa ?? null}
        name={f.me?.name}
        amountPaise={f.total}
        payerName={f.transferFrom && f.transferFrom.id !== f.me?.id ? f.transferFrom.name.split(' ')[0] : undefined}
      />
    </>
  );
}
