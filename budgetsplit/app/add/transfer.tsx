import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../src/constants/colors';
import { type } from '../../src/constants/typography';
import { space, radius, layout, shadow } from '../../src/constants/layout';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { Input } from '../../src/components/ui/Input';
import { MemberAvatar } from '../../src/components/finance/MemberAvatar';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { InsightText } from '../../src/components/finance/InsightText';
import { getAllGroups } from '../../src/db/queries/groups';
import { getGroupMembers, getMe } from '../../src/db/queries/persons';
import { insertTxn, updateTxn, getTxnById } from '../../src/db/queries/transactions';
import { parseToPaise, formatCompact } from '../../src/lib/money';
import { haptic } from '../../src/lib/haptics';
import type { BudgetGroup } from '../../src/db/queries/groups';
import type { Person } from '../../src/db/queries/persons';

type Slot = 'from' | 'to';

export default function TransferScreen() {
  const { groupId: paramGroupId, editId } = useLocalSearchParams<{ groupId?: string; editId?: string }>();
  const isEditing = !!editId;
  const db = useSQLiteContext();
  const router = useRouter();

  const [groups, setGroups] = useState<BudgetGroup[]>([]);
  const [groupId, setGroupId] = useState(paramGroupId ?? '');
  const [members, setMembers] = useState<Person[]>([]);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [pickerFor, setPickerFor] = useState<Slot | null>(null);

  useEffect(() => {
    (async () => {
      const [grps, me] = await Promise.all([getAllGroups(db), getMe(db)]);
      // Transfers need at least two people → only multi-member groups qualify.
      const counts = await Promise.all(grps.map(g => getGroupMembers(db, g.id)));
      const eligible: BudgetGroup[] = grps.filter((_, i) => counts[i].length >= 2);
      setGroups(eligible);

      // Editing an existing settlement → prefill from the stored txn.
      if (editId) {
        const t = await getTxnById(db, editId);
        if (t) {
          setGroupId(t.group_id);
          const mems = await getGroupMembers(db, t.group_id);
          setMembers(mems);
          setFromId(t.payments[0]?.personId ?? '');
          setToId(t.shares[0]?.personId ?? '');
          setAmountText(((t.payments[0]?.amount ?? 0) / 100).toString());
          setNote(t.note ?? '');
          return;
        }
      }

      const gid = (paramGroupId && eligible.some(g => g.id === paramGroupId)) ? paramGroupId : eligible[0]?.id ?? '';
      setGroupId(gid);
      if (gid) await loadMembers(gid, me);
    })();
  }, []);

  async function loadMembers(gid: string, me: Person | null) {
    const mems = await getGroupMembers(db, gid);
    setMembers(mems);
    const meId = me?.id ?? mems[0]?.id ?? '';
    setFromId(meId);
    setToId(mems.find(m => m.id !== meId)?.id ?? '');
  }

  const total = parseToPaise(amountText);
  const fromPerson = members.find(m => m.id === fromId) ?? null;
  const toPerson = members.find(m => m.id === toId) ?? null;
  const canSave = !!groupId && !!fromId && !!toId && fromId !== toId && total > 0 && !saving;

  function swap() {
    haptic.selection();
    setFromId(toId);
    setToId(fromId);
  }

  function pick(id: string) {
    if (pickerFor === 'from') {
      if (id === toId) setToId(fromId); // keep them distinct by swapping
      setFromId(id);
    } else if (pickerFor === 'to') {
      if (id === fromId) setFromId(toId);
      setToId(id);
    }
    setPickerFor(null);
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      if (isEditing) {
        await updateTxn(db, {
          id: editId!,
          groupId, kind: 'settlement', date: Date.now(),
          category: 'Transfer', note: note.trim() || undefined,
          payments: [{ personId: fromId, amount: total }],
          shares: [{ personId: toId, amount: total }],
        });
      } else {
        await insertTxn(db, {
          groupId, kind: 'settlement', entryMode: 'quick', date: Date.now(),
          category: 'Transfer', note: note.trim() || undefined,
          payments: [{ personId: fromId, amount: total }],
          shares: [{ personId: toId, amount: total }],
        });
      }
      haptic.success();
      router.back();
    } catch {
      Alert.alert('Error', 'Could not save the transfer.');
    } finally {
      setSaving(false);
    }
  }

  if (groups.length === 0) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Transfer" onBack={() => router.back()} />
        <EmptyState
          icon="repeat"
          title="No group to transfer in"
          body="Transfers move money between two people. Create a group with at least one other member first."
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={isEditing ? 'Edit Transfer' : 'Transfer'} onBack={() => router.back()} right={
        <TouchableOpacity onPress={handleSave} disabled={!canSave || saving} hitSlop={10} accessibilityRole="button" accessibilityLabel="Save">
          <Text style={[styles.headerSave, (!canSave || saving) && { opacity: 0.35 }]}>Save</Text>
        </TouchableOpacity>
      } />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TextInput
            style={styles.amountInput}
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
            placeholder="₹0.00"
            placeholderTextColor={colors.textMuted}
            autoFocus={!isEditing}
            accessibilityLabel="Transfer amount"
          />

          {groups.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.groupRow}>
              {groups.map(g => (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.groupChip, groupId === g.id && styles.groupChipActive]}
                  onPress={async () => { setGroupId(g.id); await loadMembers(g.id, await getMe(db)); }}
                  accessibilityRole="button"
                >
                  <Text style={[styles.groupChipText, groupId === g.id && { color: colors.bg }]}>{g.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* From → To direction card */}
          <View style={styles.dirCard}>
            <TouchableOpacity style={styles.dirTile} onPress={() => setPickerFor('from')} accessibilityRole="button" accessibilityLabel="Choose who pays">
              <Text style={styles.dirLabel}>FROM</Text>
              <MemberAvatar name={fromPerson?.name ?? '?'} color={fromPerson?.avatar_color ?? colors.accent} size={56} imageUri={fromPerson?.image_uri} />
              <Text style={styles.dirName} numberOfLines={1}>{fromPerson ? fromPerson.name.split(' ')[0] : 'Pick'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.swapBtn} onPress={swap} accessibilityRole="button" accessibilityLabel="Swap from and to">
              <Feather name="repeat" size={16} color={colors.accent} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.dirTile} onPress={() => setPickerFor('to')} accessibilityRole="button" accessibilityLabel="Choose who receives">
              <Text style={styles.dirLabel}>TO</Text>
              <MemberAvatar name={toPerson?.name ?? '?'} color={toPerson?.avatar_color ?? colors.accent} size={56} imageUri={toPerson?.image_uri} />
              <Text style={styles.dirName} numberOfLines={1}>{toPerson ? toPerson.name.split(' ')[0] : 'Pick'}</Text>
            </TouchableOpacity>
          </View>

          {total > 0 && fromPerson && toPerson && (
            <InsightText
              text={`${fromPerson.name.split(' ')[0]} pays ${toPerson.name.split(' ')[0]} ${formatCompact(total)}`}
              color={colors.settle}
              style={styles.summary}
            />
          )}

          <Input
            value={note}
            onChangeText={setNote}
            placeholder="Note (optional)"
            accessibilityLabel="Note"
            maxLength={80}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Pick a person for the active slot */}
      <SheetModal visible={pickerFor !== null} onClose={() => setPickerFor(null)} title={pickerFor === 'from' ? 'Who pays?' : 'Who receives?'} scroll={false}>
        {members.map(m => {
          const active = pickerFor === 'from' ? m.id === fromId : m.id === toId;
          return (
            <TouchableOpacity key={m.id} style={[styles.pickRow, active && styles.pickRowActive]} onPress={() => pick(m.id)} accessibilityRole="button">
              <MemberAvatar name={m.name} color={m.avatar_color} size={36} imageUri={m.image_uri} />
              <Text style={styles.pickName}>{m.name}</Text>
              {active && <Feather name="check" size={18} color={colors.accent} />}
            </TouchableOpacity>
          );
        })}
      </SheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  headerSave: { ...type.body, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  scroll: { padding: layout.screenPaddingH, gap: space.md, paddingBottom: space.sm },
  amountInput: { fontFamily: 'SpaceMono_400Regular', fontSize: 40, color: colors.textPrimary, textAlign: 'center', borderBottomWidth: 1, borderColor: colors.border, paddingBottom: space.sm },
  groupRow: { flexDirection: 'row', gap: space.sm, paddingVertical: space.xs },
  groupChip: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: colors.bgMuted },
  groupChipActive: { backgroundColor: colors.accent },
  groupChipText: { ...type.label, color: colors.textSecondary },

  dirCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, ...shadow.sm },
  dirTile: { flex: 1, alignItems: 'center', gap: space.xs },
  dirLabel: { ...type.label, color: colors.textMuted, letterSpacing: 0.5 },
  dirName: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  swapBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center', marginHorizontal: space.sm },

  summary: { ...type.subheading, color: colors.textPrimary, textAlign: 'center' },

  pickRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, paddingHorizontal: space.sm, borderRadius: radius.md, minHeight: 52 },
  pickRowActive: { backgroundColor: colors.accentMuted },
  pickName: { ...type.body, color: colors.textPrimary, flex: 1 },
});
