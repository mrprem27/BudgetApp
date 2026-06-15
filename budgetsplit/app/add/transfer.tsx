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
import { space, radius, layout } from '../../src/constants/layout';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { PrimaryButton } from '../../src/components/ui/PrimaryButton';
import { MemberAvatar } from '../../src/components/finance/MemberAvatar';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { getAllGroups } from '../../src/db/queries/groups';
import { getGroupMembers, getMe } from '../../src/db/queries/persons';
import { insertTxn } from '../../src/db/queries/transactions';
import { parseToPaise, formatRupees } from '../../src/lib/money';
import { haptic } from '../../src/lib/haptics';
import type { BudgetGroup } from '../../src/db/queries/groups';
import type { Person } from '../../src/db/queries/persons';

export default function TransferScreen() {
  const { groupId: paramGroupId } = useLocalSearchParams<{ groupId?: string }>();
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

  useEffect(() => {
    (async () => {
      const grps = await getAllGroups(db);
      const me = await getMe(db);
      // Transfers need at least two people → only multi-member groups qualify.
      const eligible: BudgetGroup[] = [];
      for (const g of grps) {
        const mems = await getGroupMembers(db, g.id);
        if (mems.length >= 2) eligible.push(g);
      }
      setGroups(eligible);
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
  const canSave = !!groupId && !!fromId && !!toId && fromId !== toId && total > 0 && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await insertTxn(db, {
        groupId, kind: 'settlement', entryMode: 'quick', date: Date.now(),
        category: 'Transfer', note: note.trim() || undefined,
        payments: [{ personId: fromId, amount: total }],
        shares: [{ personId: toId, amount: total }],
      });
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

  const PersonPicker = ({ label, value, onChange, exclude }: { label: string; value: string; onChange: (id: string) => void; exclude?: string }) => (
    <View style={{ gap: space.xs }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.peopleRow}>
          {members.filter(m => m.id !== exclude).map(m => (
            <TouchableOpacity key={m.id} style={styles.personChip} onPress={() => onChange(m.id)} accessibilityRole="button">
              <MemberAvatar name={m.name} color={m.avatar_color} size={40} selected={value === m.id} />
              <Text style={[styles.personChipName, value === m.id && { color: colors.accent }]} numberOfLines={1}>{m.name.split(' ')[0]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title="Transfer" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TextInput
            style={styles.amountInput}
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
            placeholder="₹0.00"
            placeholderTextColor={colors.textMuted}
            autoFocus
            accessibilityLabel="Transfer amount"
          />

          {groups.length > 1 && (
            <View style={{ gap: space.xs }}>
              <Text style={styles.fieldLabel}>Group</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.peopleRow}>
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
                </View>
              </ScrollView>
            </View>
          )}

          <PersonPicker label="From" value={fromId} onChange={setFromId} exclude={toId} />
          <View style={styles.arrow}><Feather name="arrow-down" size={18} color={colors.textMuted} /></View>
          <PersonPicker label="To" value={toId} onChange={setToId} exclude={fromId} />

          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="Note (optional)"
            placeholderTextColor={colors.textMuted}
          />

          {total > 0 && fromId && toId && (
            <Text style={styles.summary}>
              {members.find(m => m.id === fromId)?.name} pays {members.find(m => m.id === toId)?.name} {formatRupees(total)}
            </Text>
          )}

          <PrimaryButton label="Record Transfer" onPress={handleSave} disabled={!canSave} loading={saving} style={{ marginTop: space.md }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.md, paddingBottom: space.lg },
  amountInput: { fontFamily: 'SpaceMono_400Regular', fontSize: 40, color: colors.textPrimary, textAlign: 'center', borderBottomWidth: 1, borderColor: colors.border, paddingBottom: space.sm },
  fieldLabel: { ...type.label, color: colors.textSecondary },
  peopleRow: { flexDirection: 'row', gap: space.md, paddingVertical: space.xs },
  personChip: { alignItems: 'center', gap: 4, width: 56 },
  personChipName: { ...type.caption, color: colors.textSecondary, maxWidth: 56 },
  groupChip: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: colors.bgMuted },
  groupChipActive: { backgroundColor: colors.accent },
  groupChipText: { ...type.label, color: colors.textSecondary },
  arrow: { alignItems: 'center' },
  noteInput: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border },
  summary: { ...type.body, color: colors.textSecondary, textAlign: 'center' },
});
