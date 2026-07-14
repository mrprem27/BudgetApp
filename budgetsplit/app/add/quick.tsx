import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Keyboard, KeyboardAvoidingView, Platform } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../src/constants/colors';
import { type } from '../../src/constants/typography';
import { space, radius, layout } from '../../src/constants/layout';
import { formatRupees } from '../../src/lib/money';
import { insertCategory } from '../../src/db/queries/categories';
import { useAddTxnForm } from '../../src/hooks/useAddTxnForm';
import { ModalHeader } from '../../src/components/ui/ModalHeader';
import { MoreOptions } from '../../src/components/ui/MoreOptions';
import { CategoryPicker } from '../../src/components/finance/CategoryPicker';
import { DatePickerSheet } from '../../src/components/ui/DatePickerSheet';
import { GroupSelector } from '../../src/components/finance/GroupSelector';
import { TransferBody } from '../../src/components/finance/TransferBody';
import { PayMethodSelector } from '../../src/components/finance/PayMethodSelector';
import { KindToggle } from '../../src/components/finance/add/KindToggle';
import { AmountField } from '../../src/components/finance/add/AmountField';
import { CategoryDatePills } from '../../src/components/finance/add/CategoryDatePills';
import { NoteField } from '../../src/components/finance/add/NoteField';
import { BudgetNudge } from '../../src/components/finance/add/BudgetNudge';
import { AttachmentRow } from '../../src/components/finance/add/AttachmentRow';
import { LocationRow } from '../../src/components/finance/add/LocationRow';
import { SplitSummary } from '../../src/components/finance/add/SplitSummary';
import { SplitSheet } from '../../src/components/finance/add/SplitSheet';
import { RecurringControls } from '../../src/components/finance/add/RecurringControls';
import { PayersSheet } from '../../src/components/finance/add/PayersSheet';
import { TransferSlotSheet } from '../../src/components/finance/add/TransferSlotSheet';

