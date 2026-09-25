import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Keyboard, Platform } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, layout } from '../../src/theme';
import { formatRupees } from '../../src/lib/money';
import { kindAccent } from '../../src/lib/kindTheme';
import { ADD_KIND_TABS, ADD_KIND_LABEL, AddKind } from '../../src/constants/enums';
import { insertCategory } from '../../src/db/queries/categories';
import { INVESTMENT_EXPENSE_CATEGORY } from '../../src/constants/categories';
import { Banner } from '../../src/components/ui/Banner';
import { getTagsByFrequency } from '../../src/db/queries/transactions';
import { useAddTxnForm } from '../../src/hooks/useAddTxnForm';
import { useContentInset } from '../../src/hooks/useContentInset';
import { useVoiceDeepLink } from '../../src/hooks/useVoiceDeepLink';
import { Screen } from '../../src/components/ui/Screen';
import { KeyboardForm } from '../../src/components/ui/KeyboardForm';
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

// Three pills, not four (`SPEC-2026-09-FEEDBACK.md` §4, 2026-09-24) — Invest stays reachable
// (a category pick below, a deep link, voice) without a pill of its own.
const KIND_TABS = ADD_KIND_TABS.map(k => ({ key: k, label: ADD_KIND_LABEL[k] }));

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

  /*
   * No args: a fullScreenModal with no tab bar, no FAB and no sticky footer — the
   * commit action lives in the header (AGENTS §5). The static style carried a flat
   * `paddingBottom: space.md`, so on a notched phone the last card ended 16pt from
   * the physical edge, under the home indicator. `useContentInset` exists precisely
   * to end that guessing, and its own docblock names "insets.bottom + 40 in Quick
   * Add" as one of the values it replaced — this screen had since regressed past it.
   */
  const bottomPad = useContentInset();

  useVoiceDeepLink({
    form: f,
    phrase: params.q,
    kindParam: params.kind,
    onOpenDestination: () => setSheet('destination'),
  });

  const { kind, flags, isEditing, isRecurEdit } = f;
  const isTransfer = kind === 'transfer';
  // Invest is a settlement too, but a personal one — no counterparty, no split, no
  // group. Where a gate means "is this a settlement" it must ask both; where it
  // means "does this involve another person" it must ask only `isTransfer`.
  const isInvest = kind === AddKind.Invest;
  const investAsset = f.assets.find(a => a.id === f.investAssetId) ?? null;
  const accent = kindAccent(kind);
  const nudgeColor = f.nudgePct == null ? null : f.nudgePct > 0.2 ? colors.income : f.nudgePct > 0 ? colors.healthAmber : colors.expense;

  /**
   * Sheets that open their own text field, so the keyboard should STAY up.
   *
   * Dismissing it here started a ~250ms keyboard-down while the sheet was
   * springing up, and the sheet's field then brought it straight back — three
   * transitions, none aware of the others, for one tap. Leaving it up means the
   * sheet slides over a layout that is not moving, and `DraggableSheet` never
   * flips its keyboard padding either, which was the second half of the jank.
   *
   * NOT `tags`: that sheet opens onto the tags you have used before, and raising
   * a keyboard over the list you came to pick from is worse than the extra tap.
   * Its field is for adding a NEW tag, which is the rarer half.
   */
  const KEEPS_KEYBOARD: QuickAddSheet[] = ['note', 'voice'];

  const open = (s: QuickAddSheet) => {
    if (!KEEPS_KEYBOARD.includes(s)) Keyboard.dismiss();
    setSheet(s);
  };
  const pickReceipt = useAttachmentPicker({
    onPicked: f.setAttachmentUri,
    onOpenStorageSettings: () => router.push('/settings/storage'),
  });

  // Transfer is hidden when splitting is off — a settlement needs someone to settle
  // with — but stays visible while editing one, or the pill would vanish from a row
  // that already is a transfer.
  //
  // Invest is NOT filtered with it. Moving your own money into your own asset needs
  // nobody else, so it is exactly as available to a splitting-off user as Expense
  // is; hiding it with Transfer would remove a personal-finance feature because
  // someone turned off bill-splitting.
  const tabs = flags.splitting || isTransfer
    ? KIND_TABS
    : KIND_TABS.filter(t => t.key !== 'transfer');

  return (
    <Screen
      header={
        <AddHeader form={f} accent={accent} onClose={() => backOr(router, '/(tabs)')} onOpenSheet={open} />
      }
    >
      {/* `KeyboardForm` (AGENTS.md §6b): a focused field scrolls into view above
          the keyboard. No footer — Save lives in the header. */}
      <KeyboardForm contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad }]}>

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
              // Invest's category is always `INVESTMENT_CATEGORY`, so the left chip
              // asks the question that does have more than one answer: which asset.
              destination={isInvest ? {
                label: investAsset?.name ?? 'Choose asset',
                icon: 'trending-up',
                onPress: () => open('asset'),
                a11y: investAsset ? `Into ${investAsset.name}. Change` : 'Choose which asset',
              } : undefined}
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

          {/* Invest's whole form: an amount, an asset, a date and a note.
              No category picker (it is fixed), no split (nobody else is involved),
              no destination group (it is always Personal), and no smart-category
              title — the title exists to GUESS a category, and there is nothing to
              guess. What is left is the note, which is where "January SIP" goes. */}
          {isInvest && (
            <View style={styles.formBlock}>
              <Input
                value={f.note}
                onChangeText={f.setNote}
                icon="edit-3"
                placeholder="Note (optional)"
                maxLength={80}
                autoCapitalize="sentences"
                accessibilityLabel="Note"
              />
            </View>
          )}

          {!isTransfer && !isInvest && (
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

              {/*
                * Buying an investment is not spending, and this is where people
                * try to log it anyway — `smartCategory` maps "sip", "mutual fund",
                * "zerodha" and "gold" straight to this category, so typing
                * "SIP 5000" lands here by itself. Saving it as an expense
                * double-counts the money (the cash already moved) and eats a
                * budget it has no business eating, and net worth FALLS by the
                * amount invested.
                *
                * This used to be a Banner reading "record it against an asset and
                * your net worth stays put", whose action pushed to `/assets` —
                * i.e. it caught the mistake and then sent you to another screen to
                * redo the entry. `OV-30`: a banner that catches a mistake the
                * screen could have prevented is a workaround, not a feature. The
                * Invest pill is the control it was standing in for, so this now
                * switches kind in place, keeping the amount already typed.
                */}
              {kind === 'expense' && f.selectedCategory?.name === INVESTMENT_EXPENSE_CATEGORY && (
                <View style={styles.formBlock}>
                  <Banner
                    icon="trending-up"
                    text="Buying an investment isn’t spending — log it as Invest and your net worth stays put."
                    actionLabel="Switch to Invest"
                    onAction={() => f.onSelectKind(AddKind.Invest)}
                  />
                </View>
              )}

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
      </KeyboardForm>

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
  // No container `gap` — a block that renders its own top margin (e.g.
  // SplitSummary's header) would silently stack with it (AGENTS.md §3/§12).
  // Each block gets its own `formBlock` margin instead.
  // Horizontal and top only. The bottom comes from `useContentInset` at the call
  // site, where it can see the safe area; a literal here would be dead weight the
  // override silently replaces, which is how the old guessed value survived.
  scroll: { padding: layout.screenPaddingH },
  formBlock: { marginBottom: space.md },
  remainderWarning: { ...type.label, color: colors.expense, textAlign: 'center' },
});
