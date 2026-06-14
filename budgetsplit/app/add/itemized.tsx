import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  FlatList, ScrollView, Alert, Modal, Pressable, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../src/constants/colors';
import { type } from '../../src/constants/typography';
import { space, radius, layout } from '../../src/constants/layout';
import { getAllGroups } from '../../src/db/queries/groups';
import { getGroupMembers, getMe } from '../../src/db/queries/persons';
import { getCategoriesForGroup } from '../../src/db/queries/categories';
import { insertItemizedTxn } from '../../src/db/queries/transactions';
import { parseToPaise, formatRupees, splitEqual } from '../../src/lib/money';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { MemberAvatar } from '../../src/components/MemberAvatar';
import { CategoryChip } from '../../src/components/CategoryChip';
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

  // Reconcile to exact total
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

  const [step, setStep] = useState<Step>('items');
  const [groups, setGroups] = useState<BudgetGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState(paramGroupId ?? '');
  const [members, setMembers] = useState<Person[]>([]);
  const [me, setMe] = useState<Person | null>(null);
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
      setGroups(grps);
      const meRow = await getMe(db);
      setMe(meRow);
      const gid = paramGroupId ?? grps[0]?.id ?? '';
      setSelectedGroupId(gid);
      if (gid) await loadGroup(gid, meRow);
    })();
  }, []);

  async function loadGroup(gid: string, meRow: Person | null) {
    const [cats, mems] = await Promise.all([
      getCategoriesForGroup(db, gid),
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

  function removeItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id));
  }

  function toggleAssign(itemId: string, personId: string) {
    setItems(prev => prev.map(i => {
      if (i.id !== itemId) return i;
      const already = i.assignedTo.includes(personId);
      return {
        ...i,
        assignedTo: already
          ? i.assignedTo.filter(id => id !== personId)
          : [...i.assignedTo, personId],
      };
    }));
  }

  function splitRestEqually() {
    setItems(prev => prev.map(i =>
      i.assignedTo.length === 0
        ? { ...i, assignedTo: members.map(m => m.id) }
        : i,
    ));
  }

  function addAdjustment() {
    if (!adjValue.trim()) return;
    setAdjustments(prev => [...prev, {
      label: adjType.charAt(0).toUpperCase() + adjType.slice(1),
      type: adjType,
      mode: adjMode,
      value: adjValue,
    }]);
    setShowAdjModal(false);
    setAdjValue('');
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

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="x" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Itemized Bill</Text>
        <Text style={styles.stepIndicator}>{['items','assign','payers','review'].indexOf(step) + 1}/4</Text>
      </View>

      <View style={styles.totalBar}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalAmount}>{formatRupees(total)}</Text>
      </View>

      {/* STEP 1: ITEMS */}
      {step === 'items' && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.addRow}>
            <TextInput
              style={[styles.input, { flex: 2 }]}
              placeholder="Item name"
              placeholderTextColor={colors.textMuted}
              value={newName}
              onChangeText={setNewName}
            />
            <TextInput
              style={[styles.input, { width: 48 }]}
              placeholder="Qty"
              placeholderTextColor={colors.textMuted}
              value={newQty}
              onChangeText={setNewQty}
              keyboardType="number-pad"
            />
            <TextInput
              style={[styles.input, { width: 90 }]}
              placeholder="₹Price"
              placeholderTextColor={colors.textMuted}
              value={newPrice}
              onChangeText={setNewPrice}
              keyboardType="decimal-pad"
            />
            <TouchableOpacity
              style={styles.addBtn}
              onPress={addItem}
              disabled={!newName.trim() || !newPrice.trim()}
              accessibilityRole="button"
              accessibilityLabel="Add item"
            >
              <Feather name="plus" size={20} color={colors.bg} />
            </TouchableOpacity>
          </View>

          {items.map(item => (
            <View key={item.id} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemSub}>
                  {item.qty} × {formatRupees(parseToPaise(item.unitPrice))} = {formatRupees(computeItemSubtotal(item))}
                </Text>
              </View>
              <TouchableOpacity onPress={() => removeItem(item.id)} accessibilityLabel="Remove item">
                <Feather name="trash-2" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          ))}

          {items.length > 0 && (
            <>
              <View style={styles.subtotalRow}>
                <Text style={styles.subtotalLabel}>Subtotal</Text>
                <Text style={styles.subtotalAmount}>{formatRupees(subtotal)}</Text>
              </View>
              {adjustments.map((adj, i) => (
                <View key={i} style={styles.adjRow}>
                  <Text style={styles.adjLabel}>{adj.label} ({adj.mode === 'percent' ? adj.value + '%' : formatRupees(parseToPaise(adj.value))})</Text>
                  <Text style={[styles.adjAmount, { color: adj.type === 'discount' ? colors.income : colors.expense }]}>
                    {adj.type === 'discount' ? '-' : '+'}{formatRupees(
                      adj.mode === 'percent'
                        ? Math.round((subtotal * parseToPaise(adj.value)) / 10000)
                        : parseToPaise(adj.value)
                    )}
                  </Text>
                </View>
              ))}
              <View style={styles.adjButtons}>
                <TouchableOpacity style={styles.adjBtn} onPress={() => { setAdjType('tax'); setShowAdjModal(true); }}>
                  <Text style={styles.adjBtnText}>+ Tax</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.adjBtn} onPress={() => { setAdjType('tip'); setShowAdjModal(true); }}>
                  <Text style={styles.adjBtnText}>+ Tip</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.adjBtn} onPress={() => { setAdjType('discount'); setShowAdjModal(true); }}>
                  <Text style={styles.adjBtnText}>- Discount</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <PrimaryButton
            label="Next: Assign Items"
            onPress={() => setStep('assign')}
            disabled={!canProceedItems}
            style={styles.nextBtn}
          />
        </ScrollView>
      )}

      {/* STEP 2: ASSIGN */}
      {step === 'assign' && (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          contentContainerStyle={styles.scroll}
          ListHeaderComponent={
            <TouchableOpacity style={styles.splitRestBtn} onPress={splitRestEqually} accessibilityRole="button">
              <Feather name="users" size={14} color={colors.accent} />
              <Text style={styles.splitRestText}>Split unassigned equally</Text>
            </TouchableOpacity>
          }
          renderItem={({ item }) => (
            <View style={styles.assignItem}>
              <TouchableOpacity
                style={styles.assignItemHeader}
                onPress={() => setExpandedItem(expandedItem === item.id ? null : item.id)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemSub}>{formatRupees(computeItemSubtotal(item))}</Text>
                </View>
                {item.assignedTo.length === 0
                  ? <Text style={styles.unassignedTag}>Unassigned</Text>
                  : <View style={styles.assignedAvatars}>
                      {item.assignedTo.slice(0, 3).map(pid => {
                        const m = members.find(m => m.id === pid);
                        return m ? <MemberAvatar key={pid} name={m.name} color={m.avatar_color} size={24} /> : null;
                      })}
                    </View>
                }
              </TouchableOpacity>
              {expandedItem === item.id && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.avatarRow}>
                  {members.map(m => (
                    <View key={m.id} style={styles.avatarCol}>
                      <MemberAvatar
                        name={m.name}
                        color={m.avatar_color}
                        size={40}
                        selected={item.assignedTo.includes(m.id)}
                        onPress={() => toggleAssign(item.id, m.id)}
                      />
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
              <View style={styles.perPersonFooter}>
                {members.map(m => (
                  <View key={m.id} style={styles.perPersonRow}>
                    <MemberAvatar name={m.name} color={m.avatar_color} size={32} />
                    <Text style={styles.perPersonName}>{m.name}</Text>
                    <Text style={styles.perPersonAmount}>{formatRupees(perPerson[m.id] ?? 0)}</Text>
                  </View>
                ))}
                {unassignedTotal > 0 && (
                  <Text style={styles.unassignedWarn}>{formatRupees(unassignedTotal)} unassigned</Text>
                )}
              </View>
              <View style={styles.navRow}>
                <TouchableOpacity onPress={() => setStep('items')} style={styles.backBtn} accessibilityRole="button">
                  <Text style={styles.backBtnText}>Back</Text>
                </TouchableOpacity>
                <PrimaryButton
                  label="Next: Payers"
                  onPress={() => setStep('payers')}
                  disabled={!canProceedAssign}
                  style={{ flex: 1 }}
                />
              </View>
            </>
          }
        />
      )}

      {/* STEP 3: PAYERS */}
      {step === 'payers' && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.fieldLabel}>Who paid? (must total {formatRupees(total)})</Text>
          {members.map(m => (
            <View key={m.id} style={styles.payerRow}>
              <MemberAvatar name={m.name} color={m.avatar_color} size={36} />
              <Text style={styles.payerName}>{m.name}</Text>
              <TextInput
                style={styles.payerInput}
                value={payerAmounts[m.id] ?? ''}
                onChangeText={v => setPayerAmounts(prev => ({ ...prev, [m.id]: v }))}
                keyboardType="decimal-pad"
                placeholder="₹0"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          ))}
          <Text style={[styles.remainderText, { color: paymentRemainder === 0 ? colors.income : colors.expense }]}>
            {paymentRemainder === 0 ? 'Balanced' : paymentRemainder > 0 ? `${formatRupees(paymentRemainder)} remaining` : `${formatRupees(-paymentRemainder)} over`}
          </Text>

          <Text style={[styles.fieldLabel, { marginTop: space.md }]}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipRow}>
              {categories.map(c => (
                <CategoryChip key={c.id} category={c} selected={selectedCategory?.id === c.id} onPress={() => setSelectedCategory(c)} />
              ))}
            </View>
          </ScrollView>

          <TextInput
            style={[styles.input, { marginTop: space.sm }]}
            placeholder="Note (optional)"
            placeholderTextColor={colors.textMuted}
            value={note}
            onChangeText={setNote}
          />

          <View style={styles.navRow}>
            <TouchableOpacity onPress={() => setStep('assign')} style={styles.backBtn} accessibilityRole="button">
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
            <PrimaryButton
              label="Review"
              onPress={() => setStep('review')}
              disabled={paymentRemainder !== 0 || payments.length === 0}
              style={{ flex: 1 }}
            />
          </View>
        </ScrollView>
      )}

      {/* STEP 4: REVIEW */}
      {step === 'review' && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.sectionTitle}>Per person</Text>
          {members.filter(m => (perPerson[m.id] ?? 0) > 0).map(m => (
            <View key={m.id} style={styles.perPersonRow}>
              <MemberAvatar name={m.name} color={m.avatar_color} size={36} />
              <Text style={styles.perPersonName}>{m.name}</Text>
              <Text style={styles.perPersonAmount}>{formatRupees(perPerson[m.id] ?? 0)}</Text>
            </View>
          ))}

          <Text style={[styles.sectionTitle, { marginTop: space.md }]}>Payers</Text>
          {payments.map(p => {
            const m = members.find(m => m.id === p.personId);
            return m ? (
              <View key={p.personId} style={styles.perPersonRow}>
                <MemberAvatar name={m.name} color={m.avatar_color} size={36} />
                <Text style={styles.perPersonName}>{m.name}</Text>
                <Text style={styles.perPersonAmount}>{formatRupees(p.amount)}</Text>
              </View>
            ) : null;
          })}

          <View style={styles.totalBar}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalAmount}>{formatRupees(total)}</Text>
          </View>

          <View style={styles.navRow}>
            <TouchableOpacity onPress={() => setStep('payers')} style={styles.backBtn} accessibilityRole="button">
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
            <PrimaryButton label="Save" onPress={handleSave} loading={saving} disabled={!canSave} style={{ flex: 1 }} />
          </View>
        </ScrollView>
      )}

      {/* Adjustment Modal */}
      <Modal visible={showAdjModal} transparent animationType="slide" onRequestClose={() => setShowAdjModal(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowAdjModal(false)}>
          <Pressable style={styles.adjModal} onPress={e => e.stopPropagation()}>
            <Text style={styles.adjModalTitle}>
              {adjType.charAt(0).toUpperCase() + adjType.slice(1)}
            </Text>
            <View style={styles.modeRow}>
              {(['percent', 'flat'] as const).map(m => (
                <TouchableOpacity
                  key={m}
                  style={[styles.modeBtn, adjMode === m && styles.modeBtnActive]}
                  onPress={() => setAdjMode(m)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.modeBtnText, adjMode === m && { color: colors.bg }]}>
                    {m === 'percent' ? '%' : '₹ Flat'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.input}
              value={adjValue}
              onChangeText={setAdjValue}
              keyboardType="decimal-pad"
              placeholder={adjMode === 'percent' ? 'e.g. 5 for 5%' : 'Amount in ₹'}
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            <TouchableOpacity style={styles.adjSaveBtn} onPress={addAdjustment} accessibilityRole="button">
              <Text style={styles.adjSaveBtnText}>Add</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: layout.screenPaddingH, paddingTop: space.xl },
  title: { ...type.heading, color: colors.textPrimary },
  stepIndicator: { ...type.label, color: colors.textMuted },
  totalBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: layout.screenPaddingH, paddingVertical: space.sm, backgroundColor: colors.bgCard, borderBottomWidth: 1, borderColor: colors.border },
  totalLabel: { ...type.label, color: colors.textSecondary },
  totalAmount: { fontFamily: 'SpaceMono_400Regular', fontSize: 20, color: colors.accent },
  scroll: { padding: layout.screenPaddingH, paddingBottom: 40, gap: space.sm },
  addRow: { flexDirection: 'row', gap: space.xs, alignItems: 'center' },
  input: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.sm, padding: space.sm, borderWidth: 1, borderColor: colors.border },
  addBtn: { width: 40, height: 40, backgroundColor: colors.accent, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
  itemName: { ...type.body, color: colors.textPrimary },
  itemSub: { ...type.caption, color: colors.textSecondary },
  subtotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.xs, borderTopWidth: 1, borderColor: colors.border },
  subtotalLabel: { ...type.label, color: colors.textSecondary },
  subtotalAmount: { fontFamily: 'SpaceMono_400Regular', fontSize: 14, color: colors.textPrimary },
  adjRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  adjLabel: { ...type.caption, color: colors.textSecondary },
  adjAmount: { fontFamily: 'SpaceMono_400Regular', fontSize: 12 },
  adjButtons: { flexDirection: 'row', gap: space.xs },
  adjBtn: { paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  adjBtnText: { ...type.caption, color: colors.accent },
  nextBtn: { marginTop: space.md },
  splitRestBtn: { flexDirection: 'row', alignItems: 'center', gap: space.xs, padding: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', marginBottom: space.sm },
  splitRestText: { ...type.label, color: colors.accent },
  assignItem: { backgroundColor: colors.bgCard, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  assignItemHeader: { flexDirection: 'row', alignItems: 'center', padding: space.md },
  unassignedTag: { ...type.caption, color: colors.expense, backgroundColor: colors.expense + '22', paddingHorizontal: space.xs, paddingVertical: 2, borderRadius: radius.pill },
  assignedAvatars: { flexDirection: 'row', gap: 2 },
  avatarRow: { paddingHorizontal: space.md, paddingBottom: space.sm },
  avatarCol: { alignItems: 'center', gap: 4, marginRight: space.md },
  avatarName: { ...type.caption, color: colors.textSecondary, maxWidth: 48 },
  sep: { height: space.xs },
  perPersonFooter: { marginTop: space.md, gap: space.xs },
  perPersonRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
  perPersonName: { ...type.body, color: colors.textPrimary, flex: 1 },
  perPersonAmount: { fontFamily: 'SpaceMono_400Regular', fontSize: 14, color: colors.textPrimary },
  unassignedWarn: { ...type.label, color: colors.expense, textAlign: 'center', marginTop: space.sm },
  navRow: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
  backBtn: { height: 52, paddingHorizontal: space.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { ...type.button, color: colors.textSecondary },
  fieldLabel: { ...type.label, color: colors.textSecondary },
  chipRow: { flexDirection: 'row', gap: space.xs, paddingBottom: space.xs },
  payerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  payerName: { ...type.body, color: colors.textPrimary, flex: 1 },
  payerInput: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: space.xs, width: 90, textAlign: 'right', borderWidth: 1, borderColor: colors.border },
  remainderText: { ...type.label, textAlign: 'center', fontFamily: 'Inter_600SemiBold' },
  sectionTitle: { ...type.subheading, color: colors.textPrimary, marginBottom: space.sm },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  adjModal: { backgroundColor: colors.bgCard, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg, gap: space.md },
  adjModalTitle: { ...type.subheading, color: colors.textPrimary },
  modeRow: { flexDirection: 'row', gap: space.xs, backgroundColor: colors.bgMuted, borderRadius: radius.md, padding: 3 },
  modeBtn: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: radius.sm },
  modeBtnActive: { backgroundColor: colors.accent },
  modeBtnText: { ...type.label, color: colors.textSecondary },
  adjSaveBtn: { height: 52, backgroundColor: colors.accent, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  adjSaveBtnText: { ...type.button, color: colors.bg },
});
