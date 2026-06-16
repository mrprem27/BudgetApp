import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  FlatList, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../src/constants/colors';
import { type } from '../../src/constants/typography';
import { space, radius, layout, shadow } from '../../src/constants/layout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAllGroups } from '../../src/db/queries/groups';
import { getGroupMembers, getMe } from '../../src/db/queries/persons';
import { getCategoriesByFrequency, insertCategory } from '../../src/db/queries/categories';
import { insertItemizedTxn } from '../../src/db/queries/transactions';
import { parseToPaise, formatRupees, splitEqual } from '../../src/lib/money';
import { scanReceipt } from '../../src/lib/ocr';
import { PrimaryButton } from '../../src/components/ui/PrimaryButton';
import { MemberAvatar } from '../../src/components/finance/MemberAvatar';
import { CategoryPicker } from '../../src/components/finance/CategoryPicker';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { useFeatureFlags } from '../../src/components/system/FeatureFlagsProvider';
import { haptic } from '../../src/lib/haptics';
import type { Person } from '../../src/db/queries/persons';
import type { Category } from '../../src/db/queries/categories';
import type { BudgetGroup } from '../../src/db/queries/groups';

type Step = 'items' | 'assign' | 'payers' | 'review';

type LineItemDraft = {
  id: string;
  name: string;
  qty: string;
  unitPrice: string;
  assignedTo: string[];
};

type Adjustment = {
  label: string;
  type: 'tax' | 'tip' | 'discount';
  mode: 'flat' | 'percent';
  value: string;
};

const STEPS: Step[] = ['items', 'assign', 'payers', 'review'];

function computeAdjustedTotal(subtotal: number, adjustments: Adjustment[]): number {
  let total = subtotal;
  for (const adj of adjustments) {
    const val = parseToPaise(adj.value);
    const amount = adj.mode === 'percent' ? Math.round((subtotal * val) / 10000) : val;
    if (adj.type === 'discount') total -= amount;
    else total += amount;
  }
  return Math.max(0, total);
}

function computeItemSubtotal(item: LineItemDraft): number {
  const qty = parseInt(item.qty, 10) || 1;
  const price = parseToPaise(item.unitPrice);
  return qty * price;
}

function computePerPersonShares(
  items: LineItemDraft[],
  adjustments: Adjustment[],
  members: Person[],
): Record<string, number> {
  const subtotal = items.reduce((s, i) => s + computeItemSubtotal(i), 0);
  const total = computeAdjustedTotal(subtotal, adjustments);
  const ratio = subtotal > 0 ? total / subtotal : 1;

  const raw: Record<string, number> = {};
  for (const m of members) raw[m.id] = 0;

  for (const item of items) {
    if (item.assignedTo.length === 0) continue;
    const itemTotal = Math.round(computeItemSubtotal(item) * ratio);
    const splits = splitEqual(itemTotal, item.assignedTo.length);
    item.assignedTo.forEach((pid, i) => {
      raw[pid] = (raw[pid] ?? 0) + splits[i];
    });
  }

  const assigned = Object.values(raw).reduce((a, b) => a + b, 0);
  const unassignedItems = items.filter(i => i.assignedTo.length === 0);
  if (unassignedItems.length === 0) {
    let diff = total - assigned;
    for (const m of members) {
      if (diff === 0) break;
      if (raw[m.id] > 0) { raw[m.id] += diff > 0 ? 1 : -1; diff += diff > 0 ? -1 : 1; }
    }
  }

  return raw;
}

