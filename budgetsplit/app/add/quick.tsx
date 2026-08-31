import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Keyboard, Platform } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, layout } from '../../src/theme';
import { formatRupees } from '../../src/lib/money';
import { kindAccent } from '../../src/lib/kindTheme';
import { ADD_KIND, ADD_KIND_LABEL } from '../../src/constants/enums';
import { insertCategory } from '../../src/db/queries/categories';
import { getTagsByFrequency } from '../../src/db/queries/transactions';
import { useAddTxnForm } from '../../src/hooks/useAddTxnForm';
import { useVoiceDeepLink } from '../../src/hooks/useVoiceDeepLink';
import { Screen } from '../../src/components/ui/Screen';
import { AddHeader } from '../../src/components/finance/add/AddHeader';
import { TabPills } from '../../src/components/ui/TabPills';
import { CategoryPicker } from '../../src/components/finance/CategoryPicker';
import { TransferBody } from '../../src/components/finance/add/TransferBody';
import { AmountField } from '../../src/components/finance/add/AmountField';
import { CategoryDatePills } from '../../src/components/finance/add/CategoryDatePills';
import { Input } from '../../src/components/ui/Input';
import { BudgetNudge } from '../../src/components/finance/add/BudgetNudge';
import { DetailChips } from '../../src/components/finance/add/DetailChips';
import { SplitSummary } from '../../src/components/finance/add/SplitSummary';
import { QuickAddSheets, type QuickAddSheet } from '../../src/components/finance/add/QuickAddSheets';
import { useAttachmentPicker } from '../../src/hooks/useAttachmentPicker';
import { backOr } from '../../src/lib/nav';

const KIND_TABS = ADD_KIND.map(k => ({ key: k, label: ADD_KIND_LABEL[k] }));