export default function QuickAddScreen() {
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ groupId?: string; kind?: string; editId?: string; recurEditId?: string; from?: string; to?: string; amount?: string; note?: string; date?: string; category?: string }>();
  const f = useAddTxnForm(params);

  // Sheet/picker visibility — pure UI state, kept in the screen.
  const [showSplit, setShowSplit] = useState(false);
  const [showPayers, setShowPayers] = useState(false);
  const [showDate, setShowDate] = useState(false);
  const [showEndDate, setShowEndDate] = useState(false);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [transferSlot, setTransferSlot] = useState<'from' | 'to' | null>(null);

  const { kind, flags, isEditing, isRecurEdit } = f;
  const nudgeColor = f.nudgePct == null ? null : f.nudgePct > 0.2 ? colors.income : f.nudgePct > 0 ? colors.healthAmber : colors.expense;

  const title = isRecurEdit ? 'Edit recurring'
    : isEditing ? (kind === 'income' ? 'Edit income' : kind === 'transfer' ? 'Edit settlement' : 'Edit expense')
    : (kind === 'income' ? 'Add income' : kind === 'transfer' ? 'Settle up' : 'Add expense');

  return (
    <View style={styles.container}>
      <ModalHeader
        title={title}
        onClose={() => router.back()}
        right={
          <TouchableOpacity onPress={f.handleSave} disabled={!f.canSave || f.saving} hitSlop={10} accessibilityRole="button" accessibilityLabel="Save">
            <Feather name="check" size={24} color={(!f.canSave || f.saving) ? colors.textMuted : colors.accent} />
          </TouchableOpacity>
        }
      />

      {!isEditing && !isRecurEdit && (
        <KindToggle kind={kind} onSelect={f.onSelectKind} />
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">

          <AmountField amountText={f.amountText} onChangeText={f.setAmountText} kind={kind} autoFocus={!isEditing} transferScopeBal={f.transferScopeBal} />

          <CategoryDatePills
            kind={kind}
            selectedCategory={f.selectedCategory}
            onCategory={() => { Keyboard.dismiss(); setShowCatPicker(true); }}
            txnDate={f.txnDate}
            onDate={() => { Keyboard.dismiss(); setShowDate(true); }}
          />

          <CategoryPicker
            categories={f.categories}
            value={f.selectedCategory}
            hideTrigger
            forceOpen={showCatPicker}
            onClose={() => setShowCatPicker(false)}
            onChange={(c) => {
              f.setSelectedCategory(c);
              f.setCatManual(true);
              setShowCatPicker(false);
              f.recordCategoryChoice(c.name);
            }}
            onCreate={async (name) => {
              const created = await insertCategory(db, name, 'tag', colors.accent, kind === 'income' ? 'income' : kind === 'transfer' ? 'transfer' : 'expense');
              f.setCategories(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
              return created;
            }}
          />

          {kind === 'transfer' && (
            <TransferBody
              me={f.me}
              persons={f.allPersons}
              fromId={f.transferFromId}
              toId={f.transferToId}
              onPickSlot={(slot) => { Keyboard.dismiss(); setTransferSlot(slot); }}
              onSwap={() => { f.setTransferFromId(f.transferToId); f.setTransferToId(f.transferFromId); }}
              scopes={f.transferScopes}
              scope={f.transferScope}
              onScope={f.setTransferScope}
              payMethod={f.payMethod}
              onPayMethod={f.setPayMethod}
              note={f.transferNote}
              onNote={f.setTransferNote}
            />
          )}

          {kind !== 'transfer' && (
            <>
              {kind === 'expense' && f.groups.length > 1 && (
                <GroupSelector
                  groups={f.groups}
                  selectedId={f.selectedGroupId}
                  onSelect={async (gid) => { Keyboard.dismiss(); await f.selectGroup(gid); }}
                  label="In"
                />
              )}

              {/* Top field: Title (drives category) when smart-category is on, else the Note. */}
              <NoteField
                value={flags.smartCategory ? f.title : f.note}
                onChangeText={flags.smartCategory ? f.onTitleChange : f.setNote}
                placeholder={flags.smartCategory
                  ? (kind === 'income' ? 'e.g. Salary, Freelance, Dividend' : 'e.g. Uber, Groceries, Netflix')
                  : (kind === 'income' ? 'Source (optional)' : 'Note (optional)')}
                maxLength={80}
                accessibilityLabel={flags.smartCategory ? 'Title' : 'Note'}
              />

              {kind === 'expense' && nudgeColor != null && f.nudgeRemaining != null && f.selectedCategory && (
                <BudgetNudge color={nudgeColor} remaining={f.nudgeRemaining} categoryName={f.selectedCategory.name} />
              )}

              <MoreOptions hint="Split · Attach" forceOpen={isEditing}>
                {flags.smartCategory && (
                  <NoteField value={f.note} onChangeText={f.setNote} placeholder="Note (optional)" maxLength={120} accessibilityLabel="Note" />
                )}

                {!isEditing && kind !== 'income' && (
                  <TouchableOpacity
                    style={styles.byItemsRow}
                    onPress={() => router.push(`/add/itemized${f.selectedGroupId ? `?groupId=${f.selectedGroupId}` : ''}` as any)}
                    accessibilityRole="button"
                    accessibilityLabel="Split by items"
                  >
                    <Feather name="list" size={16} color={colors.accent} />
                    <Text style={styles.byItemsText}>Split by items</Text>
                    <Feather name="chevron-right" size={16} color={colors.textMuted} style={{ marginLeft: 'auto' }} />
                  </TouchableOpacity>
                )}

                <AttachmentRow attachmentUri={f.attachmentUri} onChange={f.setAttachmentUri} onOpenStorageSettings={() => router.push('/storage' as any)} />

                {f.locEnabled && !isEditing && (
                  <LocationRow place={f.place} capturing={f.capturingLoc} onRecapture={f.captureLocation} onClear={() => f.setPlace(null)} />
                )}

                {/* How was it paid? — expense & income (transfer has its own selector). */}
                <View style={styles.payBlock}>
                  <Text style={styles.payBlockLabel}>HOW WAS IT PAID?</Text>
                  <PayMethodSelector value={f.payMethod} onChange={f.setPayMethod} accent={kind === 'income' ? colors.income : colors.accent} />
                </View>

                {!isEditing && flags.recurring && (
                  <RecurringControls
                    enabled={f.recurEnabled} setEnabled={f.setRecurEnabled}
                    freq={f.recurFreq} setFreq={f.setRecurFreq}
                    interval={f.recurInterval} setInterval={f.setRecurInterval}
                    endMode={f.recurEndMode} setEndMode={f.setRecurEndMode}
                    endMs={f.recurEndMs} setEndMs={f.setRecurEndMs}
                    count={f.recurCount} setCount={f.setRecurCount}
                    txnDate={f.txnDate}
                    onPickEndDate={() => setShowEndDate(true)}
                  />
                )}
              </MoreOptions>

              {kind === 'expense' && f.members.length > 1 && f.total > 0 && (
                <SplitSummary
                  members={f.members}
                  splitMembers={f.splitMembers}
                  splitType={f.splitType}
                  total={f.total}
                  payments={f.payments}
                  meId={f.me?.id}
                  onOpenSplit={() => { Keyboard.dismiss(); setShowSplit(true); }}
                  onOpenPayers={() => { Keyboard.dismiss(); setShowPayers(true); }}
                />
              )}

              {kind === 'expense' && f.total > 0 && (f.paymentRemainder !== 0 || f.remainder !== 0) && (
                <Text style={styles.remainderWarning}>
                  {f.paymentRemainder !== 0
                    ? f.paymentRemainder > 0 ? `${formatRupees(f.paymentRemainder)} left to assign payers` : `${formatRupees(-f.paymentRemainder)} over-assigned to payers`
                    : f.remainder > 0 ? `${formatRupees(f.remainder)} unassigned` : `${formatRupees(-f.remainder)} over-assigned`}
                </Text>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <SplitSheet
        visible={showSplit}
        onClose={() => setShowSplit(false)}
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

      <DatePickerSheet visible={showDate} value={f.txnDate} onClose={() => setShowDate(false)} onChange={f.setTxnDate} />
      <DatePickerSheet
        visible={showEndDate}
        value={f.recurEndMs ?? (f.txnDate + 30 * 24 * 60 * 60 * 1000)}
        onClose={() => setShowEndDate(false)}
        onChange={f.setRecurEndMs}
      />

      <TransferSlotSheet
        slot={transferSlot}
        persons={f.allPersons}
        me={f.me}
        fromId={f.transferFromId}
        toId={f.transferToId}
        personNet={f.personNet}
        onClose={() => setTransferSlot(null)}
        onPick={(pid) => {
          if (transferSlot === 'from') {
            if (pid === f.transferToId) f.setTransferToId(f.transferFromId);
            f.setTransferFromId(pid);
          } else if (transferSlot === 'to') {
            if (pid === f.transferFromId) f.setTransferFromId(f.transferToId);
            f.setTransferToId(pid);
          }
          setTransferSlot(null);
        }}
      />

      <PayersSheet
        visible={showPayers}
        onClose={() => setShowPayers(false)}
        members={f.members}
        me={f.me}
        payerAmounts={f.payerAmounts}
        setPayerAmounts={f.setPayerAmounts}
        total={f.total}
        paymentRemainder={f.paymentRemainder}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.md },
  byItemsRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard },
  byItemsText: { ...type.body, color: colors.textPrimary },
  payBlock: { gap: space.xs },
  payBlockLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Inter_600SemiBold' },
  remainderWarning: { ...type.label, color: colors.expense, textAlign: 'center' },
});