export default function ItemizedScreen() {
  const { groupId: paramGroupId } = useLocalSearchParams<{ groupId?: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { flags } = useFeatureFlags();

  const [step, setStep] = useState<Step>('items');
  const [selectedGroupId, setSelectedGroupId] = useState(paramGroupId ?? '');
  const [members, setMembers] = useState<Person[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [note, setNote] = useState('');
  const [items, setItems] = useState<LineItemDraft[]>([]);
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState('1');
  const [newPrice, setNewPrice] = useState('');
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [showAdjModal, setShowAdjModal] = useState(false);
  const [adjType, setAdjType] = useState<'tax' | 'tip' | 'discount'>('tax');
  const [adjMode, setAdjMode] = useState<'flat' | 'percent'>('percent');
  const [adjValue, setAdjValue] = useState('');
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const grps = await getAllGroups(db);
      const meRow = await getMe(db);
      const gid = paramGroupId ?? grps[0]?.id ?? '';
      setSelectedGroupId(gid);
      if (gid) await loadGroup(gid, meRow);
    })();
  }, []);

  async function loadGroup(gid: string, meRow: Person | null) {
    const [cats, mems] = await Promise.all([
      getCategoriesByFrequency(db, gid),
      getGroupMembers(db, gid),
    ]);
    setCategories(cats);
    setSelectedCategory(cats[0] ?? null);
    setMembers(mems);
    if (meRow) setPayerAmounts({ [meRow.id]: '' });
  }

  const subtotal = items.reduce((s, i) => s + computeItemSubtotal(i), 0);
  const total = computeAdjustedTotal(subtotal, adjustments);
  const perPerson = computePerPersonShares(items, adjustments, members);
  const sharesTotal = Object.values(perPerson).reduce((a, b) => a + b, 0);
  const unassignedTotal = total - sharesTotal;

  const payments = Object.entries(payerAmounts)
    .map(([pid, val]) => ({ personId: pid, amount: parseToPaise(val) }))
    .filter(p => p.amount > 0);
  const paymentsTotal = payments.reduce((s, p) => s + p.amount, 0);
  const paymentRemainder = total - paymentsTotal;

  function addItem() {
    if (!newName.trim() || !newPrice.trim()) return;
    setItems(prev => [...prev, {
      id: Math.random().toString(),
      name: newName.trim(),
      qty: newQty || '1',
      unitPrice: newPrice,
      assignedTo: [],
    }]);
    setNewName('');
    setNewQty('1');
    setNewPrice('');
  }

  async function handleScanReceipt() {
    const result = await scanReceipt('camera');
    if (!result) return;
    if (result.amount) {
      setItems(prev => [...prev, {
        id: Math.random().toString(),
        name: result.note || 'Scanned item',
        qty: '1',
        unitPrice: (result.amount! / 100).toString(),
        assignedTo: [],
      }]);
      haptic.success();
    }
  }

  function removeItem(id: string) { setItems(prev => prev.filter(i => i.id !== id)); }

  function toggleAssign(itemId: string, personId: string) {
    setItems(prev => prev.map(i => {
      if (i.id !== itemId) return i;
      const already = i.assignedTo.includes(personId);
      return { ...i, assignedTo: already ? i.assignedTo.filter(id => id !== personId) : [...i.assignedTo, personId] };
    }));
  }

  function splitRestEqually() {
    setItems(prev => prev.map(i => i.assignedTo.length === 0 ? { ...i, assignedTo: members.map(m => m.id) } : i));
  }

  function openAdj(t: 'tax' | 'tip' | 'discount') {
    setAdjType(t);
    setAdjMode(t === 'discount' ? 'flat' : 'percent');
    setAdjValue('');
    setShowAdjModal(true);
  }

  function addAdjustment() {
    if (!adjValue.trim()) return;
    setAdjustments(prev => [...prev, {
      label: adjType.charAt(0).toUpperCase() + adjType.slice(1),
      type: adjType, mode: adjMode, value: adjValue,
    }]);
    setShowAdjModal(false);
    setAdjValue('');
  }

  function removeAdjustment(idx: number) {
    setAdjustments(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      const shares = Object.entries(perPerson)
        .map(([personId, amount]) => ({ personId, amount }))
        .filter(s => s.amount > 0);

      await insertItemizedTxn(db, {
        groupId: selectedGroupId,
        kind: 'expense',
        entryMode: 'itemized',
        date: Date.now(),
        category: selectedCategory?.name ?? 'Other',
        note: note.trim() || undefined,
        payments,
        shares,
        items: items.map(i => ({
          name: i.name,
          qty: parseInt(i.qty, 10) || 1,
          unitPrice: parseToPaise(i.unitPrice),
          assignedTo: i.assignedTo,
        })),
      });
      router.back();
    } catch {
      Alert.alert('Error', 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const canProceedItems = items.length > 0 && total > 0;
  const canProceedAssign = unassignedTotal === 0;
  const canSave = canProceedAssign && paymentRemainder === 0 && payments.length > 0;

  const stepTitle = { items: 'Add items', assign: 'Assign items', payers: 'Who paid?', review: 'Review & save' }[step];

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
          <Feather name="x" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{stepTitle}</Text>
        </View>
        {step === 'items' && flags.itemizedOcr && (
          <TouchableOpacity onPress={handleScanReceipt} hitSlop={10} accessibilityRole="button" accessibilityLabel="Scan receipt" style={styles.scanBtn}>
            <Feather name="camera" size={18} color={colors.accent} />
          </TouchableOpacity>
        )}
        <Text style={styles.stepIndicator}>{STEPS.indexOf(step) + 1}/4</Text>
      </View>

      {/* Step progress dots */}
      <View style={styles.dots}>
        {STEPS.map((s, i) => (
          <View key={s} style={[styles.dot, STEPS.indexOf(step) >= i && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.totalBar}>
        <Text style={styles.totalLabel}>Bill total</Text>
        <Text style={styles.totalAmount}>{formatRupees(total)}</Text>
      </View>

      {/* STEP 1: ITEMS */}
      {step === 'items' && (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.addCard}>
            <TextInput
              style={styles.addNameInput}
              placeholder="Item name"
              placeholderTextColor={colors.textMuted}
              value={newName}
              onChangeText={setNewName}
              returnKeyType="next"
            />
            <View style={styles.addRow2}>
              <View style={styles.qtyWrap}>
                <Text style={styles.miniLabel}>Qty</Text>
                <TextInput
                  style={styles.qtyInput}
                  value={newQty}
                  onChangeText={setNewQty}
                  keyboardType="number-pad"
                  placeholder="1"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={styles.priceWrap}>
                <Text style={styles.miniLabel}>Unit price</Text>
                <TextInput
                  style={styles.priceInput}
                  value={newPrice}
                  onChangeText={setNewPrice}
                  keyboardType="decimal-pad"
                  placeholder="₹0"
                  placeholderTextColor={colors.textMuted}
                  onSubmitEditing={addItem}
                />
              </View>
              <TouchableOpacity
                style={[styles.addBtn, (!newName.trim() || !newPrice.trim()) && styles.addBtnDisabled]}
                onPress={addItem}
                disabled={!newName.trim() || !newPrice.trim()}
                accessibilityRole="button"
                accessibilityLabel="Add item"
              >
                <Feather name="plus" size={22} color={colors.bg} />
              </TouchableOpacity>
            </View>
          </View>

          {items.length > 0 && (
            <View style={styles.card}>
              {items.map((item, idx) => (
                <View key={item.id} style={[styles.itemRow, idx < items.length - 1 && styles.rowBorder]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.itemSub} numberOfLines={1}>
                      {item.qty} × {formatRupees(parseToPaise(item.unitPrice))}
                    </Text>
                  </View>
                  <Text style={styles.itemTotal}>{formatRupees(computeItemSubtotal(item))}</Text>
                  <TouchableOpacity onPress={() => removeItem(item.id)} hitSlop={8} accessibilityLabel="Remove item">
                    <Feather name="trash-2" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {items.length > 0 && (
            <View style={styles.card}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal</Text>
                <Text style={styles.summaryVal}>{formatRupees(subtotal)}</Text>
              </View>
              {adjustments.map((adj, i) => {
                const amt = adj.mode === 'percent'
                  ? Math.round((subtotal * parseToPaise(adj.value)) / 10000)
                  : parseToPaise(adj.value);
                return (
                  <View key={i} style={styles.summaryRow}>
                    <TouchableOpacity onPress={() => removeAdjustment(i)} hitSlop={6} style={styles.adjChipRemove}>
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
                <Text style={styles.summaryTotalVal}>{formatRupees(total)}</Text>
              </View>
            </View>
          )}

          {items.length > 0 && (
            <View style={styles.adjButtons}>
              {([['tax', 'plus', 'Tax'], ['tip', 'plus', 'Tip'], ['discount', 'minus', 'Discount']] as const).map(([t, ic, label]) => (
                <TouchableOpacity key={t} style={styles.adjBtn} onPress={() => openAdj(t)} accessibilityRole="button">
                  <Feather name={ic} size={13} color={colors.accent} />
                  <Text style={styles.adjBtnText}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {items.length === 0 && (
            <Text style={styles.hintText}>Add each line on the bill — name, quantity and unit price.</Text>
          )}

          <PrimaryButton label="Next: Assign items" onPress={() => setStep('assign')} disabled={!canProceedItems} style={styles.nextBtn} />
        </ScrollView>
      )}

      {/* STEP 2: ASSIGN */}
      {step === 'assign' && (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <TouchableOpacity style={styles.splitRestBtn} onPress={splitRestEqually} accessibilityRole="button">
              <Feather name="users" size={15} color={colors.accent} />
              <Text style={styles.splitRestText}>Split unassigned equally</Text>
            </TouchableOpacity>
          }
          renderItem={({ item }) => (
            <View style={styles.assignItem}>
              <TouchableOpacity style={styles.assignItemHeader} onPress={() => setExpandedItem(expandedItem === item.id ? null : item.id)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.itemSub}>{formatRupees(computeItemSubtotal(item))}</Text>
                </View>
                {item.assignedTo.length === 0
                  ? <Text style={styles.unassignedTag}>Unassigned</Text>
                  : <View style={styles.assignedAvatars}>
                      {item.assignedTo.slice(0, 3).map(pid => {
                        const m = members.find(m => m.id === pid);
                        return m ? <MemberAvatar key={pid} name={m.name} color={m.avatar_color} size={24} /> : null;
                      })}
                      {item.assignedTo.length > 3 && <Text style={styles.moreCount}>+{item.assignedTo.length - 3}</Text>}
                    </View>
                }
                <Feather name={expandedItem === item.id ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} style={{ marginLeft: space.sm }} />
              </TouchableOpacity>
              {expandedItem === item.id && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.avatarRow} keyboardShouldPersistTaps="handled">
                  {members.map(m => (
                    <View key={m.id} style={styles.avatarCol}>
                      <MemberAvatar name={m.name} color={m.avatar_color} size={40} selected={item.assignedTo.includes(m.id)} onPress={() => toggleAssign(item.id, m.id)} />
                      <Text style={styles.avatarName} numberOfLines={1}>{m.name.split(' ')[0]}</Text>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListFooterComponent={
            <>
              <View style={styles.card}>
                {members.map((m, i) => (
                  <View key={m.id} style={[styles.perPersonRow, i < members.length - 1 && styles.rowBorder]}>
                    <MemberAvatar name={m.name} color={m.avatar_color} size={32} />
                    <Text style={styles.perPersonName} numberOfLines={1}>{m.name}</Text>
                    <Text style={styles.perPersonAmount}>{formatRupees(perPerson[m.id] ?? 0)}</Text>
                  </View>
                ))}
              </View>
              {unassignedTotal !== 0 && (
                <Text style={styles.unassignedWarn}>{formatRupees(Math.abs(unassignedTotal))} unassigned</Text>
              )}
              <View style={styles.navRow}>
                <TouchableOpacity onPress={() => setStep('items')} style={styles.backBtn} accessibilityRole="button">
                  <Text style={styles.backBtnText}>Back</Text>
                </TouchableOpacity>
                <PrimaryButton label="Next: Payers" onPress={() => setStep('payers')} disabled={!canProceedAssign} style={{ flex: 1 }} />
              </View>
            </>
          }
        />
      )}

      {/* STEP 3: PAYERS */}
      {step === 'payers' && (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.fieldLabel}>Who paid? Must total {formatRupees(total)}</Text>
          <View style={styles.card}>
            {members.map((m, i) => (
              <View key={m.id} style={[styles.payerRow, i < members.length - 1 && styles.rowBorder]}>
                <MemberAvatar name={m.name} color={m.avatar_color} size={36} />
                <Text style={styles.payerName} numberOfLines={1}>{m.name}</Text>
                <View style={styles.payerInputWrap}>
                  <Text style={styles.rupee}>₹</Text>
                  <TextInput
                    style={styles.payerInput}
                    value={payerAmounts[m.id] ?? ''}
                    onChangeText={v => setPayerAmounts(prev => ({ ...prev, [m.id]: v }))}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              </View>
            ))}
          </View>
          <Text style={[styles.remainderText, { color: paymentRemainder === 0 ? colors.income : colors.expense }]}>
            {paymentRemainder === 0 ? 'Balanced' : paymentRemainder > 0 ? `${formatRupees(paymentRemainder)} remaining` : `${formatRupees(-paymentRemainder)} over`}
          </Text>

          <View style={styles.navRow}>
            <TouchableOpacity onPress={() => setStep('assign')} style={styles.backBtn} accessibilityRole="button">
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
            <PrimaryButton label="Review" onPress={() => setStep('review')} disabled={paymentRemainder !== 0 || payments.length === 0} style={{ flex: 1 }} />
          </View>
        </ScrollView>
      )}

      {/* STEP 4: REVIEW */}
      {step === 'review' && (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.fieldLabel}>Category</Text>
          <CategoryPicker
            categories={categories}
            value={selectedCategory}
            onChange={setSelectedCategory}
            onCreate={async (name) => {
              const created = await insertCategory(db, selectedGroupId, name, 'tag', colors.accent);
              setCategories(prev => [...prev, created]);
              return created;
            }}
          />

          <Text style={[styles.fieldLabel, { marginTop: space.sm }]}>Note</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="e.g. Dinner at Bikanervala (optional)"
            placeholderTextColor={colors.textMuted}
            value={note}
            onChangeText={setNote}
          />

          <Text style={[styles.fieldLabel, { marginTop: space.md }]}>Each person owes</Text>
          <View style={styles.card}>
            {members.filter(m => (perPerson[m.id] ?? 0) > 0).map((m, i, arr) => (
              <View key={m.id} style={[styles.perPersonRow, i < arr.length - 1 && styles.rowBorder]}>
                <MemberAvatar name={m.name} color={m.avatar_color} size={32} />
                <Text style={styles.perPersonName} numberOfLines={1}>{m.name}</Text>
                <Text style={styles.perPersonAmount}>{formatRupees(perPerson[m.id] ?? 0)}</Text>
              </View>
            ))}
          </View>

          <Text style={[styles.fieldLabel, { marginTop: space.md }]}>Paid by</Text>
          <View style={styles.card}>
            {payments.map((p, i) => {
              const m = members.find(m => m.id === p.personId);
              return m ? (
                <View key={p.personId} style={[styles.perPersonRow, i < payments.length - 1 && styles.rowBorder]}>
                  <MemberAvatar name={m.name} color={m.avatar_color} size={32} />
                  <Text style={styles.perPersonName} numberOfLines={1}>{m.name}</Text>
                  <Text style={styles.perPersonAmount}>{formatRupees(p.amount)}</Text>
                </View>
              ) : null;
            })}
          </View>

          <View style={styles.navRow}>
            <TouchableOpacity onPress={() => setStep('payers')} style={styles.backBtn} accessibilityRole="button">
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
            <PrimaryButton label="Save Bill" onPress={handleSave} loading={saving} disabled={!canSave} style={{ flex: 1 }} />
          </View>
        </ScrollView>
      )}

      {/* Adjustment sheet — keyboard-safe */}
      <SheetModal visible={showAdjModal} onClose={() => setShowAdjModal(false)} title={`Add ${adjType}`}>
        <View style={styles.modeRow}>
          {(['percent', 'flat'] as const).map(m => (
            <TouchableOpacity
              key={m}
              style={[styles.modeBtn, adjMode === m && styles.modeBtnActive]}
              onPress={() => setAdjMode(m)}
              accessibilityRole="button"
              accessibilityState={{ selected: adjMode === m }}
            >
              <Text style={[styles.modeBtnText, adjMode === m && { color: colors.bg }]}>
                {m === 'percent' ? 'Percentage %' : 'Flat ₹'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={styles.adjInput}
          value={adjValue}
          onChangeText={setAdjValue}
          keyboardType="decimal-pad"
          placeholder={adjMode === 'percent' ? 'e.g. 5 (for 5%)' : 'Amount in ₹'}
          placeholderTextColor={colors.textMuted}
          autoFocus
          onSubmitEditing={addAdjustment}
        />
        <PrimaryButton label="Add" onPress={addAdjustment} disabled={!adjValue.trim()} />
      </SheetModal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: layout.screenPaddingH, paddingBottom: space.sm },
  title: { ...type.heading, color: colors.textPrimary },
  scanBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  stepIndicator: { ...type.label, color: colors.textMuted },
  dots: { flexDirection: 'row', gap: 6, paddingHorizontal: layout.screenPaddingH, marginBottom: space.sm },
  dot: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.bgMuted },
  dotActive: { backgroundColor: colors.accent },
  totalBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: layout.screenPaddingH, paddingVertical: space.sm, backgroundColor: colors.bgCard, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  totalLabel: { ...type.label, color: colors.textSecondary },
  totalAmount: { fontFamily: 'SpaceMono_400Regular', fontSize: 20, color: colors.accent },
  scroll: { padding: layout.screenPaddingH, paddingBottom: 48, gap: space.md },

  addCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm, ...shadow.sm },
  addNameInput: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, borderWidth: 1, borderColor: colors.border },
  addRow2: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' },
  qtyWrap: { width: 64, gap: 4 },
  priceWrap: { flex: 1, gap: 4 },
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
  unassignedTag: { ...type.caption, color: colors.expense, backgroundColor: colors.expense + '22', paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill },
  assignedAvatars: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  moreCount: { ...type.caption, color: colors.textSecondary, marginLeft: 4 },
  avatarRow: { paddingHorizontal: space.md, paddingBottom: space.md },
  avatarCol: { alignItems: 'center', gap: 4, marginRight: space.md, width: 52 },
  avatarName: { ...type.caption, color: colors.textSecondary, maxWidth: 52 },
  sep: { height: space.sm },

  perPersonRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  perPersonName: { ...type.body, color: colors.textPrimary, flex: 1 },
  perPersonAmount: { fontFamily: 'SpaceMono_400Regular', fontSize: 14, color: colors.textPrimary },
  unassignedWarn: { ...type.label, color: colors.expense, textAlign: 'center', fontFamily: 'Inter_600SemiBold' },

  navRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  backBtn: { height: 52, paddingHorizontal: space.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { ...type.button, color: colors.textSecondary },

  fieldLabel: { ...type.label, color: colors.textSecondary },
  noteInput: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border },
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
