import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  FlatList, ScrollView, KeyboardAvoidingView, Platform,
  ActionSheetIOS, ActivityIndicator,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, layout, shadow, alpha } from '../../src/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { insertCategory } from '../../src/db/queries/categories';
import { formatRupees, parseToPaise } from '../../src/lib/money';
import { computeItemSubtotal, splitItemBase, type Adjustment } from '../../src/lib/itemized';
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
import { PAY_METHOD_LABEL, AddKind } from '../../src/constants/enums';
import { haptic } from '../../src/lib/haptics';
import { useItemizedForm, ITEMIZED_STEPS, ADJUSTMENT_LABELS } from '../../src/hooks/useItemizedForm';
import { useFeatureFlags } from '../../src/components/system/FeatureFlagsProvider';

/**
 * Itemized-bill wizard (items → assign → payers → review). All state and
 * behaviour live in `useItemizedForm`; this file is the render layer.
 */
export default function ItemizedScreen() {
  const { groupId: paramGroupId, editId } = useLocalSearchParams<{ groupId?: string; editId?: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const f = useItemizedForm(paramGroupId, editId);
  const { flags } = useFeatureFlags();
  const [showPayMethod, setShowPayMethod] = useState(false);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
          <Feather name="chevron-left" size={24} color={colors.accent} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>Split by items</Text>
        </View>
        <Text style={styles.stepIndicator}>{ITEMIZED_STEPS.indexOf(f.step) + 1}/4</Text>
        {f.step === 'review' && (
          <TouchableOpacity onPress={f.handleSave} disabled={!f.canSave || f.saving} hitSlop={10} accessibilityRole="button" accessibilityLabel="Save">
            <Text style={[styles.headerSave, (!f.canSave || f.saving) && { opacity: 0.35 }]}>Save</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Step progress dots */}
      <View style={styles.dots}>
        {ITEMIZED_STEPS.map((s, i) => (
          <View key={s} style={[styles.dot, ITEMIZED_STEPS.indexOf(f.step) >= i && styles.dotActive]} />
        ))}
      </View>

      {/* TOTAL preview card */}
      <View style={styles.totalCard}>
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
      </View>

      {/* STEP 1: ITEMS */}
      {f.step === 'items' && (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {Platform.OS === 'ios' && flags.receiptScan && (
            <TouchableOpacity
              style={styles.splitRestBtn}
              onPress={() => {
                if (f.scanning) return;
                ActionSheetIOS.showActionSheetWithOptions(
                  { options: ['Cancel', 'Take Photo', 'Choose from Library'], cancelButtonIndex: 0 },
                  (i) => {
                    if (i === 1) f.handleScanReceipt('camera');
                    if (i === 2) f.handleScanReceipt('gallery');
                  },
                );
              }}
              disabled={f.scanning}
              accessibilityRole="button"
              accessibilityLabel="Scan receipt"
            >
              {f.scanning
                ? <ActivityIndicator size="small" color={colors.accent} />
                : <Feather name="camera" size={16} color={colors.accent} />}
              <Text style={styles.splitRestText}>{f.scanning ? 'Reading receipt…' : 'Scan receipt'}</Text>
            </TouchableOpacity>
          )}

          <View style={styles.addCardHeader}>
            <Feather name="plus" size={15} color={colors.accent} />
            <Text style={styles.addCardHeaderText}>Add item</Text>
          </View>
          <View style={styles.addCard}>
            <TextInput
              style={styles.addNameInput}
              placeholder="Item name"
              placeholderTextColor={colors.textMuted}
              value={f.newName}
              onChangeText={f.setNewName}
              returnKeyType="next"
            />
            <View style={styles.addRow2}>
              <View style={styles.qtyWrap}>
                <Text style={styles.miniLabel}>Qty</Text>
                <TextInput
                  style={styles.qtyInput}
                  value={f.newQty}
                  onChangeText={f.setNewQty}
                  keyboardType="number-pad"
                  placeholder="1"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={styles.priceWrap}>
                <Text style={styles.miniLabel}>Unit price</Text>
                <TextInput
                  style={styles.priceInput}
                  value={f.newPrice}
                  onChangeText={f.setNewPrice}
                  keyboardType="decimal-pad"
                  placeholder="₹0"
                  placeholderTextColor={colors.textMuted}
                  onSubmitEditing={f.addItem}
                />
              </View>
              <TouchableOpacity
                style={[styles.addBtn, (!f.newName.trim() || !f.newPrice.trim()) && styles.addBtnDisabled]}
                onPress={f.addItem}
                disabled={!f.newName.trim() || !f.newPrice.trim()}
                accessibilityRole="button"
                accessibilityLabel="Add item"
              >
                <Feather name="plus" size={22} color={colors.bg} />
              </TouchableOpacity>
            </View>
          </View>

          {f.items.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>LINE ITEMS</Text>
              <View style={styles.card}>
                {f.items.map((item, idx) => {
                  const editing = f.editingId === item.id;
                  return (
                  <View key={item.id} style={[styles.itemRow, idx < f.items.length - 1 && styles.rowBorder]}>
                    {editing ? (
                      <View style={{ flex: 1, gap: space.xs }}>
                        <TextInput
                          style={styles.itemEditName}
                          value={item.name}
                          onChangeText={(t) => f.updateItem(item.id, { name: t })}
                          placeholder="Item name"
                          placeholderTextColor={colors.textMuted}
                          accessibilityLabel="Item name"
                        />
                        <View style={styles.itemEditRow}>
                          <TextInput
                            style={styles.itemEditQty}
                            value={item.qty}
                            onChangeText={(t) => f.updateItem(item.id, { qty: t.replace(/[^0-9]/g, '') })}
                            keyboardType="number-pad"
                            placeholder="1"
                            placeholderTextColor={colors.textMuted}
                            accessibilityLabel="Quantity"
                          />
                          <Text style={styles.itemEditTimes}>×</Text>
                          <View style={styles.itemEditPriceWrap}>
                            <Text style={styles.itemEditRupee}>₹</Text>
                            <TextInput
                              style={styles.itemEditPrice}
                              value={item.unitPrice}
                              onChangeText={(t) => f.updateItem(item.id, { unitPrice: t.replace(/[^0-9.]/g, '') })}
                              keyboardType="decimal-pad"
                              placeholder="0"
                              placeholderTextColor={colors.textMuted}
                              accessibilityLabel="Unit price"
                            />
                          </View>
                          <TouchableOpacity style={styles.itemDoneBtn} onPress={() => f.setEditingId(null)} accessibilityRole="button" accessibilityLabel="Done editing">
                            <Feather name="check" size={16} color={colors.accent} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <TouchableOpacity style={{ flex: 1 }} onPress={() => f.setEditingId(item.id)} accessibilityRole="button" accessibilityLabel={`Edit ${item.name}`}>
                        <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                        {item.assignedTo.length > 0 ? (
                          <View style={styles.itemAvatars}>
                            <AvatarStack people={f.peopleFor(item.assignedTo)} size={20} max={4} />
                          </View>
                        ) : (
                          <Text style={styles.itemSub} numberOfLines={1}>
                            {item.qty} × {formatRupees(parseToPaise(item.unitPrice))} · tap to edit
                          </Text>
                        )}
                      </TouchableOpacity>
                    )}
                    {!editing && <Text style={styles.itemTotal}>{formatRupees(computeItemSubtotal(item))}</Text>}
                    <TouchableOpacity onPress={() => f.removeItem(item.id)} hitSlop={8} accessibilityLabel="Remove item">
                      <Feather name="trash-2" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                  );
                })}
              </View>
            </>
          )}

          {f.items.length > 0 && (
            <View style={styles.card}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal</Text>
                <Text style={styles.summaryVal}>{formatRupees(f.subtotal)}</Text>
              </View>
              {f.adjustments.map((adj, i) => {
                const amt = adj.mode === 'percent'
                  ? Math.round((f.subtotal * parseToPaise(adj.value)) / 10000)
                  : parseToPaise(adj.value);
                return (
                  <View key={i} style={styles.summaryRow}>
                    <TouchableOpacity onPress={() => f.removeAdjustment(i)} hitSlop={6} style={styles.adjChipRemove}>
                      <Feather name="x-circle" size={13} color={colors.textMuted} />
                      <Text style={styles.summaryLabel} numberOfLines={1}>
                        {adj.label} {adj.mode === 'percent' ? `${adj.value}%` : ''}
                      </Text>
                    </TouchableOpacity>
                    <Text style={[styles.summaryVal, { color: adj.type === 'discount' ? colors.income : colors.textPrimary }]}>
                      {adj.type === 'discount' ? '−' : '+'}{formatRupees(amt)}
                    </Text>
                  </View>
                );
              })}
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryTotalLabel}>Total</Text>
                <Text style={styles.summaryTotalVal}>{formatRupees(f.total)}</Text>
              </View>
            </View>
          )}

          {f.items.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>ADJUSTMENTS</Text>
              <View style={styles.adjButtons}>
                {([['tax', 'plus', 'Tax'], ['tip', 'plus', 'Tip'], ['service', 'percent', 'Service'], ['discount', 'minus', 'Discount']] as const).map(([t, ic, label]) => (
                  <TouchableOpacity key={t} style={styles.adjBtn} onPress={() => f.openAdj(t)} accessibilityRole="button">
                    <Feather name={ic} size={13} color={colors.accent} />
                    <Text style={styles.adjBtnText}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {f.items.length === 0 && (
            <Text style={styles.hintText}>Add each line on the bill — name, quantity and unit price.</Text>
          )}

          <PrimaryButton label="Next: Assign items" onPress={() => f.setStep('assign')} disabled={!f.canProceedItems} style={styles.nextBtn} />
        </ScrollView>
      )}

      {/* STEP 2: ASSIGN */}
      {f.step === 'assign' && (
        <FlatList
          data={f.items}
          keyExtractor={i => i.id}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <TouchableOpacity style={styles.splitRestBtn} onPress={f.splitRestEqually} accessibilityRole="button">
              <Feather name="users" size={15} color={colors.accent} />
              <Text style={styles.splitRestText}>Split unassigned equally</Text>
            </TouchableOpacity>
          }
          renderItem={({ item }) => (
            <View style={styles.assignItem}>
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
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListFooterComponent={
            <>
              <View style={styles.card}>
                {f.members.map((m, i) => (
                  <View key={m.id} style={[styles.perPersonRow, i < f.members.length - 1 && styles.rowBorder]}>
                    <MemberAvatar name={m.name} color={m.avatar_color} size={32} imageUri={m.image_uri} />
                    <Text style={styles.perPersonName} numberOfLines={1}>{m.name}</Text>
                    <Text style={styles.perPersonAmount}>{formatRupees(f.perPerson[m.id] ?? 0)}</Text>
                  </View>
                ))}
              </View>
              {f.unassignedTotal !== 0 && (
                <View style={styles.unassignedBanner}>
                  <View style={styles.unassignedBannerRow}>
                    <Feather name="alert-circle" size={16} color={colors.expense} />
                    <Text style={styles.unassignedBannerText}>
                      {formatRupees(Math.abs(f.unassignedTotal))} {f.unassignedTotal > 0 ? 'not assigned to anyone' : 'over-assigned'}
                    </Text>
                  </View>
                  {f.unassignedTotal > 0 && (
                    <TouchableOpacity style={styles.assignCta} onPress={f.splitRestEqually} accessibilityRole="button">
                      <Feather name="users" size={13} color={colors.healthAmber} />
                      <Text style={styles.assignCtaText}>Split {formatRupees(f.unassignedTotal)} equally →</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              <View style={styles.navRow}>
                <TouchableOpacity onPress={() => f.setStep('items')} style={styles.backBtn} accessibilityRole="button">
                  <Text style={styles.backBtnText}>Back</Text>
                </TouchableOpacity>
                <PrimaryButton label="Next: Payers" onPress={() => f.setStep('payers')} disabled={!f.canProceedAssign} style={{ flex: 1 }} />
              </View>
            </>
          }
        />
      )}

      {/* STEP 3: PAYERS */}
      {f.step === 'payers' && (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.fieldLabel}>Who paid? Must equal total {formatRupees(f.total)}</Text>
          <View style={styles.card}>
            {f.members.map((m, i) => (
              <View key={m.id} style={[styles.payerRow, i < f.members.length - 1 && styles.rowBorder]}>
                <MemberAvatar name={m.name} color={m.avatar_color} size={36} imageUri={m.image_uri} />
                <Text style={styles.payerName} numberOfLines={1}>{m.name}</Text>
                <View style={styles.payerInputWrap}>
                  <Text style={styles.rupee}>₹</Text>
                  <TextInput
                    style={styles.payerInput}
                    value={f.payerAmounts[m.id] ?? ''}
                    onChangeText={v => f.setPayerAmounts(prev => ({ ...prev, [m.id]: v }))}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              </View>
            ))}
          </View>
          <Text style={[styles.remainderText, { color: f.paymentRemainder === 0 ? colors.income : colors.expense }]}>
            {f.paymentRemainder === 0 ? 'Balanced' : f.paymentRemainder > 0 ? `${formatRupees(f.paymentRemainder)} remaining` : `${formatRupees(-f.paymentRemainder)} over`}
          </Text>

          <View style={styles.navRow}>
            <TouchableOpacity onPress={() => f.setStep('assign')} style={styles.backBtn} accessibilityRole="button">
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
            <PrimaryButton label="Review" onPress={() => f.setStep('review')} disabled={f.paymentRemainder !== 0 || f.payments.length === 0} style={{ flex: 1 }} />
          </View>
        </ScrollView>
      )}

      {/* STEP 4: REVIEW */}
      {f.step === 'review' && (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.fieldLabel}>Category</Text>
          <CategoryPicker
            categories={f.categories}
            value={f.selectedCategory}
            onChange={f.setSelectedCategory}
            onCreate={async (name) => {
              const created = await insertCategory(db, name, 'tag', colors.accent);
              f.setCategories(prev => [...prev, created]);
              return created;
            }}
          />

          <Text style={[styles.fieldLabel, { marginTop: space.sm }]}>Note</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="e.g. Dinner at Bikanervala (optional)"
            placeholderTextColor={colors.textMuted}
            value={f.note}
            onChangeText={f.setNote}
          />

          {/* How it was paid — the same picker Quick Add uses. Card vs cash is
              not cosmetic: lib/cash books card spend as debt, not cash out. */}
          <Text style={[styles.fieldLabel, { marginTop: space.sm }]}>Paid via</Text>
          <Chip
            icon="credit-card"
            label={PAY_METHOD_LABEL[f.payMethod]}
            chevron
            onPress={() => setShowPayMethod(true)}
          />

          {f.locEnabled && !f.isEditing && (
            <View style={styles.locRow}>
              <Feather name="map-pin" size={15} color={f.place ? colors.accent : colors.textMuted} />
              <Text style={styles.locText} numberOfLines={1}>
                {f.capturingLoc ? 'Locating…' : f.place?.label || (f.place ? 'Location tagged' : 'No location yet')}
              </Text>
              {f.place ? (
                <TouchableOpacity onPress={() => f.setPlace(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Remove location">
                  <Feather name="x" size={15} color={colors.textMuted} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={f.captureLocation} hitSlop={10} disabled={f.capturingLoc} accessibilityRole="button" accessibilityLabel="Capture location">
                  <Feather name="refresh-cw" size={14} color={colors.accent} />
                </TouchableOpacity>
              )}
            </View>
          )}

          <Text style={[styles.shareLabel, { marginTop: space.md }]}>YOUR SHARE</Text>
          <View style={styles.shareCard}>
            {f.members.filter(m => (f.perPerson[m.id] ?? 0) > 0).map((m, i, arr) => {
              const isMe = m.is_me === 1;
              return (
                <View key={m.id} style={[styles.perPersonRow, i < arr.length - 1 && styles.shareRowBorder]}>
                  <MemberAvatar name={m.name} color={m.avatar_color} size={32} imageUri={m.image_uri} />
                  <Text style={[styles.perPersonName, isMe && styles.shareNameMe]} numberOfLines={1}>
                    {m.name}{isMe ? ' (you)' : ''}
                  </Text>
                  <Text style={[styles.perPersonAmount, isMe && styles.shareAmountMe]}>{formatRupees(f.perPerson[m.id] ?? 0)}</Text>
                </View>
              );
            })}
          </View>

          <Text style={[styles.fieldLabel, { marginTop: space.md }]}>Paid by</Text>
          <View style={styles.card}>
            {f.payments.map((p, i) => {
              const m = f.members.find(m => m.id === p.personId);
              return m ? (
                <View key={p.personId} style={[styles.perPersonRow, i < f.payments.length - 1 && styles.rowBorder]}>
                  <MemberAvatar name={m.name} color={m.avatar_color} size={32} imageUri={m.image_uri} />
                  <Text style={styles.perPersonName} numberOfLines={1}>{m.name}</Text>
                  <Text style={styles.perPersonAmount}>{formatRupees(p.amount)}</Text>
                </View>
              ) : null;
            })}
          </View>

          <View style={styles.navRow}>
            <TouchableOpacity onPress={() => f.setStep('payers')} style={styles.backBtn} accessibilityRole="button">
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
            <PrimaryButton
              label="Log itemized expense"
              onPress={f.handleSave}
              loading={f.saving}
              disabled={!f.canSave || f.saving}
              style={{ flex: 1 }}
            />
          </View>
        </ScrollView>
      )}

      {/* Adjustment sheet — keyboard-safe */}
      <PayMethodSheet
        visible={showPayMethod}
        onClose={() => setShowPayMethod(false)}
        value={f.payMethod}
        onChange={f.setPayMethod}
        kind={AddKind.Expense}
      />

      <SheetModal visible={f.showAdjModal} onClose={() => f.setShowAdjModal(false)} title={`Add ${ADJUSTMENT_LABELS[f.adjType]}`}>
        <View style={styles.modeRow}>
          {(['percent', 'flat'] as const).map(m => (
            <TouchableOpacity
              key={m}
              style={[styles.modeBtn, f.adjMode === m && styles.modeBtnActive]}
              onPress={() => f.setAdjMode(m)}
              accessibilityRole="button"
              accessibilityState={{ selected: f.adjMode === m }}
            >
              <Text style={[styles.modeBtnText, f.adjMode === m && { color: colors.bg }]}>
                {m === 'percent' ? 'Percentage %' : 'Flat ₹'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={styles.adjInput}
          value={f.adjValue}
          onChangeText={f.setAdjValue}
          keyboardType="decimal-pad"
          placeholder={f.adjMode === 'percent' ? 'e.g. 5 (for 5%)' : 'Amount in ₹'}
          placeholderTextColor={colors.textMuted}
          autoFocus
          onSubmitEditing={f.addAdjustment}
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
        onAddItems={(drafts) => { f.addItems(drafts); f.setShowScanSheet(false); }}
      />

      {/* Blocks all interaction (incl. manual "Add item") for the duration of a scan */}
      <ScanningOverlay visible={f.scanning} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: layout.screenPaddingH, paddingBottom: space.sm, minHeight: 44 },
  title: { ...type.heading, color: colors.textPrimary },
  stepIndicator: { ...type.label, color: colors.textMuted },
  headerSave: { ...type.body, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  dots: { flexDirection: 'row', gap: 6, paddingHorizontal: layout.screenPaddingH, marginBottom: space.sm },
  dot: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.bgMuted },
  dotActive: { backgroundColor: colors.accent },
  totalCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: layout.screenPaddingH, marginBottom: space.sm, padding: space.md, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: 14 },
  totalCardLeft: { flexShrink: 1 },
  totalCardLabel: { ...type.caption, color: colors.textMuted, letterSpacing: 0.5 },
  totalCardAmount: { fontFamily: 'SpaceMono_400Regular', fontSize: 28, color: colors.textPrimary, marginTop: 2 },
  totalCardRight: { alignItems: 'flex-end', gap: 6, marginLeft: space.sm },
  totalCardMeta: { ...type.label, color: colors.textMuted },
  categoryChip: { flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: colors.bgMuted, paddingHorizontal: space.sm, paddingVertical: 5, borderRadius: radius.pill },
  categoryChipText: { ...type.caption, color: colors.textSecondary, fontFamily: 'Inter_600SemiBold' },
  scroll: { padding: layout.screenPaddingH, paddingBottom: space.xxl, gap: space.md },

  sectionLabel: { ...type.caption, color: colors.textMuted, letterSpacing: 0.5, marginBottom: -space.sm },
  addCardHeader: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: -space.sm },
  addCardHeaderText: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  addCard: { backgroundColor: colors.accentMuted, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.accent, borderStyle: 'dashed', padding: space.md, gap: space.sm },
  itemAvatars: { marginTop: 6 },
  addNameInput: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, borderWidth: 1, borderColor: colors.border },
  addRow2: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' },
  qtyWrap: { width: 64, gap: space.xs },
  priceWrap: { flex: 1, gap: space.xs },
  miniLabel: { ...type.caption, color: colors.textMuted, marginLeft: 2 },
  qtyInput: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, paddingHorizontal: space.sm, paddingVertical: space.sm, textAlign: 'center', borderWidth: 1, borderColor: colors.border },
  priceInput: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, borderWidth: 1, borderColor: colors.border },
  addBtn: { width: 48, height: 44, backgroundColor: colors.accent, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  addBtnDisabled: { opacity: 0.4 },

  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, ...shadow.sm },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  itemName: { ...type.body, color: colors.textPrimary },
  itemSub: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  itemTotal: { fontFamily: 'SpaceMono_400Regular', fontSize: 14, color: colors.textPrimary },
  itemEditName: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.sm, paddingVertical: space.sm },
  itemEditRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  itemEditQty: { width: 44, textAlign: 'center', ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingVertical: space.sm },
  itemEditTimes: { ...type.caption, color: colors.textMuted },
  itemEditPriceWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: colors.bgInput, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.sm },
  itemEditRupee: { ...type.body, color: colors.textMuted },
  itemEditPrice: { flex: 1, ...type.body, color: colors.textPrimary, paddingVertical: space.sm },
  itemDoneBtn: { width: 32, height: 32, borderRadius: radius.lg, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },

  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.sm },
  summaryLabel: { ...type.body, color: colors.textSecondary, flexShrink: 1 },
  summaryVal: { fontFamily: 'SpaceMono_400Regular', fontSize: 14, color: colors.textPrimary },
  adjChipRemove: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1 },
  summaryDivider: { height: 1, backgroundColor: colors.border },
  summaryTotalLabel: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  summaryTotalVal: { fontFamily: 'SpaceMono_400Regular', fontSize: 16, color: colors.accent },

  adjButtons: { flexDirection: 'row', gap: space.sm },
  adjBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingVertical: space.sm, borderRadius: radius.md, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  adjBtnText: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  hintText: { ...type.body, color: colors.textMuted, textAlign: 'center', paddingVertical: space.lg },
  nextBtn: { marginTop: space.sm },

  splitRestBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.accentMuted, marginBottom: space.md },
  splitRestText: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  assignItem: { backgroundColor: colors.bgCard, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  assignItemHeader: { flexDirection: 'row', alignItems: 'center', padding: space.md },
  unassignedTag: { ...type.caption, color: colors.expense, backgroundColor: alpha(colors.expense, 13), paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill },
  splitBody: { paddingHorizontal: space.md, paddingBottom: space.md, gap: space.sm },
  splitRemainder: { ...type.caption, color: colors.healthAmber, marginTop: 2 },
  sep: { height: space.sm },

  perPersonRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  perPersonName: { ...type.body, color: colors.textPrimary, flex: 1 },
  perPersonAmount: { fontFamily: 'SpaceMono_400Regular', fontSize: 14, color: colors.textPrimary },
  shareLabel: { ...type.caption, color: colors.settle, letterSpacing: 0.5, fontFamily: 'Inter_600SemiBold' },
  shareCard: { backgroundColor: alpha(colors.settle, 10), borderRadius: radius.lg, borderWidth: 1, borderColor: alpha(colors.settle, 27), paddingHorizontal: space.md, marginTop: space.sm },
  shareRowBorder: { borderBottomWidth: 1, borderBottomColor: alpha(colors.settle, 20) },
  shareNameMe: { color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  shareAmountMe: { color: colors.accent },
  unassignedBanner: { backgroundColor: alpha(colors.expense, 9), borderRadius: radius.md, borderWidth: 1, borderColor: alpha(colors.expense, 33), padding: space.sm, gap: space.xs },
  unassignedBannerRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  unassignedBannerText: { ...type.label, color: colors.expense, fontFamily: 'Inter_600SemiBold', flex: 1 },
  assignCta: { flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: alpha(colors.healthAmber, 13), borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: space.xs, alignSelf: 'flex-start', borderWidth: 1, borderColor: alpha(colors.healthAmber, 27) },
  assignCtaText: { ...type.caption, color: colors.healthAmber, fontFamily: 'Inter_600SemiBold' },

  navRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  backBtn: { height: 52, paddingHorizontal: space.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { ...type.button, color: colors.textSecondary },

  fieldLabel: { ...type.label, color: colors.textSecondary },
  noteInput: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm, paddingVertical: space.sm, paddingHorizontal: space.md, backgroundColor: colors.bgInput, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  locText: { ...type.body, color: colors.textSecondary, flex: 1 },
  payerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  payerName: { ...type.body, color: colors.textPrimary, flex: 1 },
  payerInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgInput, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.sm, minWidth: 96 },
  rupee: { ...type.body, color: colors.textMuted },
  payerInput: { ...type.body, color: colors.textPrimary, flex: 1, textAlign: 'right', paddingVertical: space.sm, paddingLeft: 2 },
  remainderText: { ...type.label, textAlign: 'center', fontFamily: 'Inter_600SemiBold' },

  modeRow: { flexDirection: 'row', gap: space.xs, backgroundColor: colors.bgMuted, borderRadius: radius.md, padding: 3 },
  modeBtn: { flex: 1, paddingVertical: space.sm, alignItems: 'center', borderRadius: radius.sm },
  modeBtnActive: { backgroundColor: colors.accent },
  modeBtnText: { ...type.label, color: colors.textSecondary, fontFamily: 'Inter_600SemiBold' },
  adjInput: { ...type.body, fontSize: 18, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border, textAlign: 'center' },
});
