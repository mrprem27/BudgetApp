import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Keyboard, KeyboardAvoidingView, Platform } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, layout } from '../../src/theme';
import { formatRupees, formatCompact } from '../../src/lib/money';
import { kindAccent } from '../../src/lib/kindTheme';
import { ADD_KIND, ADD_KIND_LABEL, SPLIT_MODE_LABEL } from '../../src/constants/enums';
import { asFeather } from '../../src/constants/palette';
import { insertCategory } from '../../src/db/queries/categories';
import { getTagsByFrequency } from '../../src/db/queries/transactions';
import { useAddTxnForm } from '../../src/hooks/useAddTxnForm';
import { Screen } from '../../src/components/ui/Screen';
import { ModalHeader } from '../../src/components/ui/ModalHeader';
import { TabPills } from '../../src/components/ui/TabPills';
import { CategoryPicker } from '../../src/components/finance/CategoryPicker';
import { TransferBody } from '../../src/components/finance/TransferBody';
import { AmountField } from '../../src/components/finance/add/AmountField';
import { CategoryDatePills } from '../../src/components/finance/add/CategoryDatePills';
import { Input } from '../../src/components/ui/Input';
import { BudgetNudge } from '../../src/components/finance/add/BudgetNudge';
import { ContextPill } from '../../src/components/finance/add/ContextPill';
import { DetailChips } from '../../src/components/finance/add/DetailChips';
import { SplitSummary } from '../../src/components/finance/add/SplitSummary';
import { QuickAddSheets, type QuickAddSheet } from '../../src/components/finance/add/QuickAddSheets';
import { useAttachmentPicker } from '../../src/hooks/useAttachmentPicker';

const KIND_TABS = ADD_KIND.map(k => ({ key: k, label: ADD_KIND_LABEL[k] }));

