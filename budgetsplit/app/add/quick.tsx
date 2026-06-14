import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ScrollView, Alert, Modal, Pressable, FlatList, Switch,
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
import { insertTxn } from '../../src/db/queries/transactions';
import { parseToPaise, formatRupees, splitEqual, splitByPercent, splitByShares } from '../../src/lib/money';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { CategoryChip } from '../../src/components/CategoryChip';
import { MemberAvatar } from '../../src/components/MemberAvatar';
import { AmountText } from '../../src/components/AmountText';
import type { BudgetGroup } from '../../src/db/queries/groups';
import type { Person } from '../../src/db/queries/persons';
import type { Category } from '../../src/db/queries/categories';

type SplitType = 'equal' | 'exact' | 'percent' | 'shares';

export default function QuickAddScreen() {
  const { groupId: paramGroupId, kind: paramKind } = useLocalSearchParams<{ groupId?: string; kind?: string }>();
  const db = useSQLiteContext();
  const router = useRouter();

  const [groups, setGroups] = useState<BudgetGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState(paramGroupId ?? '');
  const [kind, setKind] = useState<'income' | 'expense'>(paramKind === 'income' ? 'income' : 'expense');
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [members, setMembers] = useState<Person[]>([]);
  const [me, setMe] = useState<Person | null>(null);
  const [showSplit, setShowSplit] = useState(false);
  const [splitType, setSplitType] = useState<SplitType>('equal');
  const [splitMembers, setSplitMembers] = useState<string[]>([]);
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [percentages, setPercentages] = useState<Record<string, string>>({});
  const [ratios, setRatios] = useState<Record<string, string>>({});
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [recurEnabled, setRecurEnabled] = useState(false);
  const [recurFreq, setRecurFreq] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('monthly');
  const [recurInterval, setRecurInterval] = useState('1');
  const [recurEndText, setRecurEndText] = useState('');

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
    const me_ = meRow ?? me;
    setSplitMembers(mems.map(m => m.id));
    if (me_) setPayerAmounts({ [me_.id]: '' });
  }

  const total = parseToPaise(amountText);

  function computeShares(): Array<{ personId: string; amount: number }> {
    const selected = members.filter(m => splitMembers.includes(m.id));
    if (selected.length === 0) return [];

    if (splitType === 'equal') {
      const amounts = splitEqual(total, selected.length);
      return selected.map((m, i) => ({ personId: m.id, amount: amounts[i] }));
    }
    if (splitType === 'exact') {
      return selected.map(m => ({ personId: m.id, amount: parseToPaise(exactAmounts[m.id] ?? '0') }));
    }
    if (splitType === 'percent') {
      const pcts = selected.map(m => parseInt(percentages[m.id] ?? '0', 10));
      const amounts = splitByPercent(total, pcts);
      return selected.map((m, i) => ({ personId: m.id, amount: amounts[i] }));
    }
    if (splitType === 'shares') {
      const rs = selected.map(m => parseInt(ratios[m.id] ?? '1', 10));
      const amounts = splitByShares(total, rs);
      return selected.map((m, i) => ({ personId: m.id, amount: amounts[i] }));
    }
    return [];
  }

  function computePayments(): Array<{ personId: string; amount: number }> {
    if (!me) return [];
    const payers = Object.entries(payerAmounts)
      .map(([pid, val]) => ({ personId: pid, amount: parseToPaise(val) }))
      .filter(p => p.amount > 0);
    if (payers.length === 0 && me) {
      return [{ personId: me.id, amount: total }];
    }
    return payers;
  }

  const shares = kind === 'income' ? [] : computeShares();
  const payments = computePayments();
  const sharesTotal = shares.reduce((s, x) => s + x.amount, 0);
  const paymentsTotal = payments.reduce((s, x) => s + x.amount, 0);
  const remainder = total - sharesTotal;
  const paymentRemainder = total - paymentsTotal;

  const canSave = total > 0
    && selectedCategory !== null
    && selectedGroupId !== ''
    && (kind === 'income' || (remainder === 0 && paymentRemainder === 0))
    && (kind === 'income' ? paymentsTotal === total : true);

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const finalPayments = kind === 'income'
        ? [{ personId: me!.id, amount: total }]
        : payments;
      const finalShares = kind === 'income'
        ? []
        : shares;

      let recurEnd: number | undefined;
      if (recurEnabled && recurEndText) {
        const d = new Date(recurEndText);
        if (!isNaN(d.getTime())) recurEnd = d.getTime();
      }

      await insertTxn(db, {
        groupId: selectedGroupId,
        kind,
        entryMode: 'quick',
        date: Date.now(),
        category: selectedCategory!.name,
        note: note.trim() || undefined,
        recurFreq: recurEnabled ? recurFreq : undefined,
        recurInterval: recurEnabled && recurFreq === 'custom' ? parseInt(recurInterval, 10) || 1 : undefined,
        recurEnd,
        payments: finalPayments,
        shares: finalShares,
      });
      router.back();
    } catch (e) {
      Alert.alert('Error', 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="x" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>{kind === 'income' ? 'Add Income' : 'Add Expense'}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.kindRow}>
          {(['expense', 'income'] as const).map(k => (
            <TouchableOpacity
              key={k}
              style={[styles.kindBtn, kind === k && styles.kindActive]}
              onPress={() => setKind(k)}
              accessibilityRole="button"
              accessibilityLabel={k}
              accessibilityState={{ selected: kind === k }}
            >
              <Text style={[styles.kindLabel, kind === k && styles.kindLabelActive]}>
                {k.charAt(0).toUpperCase() + k.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          style={styles.amountInput}
          value={amountText}
          onChangeText={setAmountText}
          keyboardType="decimal-pad"
          placeholder="₹0.00"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Amount"
        />

        {groups.length > 1 && (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Group</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipRow}>
                {groups.map(g => (
                  <TouchableOpacity
                    key={g.id}
                    style={[styles.groupChip, selectedGroupId === g.id && styles.groupChipActive]}
                    onPress={async () => { setSelectedGroupId(g.id); await loadGroup(g.id, me); }}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.groupChipText, selectedGroupId === g.id && { color: colors.bg }]}>{g.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipRow}>
              {categories.map(c => (
                <CategoryChip
                  key={c.id}
                  category={c}
                  selected={selectedCategory?.id === c.id}
                  onPress={() => setSelectedCategory(c)}
                />
              ))}
            </View>
          </ScrollView>
        </View>

        <TextInput
          style={styles.noteInput}
          value={note}
          onChangeText={setNote}
          placeholder="Note (optional)"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Note"
        />

        <View style={styles.recurRow}>
          <Text style={styles.fieldLabel}>Repeat</Text>
          <Switch
            value={recurEnabled}
            onValueChange={setRecurEnabled}
            trackColor={{ true: colors.accent, false: colors.bgMuted }}
            thumbColor={colors.textPrimary}
            accessibilityLabel="Enable recurring transaction"
          />
        </View>

        {recurEnabled && (
          <View style={styles.recurOptions}>
            <View style={styles.splitTypeRow}>
              {(['daily', 'weekly', 'monthly', 'custom'] as const).map(f => (
                <TouchableOpacity
                  key={f}
                  style={[styles.splitTypeBtn, recurFreq === f && styles.splitTypeActive]}
                  onPress={() => setRecurFreq(f)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: recurFreq === f }}
                >
                  <Text style={[styles.splitTypeLabel, recurFreq === f && { color: colors.bg }]}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {recurFreq === 'custom' && (
              <View style={styles.recurIntervalRow}>
                <Text style={styles.fieldLabel}>Every</Text>
                <TextInput
                  style={styles.recurIntervalInput}
                  value={recurInterval}
                  onChangeText={setRecurInterval}
                  keyboardType="number-pad"
                  placeholder="1"
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel="Interval days"
                />
                <Text style={styles.fieldLabel}>days</Text>
              </View>
            )}

            <TextInput
              style={styles.noteInput}
              value={recurEndText}
              onChangeText={setRecurEndText}
              placeholder="End date (optional, YYYY-MM-DD)"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Recurrence end date"
            />
          </View>
        )}

        {kind === 'expense' && members.length > 1 && total > 0 && (
          <TouchableOpacity
            style={styles.splitBtn}
            onPress={() => setShowSplit(true)}
            accessibilityRole="button"
            accessibilityLabel="Configure split"
          >
            <Feather name="users" size={16} color={colors.accent} />
            <Text style={styles.splitBtnText}>
              {splitType === 'equal' ? 'Split equally' : `Split (${splitType})`}
            </Text>
            {remainder !== 0 && (
              <Text style={styles.remainder}>
                {remainder > 0 ? `₹${(remainder / 100).toFixed(2)} unassigned` : `₹${(-remainder / 100).toFixed(2)} over`}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {kind === 'expense' && remainder !== 0 && total > 0 && (
          <Text style={styles.remainderWarning}>
            {remainder > 0 ? `${formatRupees(remainder)} unassigned` : `${formatRupees(-remainder)} over-assigned`}
          </Text>
        )}

        <PrimaryButton
          label="Save"
          onPress={handleSave}
          disabled={!canSave}
          loading={saving}
          style={styles.saveBtn}
        />
      </ScrollView>

      <Modal visible={showSplit} transparent animationType="slide" onRequestClose={() => setShowSplit(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowSplit(false)}>
          <Pressable style={styles.splitSheet} onPress={e => e.stopPropagation()}>
            <Text style={styles.splitTitle}>Split</Text>

            <View style={styles.splitTypeRow}>
              {(['equal', 'exact', 'percent', 'shares'] as SplitType[]).map(st => (
                <TouchableOpacity
                  key={st}
                  style={[styles.splitTypeBtn, splitType === st && styles.splitTypeActive]}
                  onPress={() => setSplitType(st)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: splitType === st }}
                >
                  <Text style={[styles.splitTypeLabel, splitType === st && { color: colors.bg }]}>
                    {st.charAt(0).toUpperCase() + st.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView style={{ maxHeight: 300 }}>
              {members.map(m => {
                const included = splitMembers.includes(m.id);
                let inputEl = null;
                if (included && splitType === 'exact') {
                  inputEl = (
                    <TextInput
                      style={styles.splitInput}
                      value={exactAmounts[m.id] ?? ''}
                      onChangeText={v => setExactAmounts(prev => ({ ...prev, [m.id]: v }))}
                      keyboardType="decimal-pad"
                      placeholder="₹0"
                      placeholderTextColor={colors.textMuted}
                    />
                  );
                } else if (included && splitType === 'percent') {
                  inputEl = (
                    <TextInput
                      style={styles.splitInput}
                      value={percentages[m.id] ?? ''}
                      onChangeText={v => setPercentages(prev => ({ ...prev, [m.id]: v }))}
                      keyboardType="number-pad"
                      placeholder="%"
                      placeholderTextColor={colors.textMuted}
                    />
                  );
                } else if (included && splitType === 'shares') {
                  inputEl = (
                    <TextInput
                      style={styles.splitInput}
                      value={ratios[m.id] ?? '1'}
                      onChangeText={v => setRatios(prev => ({ ...prev, [m.id]: v }))}
                      keyboardType="number-pad"
                      placeholder="1"
                      placeholderTextColor={colors.textMuted}
                    />
                  );
                } else if (included && splitType === 'equal') {
                  const idx = splitMembers.indexOf(m.id);
                  const eq = splitEqual(total, splitMembers.length);
                  inputEl = <Text style={styles.eqAmount}>{formatRupees(eq[idx] ?? 0)}</Text>;
                }
                return (
                  <View key={m.id} style={styles.splitRow}>
                    <MemberAvatar name={m.name} color={m.avatar_color} size={36} onPress={() => {
                      setSplitMembers(prev =>
                        prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id]
                      );
                    }} selected={included} />
                    <Text style={styles.splitName}>{m.name}</Text>
                    {inputEl}
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.remainderBar}>
              <Text style={[styles.remainderText, { color: remainder === 0 ? colors.income : colors.expense }]}>
                {remainder === 0
                  ? 'Balanced'
                  : remainder > 0
                  ? `${formatRupees(remainder)} unassigned`
                  : `${formatRupees(-remainder)} over-assigned`}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.doneBtn}
              onPress={() => setShowSplit(false)}
              accessibilityRole="button"
            >
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: layout.screenPaddingH, paddingTop: space.xl },
  title: { ...type.heading, color: colors.textPrimary },
  scroll: { padding: layout.screenPaddingH, gap: space.md, paddingBottom: 60 },
  kindRow: { flexDirection: 'row', gap: space.sm, backgroundColor: colors.bgMuted, borderRadius: radius.md, padding: 3 },
  kindBtn: { flex: 1, paddingVertical: space.sm, alignItems: 'center', borderRadius: radius.sm },
  kindActive: { backgroundColor: colors.bgCard },
  kindLabel: { ...type.label, color: colors.textSecondary },
  kindLabelActive: { color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  amountInput: { fontFamily: 'SpaceMono_400Regular', fontSize: 40, color: colors.textPrimary, textAlign: 'center', borderBottomWidth: 1, borderColor: colors.border, paddingBottom: space.sm },
  field: { gap: space.xs },
  fieldLabel: { ...type.label, color: colors.textSecondary },
  chipRow: { flexDirection: 'row', gap: space.xs, paddingBottom: space.xs },
  groupChip: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: colors.bgMuted },
  groupChipActive: { backgroundColor: colors.accent },
  groupChipText: { ...type.label, color: colors.textSecondary },
  noteInput: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border },
  splitBtn: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  splitBtnText: { ...type.body, color: colors.accent, flex: 1 },
  remainder: { ...type.label, color: colors.expense },
  remainderWarning: { ...type.label, color: colors.expense, textAlign: 'center' },
  saveBtn: { marginTop: space.md },
  recurRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.xs },
  recurOptions: { gap: space.sm, backgroundColor: colors.bgCard, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border },
  recurIntervalRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  recurIntervalInput: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: space.xs, width: 60, textAlign: 'center', borderWidth: 1, borderColor: colors.border },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  splitSheet: { backgroundColor: colors.bgCard, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg, gap: space.md, maxHeight: '80%' },
  splitTitle: { ...type.subheading, color: colors.textPrimary },
  splitTypeRow: { flexDirection: 'row', gap: space.xs, backgroundColor: colors.bgMuted, borderRadius: radius.md, padding: 3 },
  splitTypeBtn: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: radius.sm },
  splitTypeActive: { backgroundColor: colors.accent },
  splitTypeLabel: { ...type.caption, color: colors.textSecondary },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  splitName: { ...type.body, color: colors.textPrimary, flex: 1 },
  splitInput: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: space.xs, width: 80, textAlign: 'right', borderWidth: 1, borderColor: colors.border },
  eqAmount: { fontFamily: 'SpaceMono_400Regular', fontSize: 14, color: colors.textSecondary },
  remainderBar: { paddingVertical: space.sm, alignItems: 'center', borderTopWidth: 1, borderColor: colors.border },
  remainderText: { ...type.label, fontFamily: 'Inter_600SemiBold' },
  doneBtn: { height: 52, backgroundColor: colors.accent, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  doneBtnText: { ...type.button, color: colors.bg },
});