export default function QuickAddScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ groupId?: string; kind?: string; editId?: string; recurEditId?: string; from?: string; to?: string; amount?: string; note?: string; date?: string; category?: string; q?: string }>();
  const f = useAddTxnForm(params);

  // One overlay at a time — see QuickAddSheets.
  const [sheet, setSheet] = useState<QuickAddSheet>(null);
  const [transferSlot, setTransferSlot] = useState<'from' | 'to' | null>(null);
  const [showCatPicker, setShowCatPicker] = useState(false);
  // The tag vocabulary is derived from existing transactions, so it's read once per mount
  // rather than kept in the form hook — nothing here writes to it mid-edit.
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  useEffect(() => { getTagsByFrequency(db).then(setTagSuggestions).catch(() => {}); }, [db]);

  useVoiceDeepLink({
    form: f,
    phrase: params.q,
    kindParam: params.kind,
    onOpenDestination: () => setSheet('destination'),
  });

  const { kind, flags, isEditing, isRecurEdit } = f;
  const isTransfer = kind === 'transfer';
  const accent = kindAccent(kind);
  const nudgeColor = f.nudgePct == null ? null : f.nudgePct > 0.2 ? colors.income : f.nudgePct > 0 ? colors.healthAmber : colors.expense;

  const open = (s: QuickAddSheet) => { Keyboard.dismiss(); setSheet(s); };
  const pickReceipt = useAttachmentPicker({
    onPicked: f.setAttachmentUri,
    onOpenStorageSettings: () => router.push('/settings/storage'),
  });

  // Transfer is hidden when splitting is off — a settlement needs someone to settle
  // with — but stays visible while editing one, or the pill would vanish from a row
  // that already is a transfer.
  const tabs = flags.splitting || isTransfer
    ? KIND_TABS
    : KIND_TABS.filter(t => t.key !== 'transfer');

  return (
    <Screen
      header={
        <AddHeader form={f} accent={accent} onClose={() => backOr(router, '/(tabs)')} onOpenSheet={open} />
      }
    >
      {/* One behavior, both platforms. Was `'height'` on Android with a magic
          24pt offset — the jankiest RN mode, chosen because `'padding'` did
          nothing there. The library's implementation makes `'padding'` work, so
          the special case and the magic number both go. */}
      <KeyboardAvoidingView style={styles.fill} behavior="padding">
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {!isEditing && !isRecurEdit && (
            <View style={styles.formBlock}>
              <TabPills
                tabs={tabs}
                active={kind}
                onChange={(k) => f.onSelectKind(k as typeof kind)}
                activeColor={accent}
                // `sm` (36pt), not `lg`. At 48pt the three kinds were the loudest
                // thing on the screen, competing with the amount below them — and
                // it is a choice most people make once and leave.
                size="sm"
              />
            </View>
          )}

          {/* Dictate and adjust sit on the amount row itself (`AmountField`). Dictation is
              offered for every kind including transfer; it is withheld only while editing,
              where re-dictating would silently overwrite fields you came here to change. */}
          <View style={styles.formBlock}>
            <AmountField
              amountText={f.amountText}
              onChangeText={f.setAmountText}
              kind={kind}
              autoFocus={!isEditing && !isRecurEdit}
              transferScopeBal={f.transferScopeBal}
              onOpenCalculator={() => open('calc')}
              onOpenVoice={!isEditing && !isRecurEdit && flags.voiceEntry ? () => open('voice') : undefined}
            />
          </View>

          <View style={styles.formBlock}>
            <CategoryDatePills
              kind={kind}
              accent={accent}
              selectedCategory={f.selectedCategory}
              onCategory={() => { Keyboard.dismiss(); setShowCatPicker(true); }}
              txnDate={f.txnDate}
              onDate={() => open('date')}
            />
          </View>

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
            <View style={styles.formBlock}>
              <TransferBody
                me={f.me}
                persons={f.allPersons}
                fromId={f.transferFromId}
                toId={f.transferToId}
                onPickSlot={(slot) => { Keyboard.dismiss(); setTransferSlot(slot); }}
                onSwap={() => { f.setTransferFromId(f.transferToId); f.setTransferToId(f.transferFromId); }}
                scopes={f.transferScopes}
                scope={f.transferScope}
                amountPaise={f.total}
                payee={f.transferPayee}
                handoff={f.transferHandoff}
                canPay={f.canPayTransferUpi}
                canRequest={f.canRequestTransferQr}
                handoffHooks={f.transferHandoffHooks}
                onOpenUpiUri={() => open('upiUri')}
                onOpenRequestQr={() => open('requestQr')}
              />
            </View>
          )}

          {kind !== 'transfer' && (
            <>
              {/* Top field: Title (drives category) when smart-category is on, else the
                  Note. `ui/Input` rather than a bespoke card input, so this field and the
                  Note sheet share one surface — they used to be `bgCard` here and
                  `bgInput` there, two looks for one value — and so it gets a focus ring. */}
              <View style={styles.formBlock}>
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
              </View>

              {kind === 'expense' && nudgeColor != null && f.nudgeRemaining != null && f.selectedCategory && (
                <View style={styles.formBlock}>
                  <BudgetNudge color={nudgeColor} remaining={f.nudgeRemaining} categoryName={f.selectedCategory.name} afford={f.affordResult} />
                </View>
              )}

              {/* Split is core to a shared expense, so it sits above the optional
                  details — it used to render below the "More options" accordion,
                  which pushed it off-screen the moment that was expanded. */}
              {kind === 'expense' && f.members.length > 1 && f.total > 0 && (
                <View style={styles.formBlock}>
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
                </View>
              )}

              {kind === 'expense' && f.total > 0 && (f.paymentRemainder !== 0 || f.remainder !== 0) && (
                <Text style={[styles.remainderWarning, styles.formBlock]}>
                  {f.paymentRemainder !== 0
                    ? f.paymentRemainder > 0 ? `${formatRupees(f.paymentRemainder)} left to assign payers` : `${formatRupees(-f.paymentRemainder)} over-assigned to payers`
                    : f.remainder > 0 ? `${formatRupees(f.remainder)} unassigned` : `${formatRupees(-f.remainder)} over-assigned`}
                </Text>
              )}

            </>
          )}

          {/* One details block for all three kinds. A kind OMITS a chip it cannot
              honour — it never shows one that silently drops the value. */}
          <DetailChips
            accent={accent}
            // A transfer's note is `transferNote` — a different field, which is what
            // persists and what the UPI payload reads. For the other kinds the chip is
            // omitted when smart-category is off, because then the form's top field
            // already IS the note and two controls would edit one value.
            note={isTransfer ? f.transferNote : flags.smartCategory ? f.note : ''}
            onOpenNote={isTransfer || flags.smartCategory ? () => open('note') : undefined}
            onClearNote={() => (isTransfer ? f.setTransferNote('') : f.setNote(''))}
            tags={f.tags}
            onOpenTags={() => open('tags')}
            attachmentUri={f.attachmentUri}
            onOpenAttachment={pickReceipt}
            onClearAttachment={() => f.setAttachmentUri(null)}
            // Where you were is a fact about a purchase; a settlement is money moving
            // between two people and has no place of its own.
            place={f.locEnabled && !isEditing && !isTransfer ? f.place : undefined}
            capturingLoc={f.capturingLoc}
            onCaptureLocation={f.locEnabled && !isEditing && !isTransfer ? f.captureLocation : undefined}
            onClearLocation={() => f.setPlace(null)}
            payMethod={f.payMethod}
            onOpenPayMethod={() => open('payMethod')}
            isIncome={kind === 'income'}
            txnDate={f.txnDate}
            onOpenTime={() => open('time')}
            onSplitByItems={!isEditing && kind === 'expense' && flags.itemized
              ? () => router.push({ pathname: '/add/itemized', params: f.selectedGroupId ? { groupId: f.selectedGroupId } : {} })
              : undefined}
            recurEnabled={f.recurEnabled}
            recurFreq={f.recurFreq}
            recurInterval={f.recurInterval}
            // A settlement records a payment that already happened, not a schedule,
            // so it never repeats. Omitted, not disabled.
            onOpenRecurring={!isEditing && flags.recurring && !isTransfer ? () => open('recurring') : undefined}
          />
        </ScrollView>
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
  // No container `gap` — a block that renders its own top margin (e.g.
  // SplitSummary's header) would silently stack with it (AGENTS.md §3/§12).
  // Each block gets its own `formBlock` margin instead.
  scroll: { padding: layout.screenPaddingH, paddingBottom: space.md },
  formBlock: { marginBottom: space.md },
  remainderWarning: { ...type.label, color: colors.expense, textAlign: 'center' },
});