export default function QuickAddScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ groupId?: string; kind?: string; editId?: string; recurEditId?: string; from?: string; to?: string; amount?: string; note?: string; date?: string; category?: string }>();
  const f = useAddTxnForm(params);

  // One overlay at a time — see QuickAddSheets.
  const [sheet, setSheet] = useState<QuickAddSheet>(null);
  const [transferSlot, setTransferSlot] = useState<'from' | 'to' | null>(null);
  const [showCatPicker, setShowCatPicker] = useState(false);
  // The tag vocabulary is derived from existing transactions, so it's read once per mount
  // rather than kept in the form hook — nothing here writes to it mid-edit.
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  useEffect(() => { getTagsByFrequency(db).then(setTagSuggestions).catch(() => {}); }, [db]);

  const { kind, flags, isEditing, isRecurEdit } = f;
  const accent = kindAccent(kind);
  const nudgeColor = f.nudgePct == null ? null : f.nudgePct > 0.2 ? colors.income : f.nudgePct > 0 ? colors.healthAmber : colors.expense;

  const open = (s: QuickAddSheet) => { Keyboard.dismiss(); setSheet(s); };
  const pickReceipt = useAttachmentPicker({
    onPicked: f.setAttachmentUri,
    onOpenStorageSettings: () => router.push('/storage'),
  });

  const title = isRecurEdit ? 'Edit recurring'
    : isEditing ? (kind === 'income' ? 'Edit income' : kind === 'transfer' ? 'Edit settlement' : 'Edit expense')
    : (kind === 'income' ? 'Add income' : kind === 'transfer' ? 'Settle up' : 'Add expense');

  // Transfer is hidden when splitting is off — a settlement needs someone to settle
  // with — but stays visible while editing one, or the pill would vanish from a row
  // that already is a transfer.
  const tabs = flags.splitting || kind === 'transfer'
    ? KIND_TABS
    : KIND_TABS.filter(t => t.key !== 'transfer');

  return (
    <Screen
      header={
        <ModalHeader
          title={title}
          onClose={() => router.back()}
          right={
            /* Save lives top-right, next to ✕ — the two ends of the same bar mean
               "leave without saving" and "save". A footer button reads as a page
               CTA and pushes the form up; this is a modal, not a page.
               Note this is a deliberate exception to AGENTS §5's PrimaryButton
               rule, which §5 now records. */
            <TouchableOpacity
              onPress={f.handleSave}
              disabled={!f.canSave || f.saving}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Save"
              accessibilityState={{ disabled: !f.canSave || f.saving }}
            >
              <Text style={[styles.save, { color: !f.canSave || f.saving ? colors.textMuted : accent }]}>
                Save
              </Text>
            </TouchableOpacity>
          }
        />
      }
    >
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {!isEditing && !isRecurEdit && (
            <TabPills
              tabs={tabs}
              active={kind}
              onChange={(k) => f.onSelectKind(k as typeof kind)}
              activeColor={accent}
              size="lg"
            />
          )}

          {/* One context pill for both kinds — an expense's destination and a
              settlement's scope answer the same question ("what is this about?") and
              belong in the same place. Transfer used to ask it again further down the
              form with its own chip row. */}
          {kind === 'expense' && (
            <ContextPill
              icon={asFeather(f.selectedGroup?.icon, 'layers')}
              label={f.selectedGroup?.name ?? 'Personal'}
              detail={
                f.members.length > 1
                  ? `${f.members.length} people · ${SPLIT_MODE_LABEL[f.selectedGroup?.default_split ?? 'equal'].toLowerCase()}`
                  : 'just you'
              }
              tint={f.selectedGroup?.color ?? accent}
              onPress={() => open('destination')}
              accessibilityLabel={`Goes to ${f.selectedGroup?.name ?? 'Personal'}. Change`}
            />
          )}

          {kind === 'transfer' && (f.transferScopes?.groups.length ?? 0) > 0 && (
            <ContextPill
              icon={f.transferScope === 'all' ? 'layers' : 'users'}
              label={f.transferScope === 'all'
                ? 'All groups'
                : f.transferScopes?.groups.find(g => g.groupId === f.transferScope)?.name ?? 'Group'}
              detail={formatCompact(
                (f.transferScope === 'all'
                  ? f.transferScopes?.all?.amount
                  : f.transferScopes?.groups.find(g => g.groupId === f.transferScope)?.amount) ?? 0,
              )}
              tint={accent}
              onPress={() => open('scope')}
              accessibilityLabel="Choose what you're settling"
            />
          )}

          <AmountField amountText={f.amountText} onChangeText={f.setAmountText} kind={kind} autoFocus={!isEditing} transferScopeBal={f.transferScopeBal} onOpenCalculator={() => open('calc')} />

          <CategoryDatePills
            kind={kind}
            accent={accent}
            selectedCategory={f.selectedCategory}
            onCategory={() => { Keyboard.dismiss(); setShowCatPicker(true); }}
            txnDate={f.txnDate}
            onDate={() => open('date')}
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
              payMethod={f.payMethod}
              onPayMethod={f.setPayMethod}
              note={f.transferNote}
              onNote={f.setTransferNote}
              amountPaise={f.total}
            />
          )}

          {kind !== 'transfer' && (
            <>
              {/* Top field: Title (drives category) when smart-category is on, else the
                  Note. `ui/Input` rather than a bespoke card input, so this field and the
                  Note sheet share one surface — they used to be `bgCard` here and
                  `bgInput` there, two looks for one value — and so it gets a focus ring. */}
              <Input
                value={flags.smartCategory ? f.title : f.note}
                onChangeText={flags.smartCategory ? f.onTitleChange : f.setNote}
                icon="edit-3"
                placeholder={flags.smartCategory
                  ? (kind === 'income' ? 'e.g. Salary, Freelance, Dividend' : 'e.g. Uber, Groceries, Netflix')
                  : (kind === 'income' ? 'Source (optional)' : 'Note (optional)')}
                maxLength={80}
                autoCapitalize="sentences"
                accessibilityLabel={flags.smartCategory ? 'Title' : 'Note'}
              />

              {kind === 'expense' && nudgeColor != null && f.nudgeRemaining != null && f.selectedCategory && (
                <BudgetNudge color={nudgeColor} remaining={f.nudgeRemaining} categoryName={f.selectedCategory.name} afford={f.affordResult} />
              )}

              {/* Split is core to a shared expense, so it sits above the optional
                  details — it used to render below the "More options" accordion,
                  which pushed it off-screen the moment that was expanded. */}
              {kind === 'expense' && f.members.length > 1 && f.total > 0 && (
                <SplitSummary
                  members={f.members}
                  splitMembers={f.splitMembers}
                  splitType={f.splitType}
                  total={f.total}
                  payments={f.payments}
                  meId={f.me?.id}
                  accent={accent}
                  onOpenSplit={() => open('split')}
                  onOpenPayers={() => open('payers')}
                />
              )}

              {kind === 'expense' && f.total > 0 && (f.paymentRemainder !== 0 || f.remainder !== 0) && (
                <Text style={styles.remainderWarning}>
                  {f.paymentRemainder !== 0
                    ? f.paymentRemainder > 0 ? `${formatRupees(f.paymentRemainder)} left to assign payers` : `${formatRupees(-f.paymentRemainder)} over-assigned to payers`
                    : f.remainder > 0 ? `${formatRupees(f.remainder)} unassigned` : `${formatRupees(-f.remainder)} over-assigned`}
                </Text>
              )}

              {/* Itemized split stays visible — it's the app's most differentiated
                  feature — but as a chip beside the other details rather than a
                  full-width card row competing with the form itself. */}
              <DetailChips
                accent={accent}
                onSplitByItems={!isEditing && kind !== 'income' && flags.itemized
                  ? () => router.push({ pathname: '/add/itemized', params: f.selectedGroupId ? { groupId: f.selectedGroupId } : {} })
                  : undefined}
                note={flags.smartCategory ? f.note : ''}
                onOpenNote={() => open('note')}
                onClearNote={() => f.setNote('')}
                tags={f.tags}
                onOpenTags={() => open('tags')}
                txnDate={f.txnDate}
                onOpenTime={() => open('time')}
                attachmentUri={f.attachmentUri}
                onOpenAttachment={pickReceipt}
                onClearAttachment={() => f.setAttachmentUri(null)}
                place={f.locEnabled && !isEditing ? f.place : undefined}
                capturingLoc={f.capturingLoc}
                onCaptureLocation={f.locEnabled && !isEditing ? f.captureLocation : undefined}
                onClearLocation={() => f.setPlace(null)}
                payMethod={f.payMethod}
                onOpenPayMethod={() => open('payMethod')}
                isIncome={kind === 'income'}
                recurEnabled={f.recurEnabled}
                recurFreq={f.recurFreq}
                recurInterval={f.recurInterval}
                // Deliberately does NOT pre-enable recurrence. The sheet's own
                // switch turns it on, so closing the sheet without touching it
                // can't leave a transaction silently armed to repeat.
                onOpenRecurring={!isEditing && flags.recurring ? () => open('recurring') : undefined}
                onClearRecurring={() => f.setRecurEnabled(false)}
              />
            </>
          )}
        </ScrollView>

        {/* Sticky CTA. The save action used to be a 24px ✓ glyph in the header —
            AGENTS.md §5 requires PrimaryButton for a primary action, and a footer
            button is also where the thumb already is. */}
      </KeyboardAvoidingView>

      <QuickAddSheets
        form={f}
        open={sheet}
        onOpen={setSheet}
        onClose={() => setSheet(null)}
        transferSlot={transferSlot}
        onCloseTransferSlot={() => setTransferSlot(null)}
        accent={accent}
        tagSuggestions={tagSuggestions}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  save: { ...type.button },
  scroll: { padding: layout.screenPaddingH, gap: space.md, paddingBottom: space.md },
  remainderWarning: { ...type.label, color: colors.expense, textAlign: 'center' },
});
