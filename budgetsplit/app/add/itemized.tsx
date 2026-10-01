import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList,
} from 'react-native';
import { KeyboardForm, keyboardAwareScroll } from '../../src/components/ui/KeyboardForm';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, layout, alpha } from '../../src/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatRupees, parseToPaise } from '../../src/lib/money';
import { computeItemSubtotal, splitItemBase } from '../../src/lib/itemized';
import { SplitEditor } from '../../src/components/finance/add/SplitEditor';
import { ReceiptScanSheet } from '../../src/components/finance/add/ReceiptScanSheet';
import { ScanningOverlay } from '../../src/components/finance/add/ScanningOverlay';
import { asFeather } from '../../src/constants/palette';
import { PrimaryButton } from '../../src/components/ui/PrimaryButton';
import { MemberAvatar } from '../../src/components/finance/MemberAvatar';
import { AvatarStack } from '../../src/components/finance/AvatarStack';
import { CategoryPicker } from '../../src/components/finance/CategoryPicker';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { Chip } from '../../src/components/ui/Chip';
import { PayMethodSheet } from '../../src/components/finance/add/PayMethodSheet';
import { AddKind } from '../../src/constants/enums';
import { haptic } from '../../src/lib/haptics';
import { useItemizedForm, ITEMIZED_STEPS, ADJUSTMENT_LABELS } from '../../src/hooks/useItemizedForm';
import { useFeatureFlags } from '../../src/components/system/FeatureFlagsProvider';
import { receiptScanAvailable } from '../../src/lib/ocrProviders';
import { choosePhotoSource } from '../../src/hooks/photoSource';
import { Card } from '../../src/components/ui/Card';
import { Input } from '../../src/components/ui/Input';
import { TabPills } from '../../src/components/ui/TabPills';
import { Divider } from '../../src/components/ui/Divider';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { SecondaryButton } from '../../src/components/ui/SecondaryButton';
import { ItemFields, ItemGridHeader, ItemGridRow, GridAmountRow } from '../../src/components/finance/add/ItemGrid';
import { backOr } from '../../src/lib/nav';
import { ListRow } from '../../src/components/ui/ListRow';
import { IconCircle } from '../../src/components/ui/IconCircle';
import { Banner } from '../../src/components/ui/Banner';
import { PayMethodDisc } from '../../src/components/finance/pay/PayMethodGlyph';
import { useContentInset } from '../../src/hooks/useContentInset';

/**
 * Itemized-bill wizard (items → assign → payers → review). All state and
 * behaviour live in `useItemizedForm`; this file is the render layer.
 */
const assignScroll = keyboardAwareScroll();

export default function ItemizedScreen() {
  const { groupId: paramGroupId, editId } = useLocalSearchParams<{ groupId?: string; editId?: string }>();
  const router = useRouter();
  const bottomPad = useContentInset();
  const insets = useSafeAreaInsets();

  const f = useItemizedForm(paramGroupId, editId);
  const { flags } = useFeatureFlags();
  // Scan where a receipt can be read: on this phone (iOS), or by the cloud reader when it is on.
  const [scanOk, setScanOk] = useState(false);
  useEffect(() => { receiptScanAvailable().then(setScanOk).catch(() => {}); }, []);
  const canScan = flags.receiptScan && scanOk;
  const [showPayMethod, setShowPayMethod] = useState(false);
  const [showCategory, setShowCategory] = useState(false);
  const stepIndex = ITEMIZED_STEPS.indexOf(f.step);
  const goBack = () => (stepIndex === 0 ? backOr(router, '/(tabs)') : f.setStep(ITEMIZED_STEPS[stepIndex - 1]));

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        {/* The arrow goes back a step, and out of the screen from the first. Each step's foot is
            then one button, the way forward: a Back beside every Next halved it (yours, 2026-10-01). */}
        <TouchableOpacity onPress={goBack} hitSlop={10} accessibilityRole="button" accessibilityLabel={stepIndex === 0 ? 'Close' : 'Back a step'}>
          <Feather name={stepIndex === 0 ? 'x' : 'chevron-left'} size={24} color={colors.accent} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>Split by items</Text>
        </View>
        <Text style={styles.stepIndicator}>{stepIndex + 1}/4</Text>
      </View>

      {/* Step progress dots */}
      <View style={styles.dots}>
        {ITEMIZED_STEPS.map((s, i) => (
          <View key={s} style={[styles.dot, stepIndex >= i && styles.dotActive]} />
        ))}
      </View>

      {/* TOTAL preview card */}
      <Card padded style={styles.totalCard}>
        <View style={styles.totalCardLeft}>
          <Text style={styles.totalCardLabel}>TOTAL</Text>
          <Text style={styles.totalCardAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{formatRupees(f.total)}</Text>
        </View>
        <View style={styles.totalCardRight}>
          <Text style={styles.totalCardMeta} numberOfLines={1}>{f.stepTitle}</Text>
          {f.selectedCategory && (
            <View style={styles.categoryChip}>
              <Feather name={asFeather(f.selectedCategory.icon, 'tag')} size={12} color={colors.accent} />
              <Text style={styles.categoryChipText} numberOfLines={1}>{f.selectedCategory.name}</Text>
            </View>
          )}
        </View>
      </Card>

      {/* STEP 1: ITEMS — one grid (`U-69`): the add fields, each item, and the totals share the
          same columns (`ItemGrid`), so every figure lines up down the page. */}
      {f.step === 'items' && (
        <KeyboardForm contentContainerStyle={[styles.itemsScroll, { paddingBottom: bottomPad }]}>
          {f.items.length > 0 && (
            <>
              <SectionHeader title={`${f.items.length} ${f.items.length === 1 ? 'item' : 'items'}`} first />
              <Card style={styles.card}>
                <ItemGridHeader />
                {f.items.map(item => (
                  <View key={item.id}>
                    <Divider indent="none" />
                    {f.editingId === item.id ? (
                      <View style={styles.editing}>
                        <ItemFields
                          name={item.name} qty={item.qty} price={item.unitPrice}
                          onName={(t) => f.updateItem(item.id, { name: t })}
                          onQty={(t) => f.updateItem(item.id, { qty: t })}
                          onPrice={(t) => f.updateItem(item.id, { unitPrice: t })}
                          onSubmit={() => f.setEditingId(null)}
                          autoFocus
                        />
                        <SecondaryButton label="Done" icon="check" size="sm" onPress={() => f.setEditingId(null)} />
                      </View>
                    ) : (
                      <ItemGridRow
                        name={item.name}
                        qty={Math.max(1, parseInt(item.qty, 10) || 1)}
                        unitPaise={parseToPaise(item.unitPrice)}
                        totalPaise={computeItemSubtotal(item)}
                        below={item.assignedTo.length > 0 ? (
                          <View style={styles.itemAvatars}><AvatarStack people={f.peopleFor(item.assignedTo)} size={20} max={4} /></View>
                        ) : undefined}
                        onPress={() => f.setEditingId(item.id)}
                        onRemove={() => f.removeItem(item.id)}
                      />
                    )}
                  </View>
                ))}
              </Card>
            </>
          )}

          {/* Under the list, so what you just added is the row right above the fields, in the
              order of the bill (yours, 2026-10-01: it sat over the list, with the newest item
              at the far end of it). */}
          {/* Scan receipt is another way to add items, so it sits on this header, beside the
              fields it fills in for you. It was a full-width button above the whole page. */}
          <SectionHeader
            title="Add an item"
            first={f.items.length === 0}
            right={canScan ? (
              <Chip
                size="sm"
                icon="camera"
                label={f.scanning ? 'Reading…' : 'Scan receipt'}
                accent={colors.accent}
                selected
                onPress={f.scanning ? undefined : () => choosePhotoSource(f.handleScanReceipt)}
                accessibilityLabel="Scan a receipt to add its items"
              />
            ) : undefined}
          />
          <Card padded style={styles.gap}>
            <ItemFields
              name={f.newName} qty={f.newQty} price={f.newPrice}
              onName={f.setNewName} onQty={f.setNewQty} onPrice={f.setNewPrice}
              onSubmit={f.addItem}
            />
            <SecondaryButton label="Add item" icon="plus" size="md" onPress={f.addItem} disabled={!f.newName.trim() || !f.newPrice.trim()} />
          </Card>

          {f.items.length === 0 ? (
            <Text style={styles.hintText}>Add each line from the bill.</Text>
          ) : (
            <>
              {/* One line, four equal chips: what the bill adds or takes off after its items. */}
              <View style={styles.adjRow}>
                {(['tax', 'tip', 'service', 'discount'] as const).map(t => (
                  <Chip key={t} grow size="sm" label={t === 'discount' ? '− Discount' : `+ ${ADJUSTMENT_LABELS[t]}`} onPress={() => f.openAdj(t)}
                    accessibilityLabel={`Add ${ADJUSTMENT_LABELS[t].toLowerCase()}`} />
                ))}
              </View>
              <Card style={styles.card}>
                <GridAmountRow label="Subtotal" amount={f.subtotal} />
                {f.adjustments.map((adj, i) => {
                  const amt = adj.mode === 'percent'
                    ? Math.round((f.subtotal * parseToPaise(adj.value)) / 10000)
                    : parseToPaise(adj.value);
                  return (
                    <GridAmountRow
                      key={i}
                      label={`${adj.label}${adj.mode === 'percent' ? ` ${adj.value}%` : ''}`}
                      amount={amt}
                      signed={adj.type === 'discount' ? '−' : '+'}
                      tone={adj.type === 'discount' ? colors.income : undefined}
                      leading={(
                        <TouchableOpacity onPress={() => f.removeAdjustment(i)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${adj.label}`}>
                          <Feather name="x-circle" size={14} color={colors.textMuted} />
                        </TouchableOpacity>
                      )}
                    />
                  );
                })}
                <Divider indent="none" />
                <GridAmountRow label="Total" amount={f.total} strong />
              </Card>
            </>
          )}

          <PrimaryButton label="Next: who had what" onPress={() => f.setStep('assign')} disabled={!f.canProceedItems} style={styles.nextBtn} />
        </KeyboardForm>
      )}

      {/* STEP 2: ASSIGN */}
      {f.step === 'assign' && (
        <FlatList
          data={f.items}
          keyExtractor={i => i.id}
          // No `gap` here: the cards space themselves (`sep`), and a gap added to every cell,
          // the header and the footer is what made this page uneven.
          contentContainerStyle={[styles.listScroll, { paddingBottom: bottomPad }]}
          // Each item's split has amount fields (AGENTS.md §6b).
          renderScrollComponent={assignScroll}
          ListHeaderComponent={<SectionHeader title="Who had what" first />}
          renderItem={({ item }) => (
            <Card clip>
              <TouchableOpacity style={styles.assignItemHeader} onPress={() => f.setExpandedItem(f.expandedItem === item.id ? null : item.id)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.itemSub}>{formatRupees(computeItemSubtotal(item))}</Text>
                </View>
                {item.assignedTo.length === 0
                  ? <Text style={styles.unassignedTag}>Unassigned</Text>
                  : <AvatarStack people={f.peopleFor(item.assignedTo)} size={24} max={3} />
                }
                <Feather name={f.expandedItem === item.id ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} style={{ marginLeft: space.sm }} />
              </TouchableOpacity>
              {f.expandedItem === item.id && (() => {
                const base = computeItemSubtotal(item);
                const itemSplit = splitItemBase(item, base);
                const exactRemainder = base - item.assignedTo.reduce((s, id) => s + (itemSplit[id] ?? 0), 0);
                return (
                  <View style={styles.splitBody}>
                    {/* Shared split allocator — same UI as Quick / import group-split. */}
                    <SplitEditor
                      members={f.members}
                      included={item.assignedTo}
                      onToggle={(id) => f.toggleAssign(item.id, id)}
                      mode={item.splitMode ?? 'equal'}
                      onMode={(m) => { haptic.selection(); f.setItemSplitMode(item.id, m); }}
                      rawValue={(id) => item.splitValues?.[id] ?? ''}
                      onValue={(id, v) => f.setItemSplitValue(item.id, id, v)}
                      result={(id) => itemSplit[id] ?? 0}
                      avatarSize={40}
                    />
                    {item.splitMode === 'exact' && item.assignedTo.length > 0 && exactRemainder !== 0 && (
                      <Text style={styles.splitRemainder}>
                        {formatRupees(Math.abs(exactRemainder))} {exactRemainder > 0 ? 'left to assign' : 'over'} · item is {formatRupees(base)}
                      </Text>
                    )}
                  </View>
                );
              })()}
            </Card>
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListFooterComponent={
            <>
              <SectionHeader title="Each person owes" />
              <Card style={styles.card}>
                {f.members.map((m, i) => (
                  <View key={m.id}>
                    {i > 0 && <Divider indent="none" />}
                    <GridAmountRow label={m.name} amount={f.perPerson[m.id] ?? 0}
                      leading={<MemberAvatar name={m.name} color={m.avatar_color} size={layout.iconCircle} imageUri={m.image_uri} />} />
                  </View>
                ))}
              </Card>
              {/* What is left, said once, with the one tap that clears it. It was a red box with
                  an amber button inside it, under a second "split what's left" button at the top. */}
              {f.unassignedTotal !== 0 && (
                <View style={styles.status}>
                  <Banner
                    inset={false}
                    icon="alert-circle"
                    tone={f.unassignedTotal > 0 ? colors.healthAmber : colors.expense}
                    text={f.unassignedTotal > 0
                      ? `${formatRupees(f.unassignedTotal)} not assigned yet`
                      : `${formatRupees(-f.unassignedTotal)} assigned over the bill`}
                    actionLabel={f.unassignedTotal > 0 ? 'Split equally' : undefined}
                    onAction={f.unassignedTotal > 0 ? f.splitRestEqually : undefined}
                  />
                </View>
              )}
              <PrimaryButton label="Next: who paid" onPress={() => f.setStep('payers')} disabled={!f.canProceedAssign} style={styles.nextBtn} />
            </>
          }
        />
      )}

      {/* STEP 3: PAYERS */}
      {f.step === 'payers' && (
        <KeyboardForm contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad }]}>
          <SectionHeader title={`Who paid the ${formatRupees(f.total)}`} first />
          <Card style={styles.card}>
            {f.members.map((m, i) => (
              <View key={m.id}>
                {i > 0 && <Divider indent="none" />}
                <View style={styles.payerRow}>
                  <MemberAvatar name={m.name} color={m.avatar_color} size={layout.iconCircle} imageUri={m.image_uri} />
                  <Text style={styles.payerName} numberOfLines={1}>{m.name}</Text>
                  <Input
                    style={styles.payerField}
                    value={f.payerAmounts[m.id] ?? ''}
                    onChangeText={v => f.setPayerAmounts(prev => ({ ...prev, [m.id]: v }))}
                    amount
                    placeholder="₹0"
                    accessibilityLabel={`${m.name} paid`}
                  />
                </View>
              </View>
            ))}
          </Card>
          <Text style={[styles.remainderText, { color: f.paymentRemainder === 0 ? colors.income : colors.expense }]}>
            {f.paymentRemainder === 0 ? 'Balanced' : f.paymentRemainder > 0 ? `${formatRupees(f.paymentRemainder)} remaining` : `${formatRupees(-f.paymentRemainder)} over`}
          </Text>

          <PrimaryButton label="Next: review" onPress={() => f.setStep('review')} disabled={f.paymentRemainder !== 0 || f.payments.length === 0} style={styles.nextBtn} />
        </KeyboardForm>
      )}

      {/* STEP 4: REVIEW */}
      {f.step === 'review' && (
        <KeyboardForm contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad }]}>
          {/* The details, as the rows every form in the app uses (AGENTS §4): one card, a
              labelled value each, a tap to change it. They were four loose fields under four
              loose labels. */}
          <SectionHeader title="Details" first />
          <Card clip>
            <ListRow
              variant="stacked"
              leading={<IconCircle icon={asFeather(f.selectedCategory?.icon, 'tag')} size={layout.iconCircle} color={f.selectedCategory?.color ?? colors.accent} />}
              title="Category"
              value={f.selectedCategory?.name ?? 'Choose'}
              onPress={() => setShowCategory(true)}
            />
            <Divider indent="text" />
            {/* Where the money came from. Credit card vs cash is not cosmetic: lib/cash books
                card spend as debt, not cash out. */}
            <ListRow
              variant="stacked"
              leading={<PayMethodDisc method={f.payMethod} size={layout.iconCircle} color={colors.accent} />}
              title="Paid from"
              value={f.paidFromLabel}
              onPress={() => setShowPayMethod(true)}
            />
            {f.locEnabled && !f.isEditing && (
              <>
                <Divider indent="text" />
                <ListRow
                  variant="stacked"
                  icon="map-pin"
                  iconColor={f.place ? colors.accent : colors.textMuted}
                  title="Where"
                  value={f.capturingLoc ? 'Locating…' : f.place?.label || (f.place ? 'Location tagged' : 'Not tagged')}
                  chevron={false}
                  onPress={f.capturingLoc ? undefined : f.place ? () => f.setPlace(null) : f.captureLocation}
                  accessibilityLabel={f.place ? 'Remove location' : 'Tag this location'}
                />
              </>
            )}
          </Card>
          <Input value={f.note} onChangeText={f.setNote} placeholder="Add a note" icon="edit-3" accessibilityLabel="Note" style={styles.noteField} />

          {/* Each person once: what they owe, and under their name what they paid. It was two
              cards listing the same people. */}
          <SectionHeader title="Who owes what" />
          <Card style={styles.card}>
            {f.members.filter(m => (f.perPerson[m.id] ?? 0) > 0 || f.payments.some(p => p.personId === m.id)).map((m, i) => {
              const paid = f.payments.find(p => p.personId === m.id)?.amount ?? 0;
              return (
                <View key={m.id}>
                  {i > 0 && <Divider indent="none" />}
                  <View style={styles.personRow}>
                    <MemberAvatar name={m.name} color={m.avatar_color} size={layout.iconCircle} imageUri={m.image_uri} />
                    <View style={styles.personText}>
                      <Text style={[styles.personName, m.is_me === 1 && styles.personMe]} numberOfLines={1}>{m.is_me === 1 ? `${m.name} (you)` : m.name}</Text>
                      {paid > 0 && <Text style={styles.personPaid}>paid {formatRupees(paid)}</Text>}
                    </View>
                    <Text style={[styles.personShare, m.is_me === 1 && styles.personMe]}>{formatRupees(f.perPerson[m.id] ?? 0)}</Text>
                  </View>
                </View>
              );
            })}
            <Divider indent="none" />
            <GridAmountRow label="Total" amount={f.total} strong />
          </Card>

          <PrimaryButton label="Save" onPress={f.handleSave} loading={f.saving} disabled={!f.canSave || f.saving} style={styles.nextBtn} />
        </KeyboardForm>
      )}

      <CategoryPicker
        categories={f.categories}
        value={f.selectedCategory}
        onChange={f.setSelectedCategory}
        onCreate={(name) => f.createCategory(name)}
        forceOpen={showCategory}
        onClose={() => setShowCategory(false)}
        hideTrigger
      />

      {/* Adjustment sheet — keyboard-safe */}
      <PayMethodSheet
        visible={showPayMethod}
        onClose={() => setShowPayMethod(false)}
        value={f.payMethod}
        onChange={f.setPaidFrom}
        accounts={f.accounts}
        accountId={f.accountId}
        kind={AddKind.Expense}
      />

      <SheetModal visible={f.showAdjModal} onClose={() => f.setShowAdjModal(false)} title={`Add ${ADJUSTMENT_LABELS[f.adjType]}`}>
        {/* Pick exactly one: a segmented control, not two hand-built buttons (AGENTS §9). */}
        <TabPills
          tabs={[{ key: 'percent', label: 'Percent' }, { key: 'flat', label: 'Amount' }]}
          active={f.adjMode}
          onChange={(k) => f.setAdjMode(k as 'percent' | 'flat')}
        />
        <Input
          style={styles.adjField}
          value={f.adjValue}
          onChangeText={f.setAdjValue}
          amount
          placeholder={f.adjMode === 'percent' ? '5%' : '₹0'}
          autoFocus
          onSubmitEditing={f.addAdjustment}
          accessibilityLabel={f.adjMode === 'percent' ? 'Percent' : 'Amount'}
        />
        <PrimaryButton label="Add" onPress={f.addAdjustment} disabled={!f.adjValue.trim()} />
      </SheetModal>

      {/* Receipt scan result — raw OCR text always visible + best-effort item guesses */}
      <ReceiptScanSheet
        visible={f.showScanSheet}
        onClose={() => f.setShowScanSheet(false)}
        rawText={f.scanResult?.rawText ?? null}
        candidates={f.scanResult?.candidates ?? []}
        fellBack={f.scanResult?.fellBack ?? false}
        fellBackWhy={f.scanResult?.fellBackWhy}
        onAddItems={(drafts) => { f.addItems(drafts); f.setShowScanSheet(false); }}
      />

      {/* Blocks all interaction (incl. manual "Add item") for the duration of a scan */}
      <ScanningOverlay visible={f.scanning} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: layout.screenPaddingH, paddingBottom: space.sm, minHeight: 44 },
  title: { ...type.heading, color: colors.textPrimary },
  stepIndicator: { ...type.label, color: colors.textMuted },
  dots: { flexDirection: 'row', gap: 6, paddingHorizontal: layout.screenPaddingH, marginBottom: space.sm },
  dot: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.bgMuted },
  dotActive: { backgroundColor: colors.accent },
  totalCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: layout.screenPaddingH, marginBottom: space.sm },
  totalCardLeft: { flexShrink: 1 },
  totalCardLabel: { ...type.caption, color: colors.textMuted, letterSpacing: 0.5 },
  totalCardAmount: { fontFamily: 'SpaceMono_400Regular', fontSize: 28, color: colors.textPrimary, marginTop: 2 },
  totalCardRight: { alignItems: 'flex-end', gap: 6, marginLeft: space.sm },
  totalCardMeta: { ...type.label, color: colors.textMuted },
  categoryChip: { flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: colors.bgMuted, paddingHorizontal: space.sm, paddingVertical: 5, borderRadius: radius.pill },
  categoryChipText: { ...type.caption, color: colors.textSecondary, fontFamily: 'Inter_600SemiBold' },
  scroll: { padding: layout.screenPaddingH },
  listScroll: { paddingHorizontal: layout.screenPaddingH, paddingTop: space.xs },
  // No gap: `SectionHeader` owns its margins, and the two would add up (AGENTS §3).
  itemsScroll: { padding: layout.screenPaddingH },
  gap: { gap: space.smd },
  editing: { gap: space.sm, paddingVertical: space.smd },
  // One line: four chips sharing the row (`grow`), never wrapping to a second.
  adjRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md, marginBottom: space.md },

  itemAvatars: { marginTop: 6 },

  card: { paddingHorizontal: space.md },
  itemName: { ...type.body, color: colors.textPrimary },
  itemSub: { ...type.caption, color: colors.textSecondary, marginTop: 2 },

  hintText: { ...type.body, color: colors.textMuted, textAlign: 'center', paddingVertical: space.lg },
  nextBtn: { marginTop: space.lg },

  assignItemHeader: { flexDirection: 'row', alignItems: 'center', padding: space.md },
  unassignedTag: { ...type.caption, color: colors.expense, backgroundColor: alpha(colors.expense, 13), paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill },
  splitBody: { paddingHorizontal: space.md, paddingBottom: space.md, gap: space.sm },
  splitRemainder: { ...type.caption, color: colors.healthAmber, marginTop: 2 },
  sep: { height: space.sm },

  status: { marginTop: space.md },
  noteField: { marginTop: space.md },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.smd },
  personText: { flex: 1, minWidth: 0 },
  personName: { ...type.body, color: colors.textPrimary },
  personMe: { fontFamily: 'Inter_600SemiBold' },
  personPaid: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  personShare: { ...type.amountSM, color: colors.textPrimary },

  payerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  payerName: { ...type.body, color: colors.textPrimary, flex: 1 },
  payerField: { width: 128 },
  adjField: { marginVertical: space.md },
  remainderText: { ...type.label, textAlign: 'center', fontFamily: 'Inter_600SemiBold', marginTop: space.md },

});
