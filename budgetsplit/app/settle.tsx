import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, radius, layout, shadow } from '../src/constants/layout';
import { ErrorState } from '../src/components/ui/ErrorState';
import { MemberAvatar } from '../src/components/finance/MemberAvatar';
import { ModalHeader } from '../src/components/ui/ModalHeader';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { getGroupNet } from '../src/db/queries/balances';
import { getAllPersons } from '../src/db/queries/persons';
import { getAllGroups } from '../src/db/queries/groups';
import { insertTxn } from '../src/db/queries/transactions';
import { simplify } from '../src/lib/settle';
import { formatRupees, formatCompact, parseToPaise } from '../src/lib/money';
import { haptic } from '../src/lib/haptics';
import type { Person } from '../src/db/queries/persons';

type PayMethod = 'upi' | 'cash' | 'bank';
/** One settle target — always scoped to a specific group. */
type SettleItem = { from: string; to: string; amount: number; groupId: string };

const PAY_METHODS: { key: PayMethod; label: string; emoji: string }[] = [
  { key: 'upi',  label: 'UPI',  emoji: '📱' },
  { key: 'cash', label: 'Cash', emoji: '💵' },
  { key: 'bank', label: 'Bank', emoji: '🏦' },
];

export default function GlobalSettleScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // `focus` opens the global wizard pre-selected on a person. `from/to/amount/groupId`
  // open it in DIRECT mode: settle exactly that pair, that amount, in that group
  // (used by the in-group balance rows — preserves the group-scoped figure).
  const { focus, from: fromParam, to: toParam, amount: amtParam, groupId: gidParam } =
    useLocalSearchParams<{ focus?: string; from?: string; to?: string; amount?: string; groupId?: string }>();
  const directMode = !!fromParam && !!toParam;

  const [groupSettlements, setGroupSettlements] = useState<SettleItem[]>([]);
  const [persons, setPersons] = useState<Person[]>([]);
  const [groupNames, setGroupNames] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState(false);

  // Active settlement being processed
  const [currentIdx, setCurrentIdx] = useState(0);
  const [customAmt, setCustomAmt] = useState('');
  const [payMethod, setPayMethod] = useState<PayMethod>('upi');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const autoFocused = useRef(false);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    try {
      const [all, grps] = await Promise.all([getAllPersons(db), getAllGroups(db)]);
      setPersons(all);
      const shared = grps.filter(g => g.is_personal !== 1);
      setGroupNames(Object.fromEntries(shared.map(g => [g.id, g.name])));
      // Build per-group settle targets — a debt is only meaningful inside a group,
      // so we never net across groups into one payment.
      const items: SettleItem[] = [];
      for (const g of shared) {
        const net = await getGroupNet(db, g.id);
        for (const s of simplify(net)) items.push({ from: s.from, to: s.to, amount: s.amount, groupId: g.id });
      }
      setGroupSettlements(items);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }

  const personMap = new Map(persons.map(p => [p.id, p]));
  const settlements: SettleItem[] = directMode
    ? [{ from: fromParam!, to: toParam!, amount: Math.max(0, Math.round(Number(amtParam) || 0)), groupId: gidParam ?? '' }]
    : groupSettlements;

  // Auto-focus person from ?focus= param (first group debt involving them).
  useEffect(() => {
    if (autoFocused.current || !focus || settlements.length === 0) return;
    const idx = settlements.findIndex(x => x.from === focus || x.to === focus);
    if (idx >= 0) { autoFocused.current = true; setCurrentIdx(idx); }
  }, [focus, settlements]);

  // Reset amount when switching settlement
  useEffect(() => { setCustomAmt(''); setNote(''); setPayMethod('upi'); }, [currentIdx]);

  const current = settlements[currentIdx] ?? null;
  const fromPerson = current ? personMap.get(current.from) : null;
  const toPerson   = current ? personMap.get(current.to)   : null;
  const me = persons.find(p => p.is_me === 1);
  // The group is part of the settlement now — no async lookup needed.
  const contextGroup = current ? (groupNames[current.groupId] ?? null) : null;

  // Determine display perspective: who are WE settling with?
  const involvesMe = current ? (current.from === me?.id || current.to === me?.id) : false;
  const isIOwing = current ? current.from === me?.id : false;
  // When the pair doesn't involve me (settling two other members in a group), show
  // the payer (from) neutrally rather than a wrong "you owe / owes you".
  const counterpart = involvesMe ? (isIOwing ? toPerson : fromPerson) : fromPerson;
  const rawAmt = current?.amount ?? 0;
  const amtToPay = customAmt ? parseToPaise(customAmt) : rawAmt;

  async function handleSettle() {
    if (!current || !fromPerson || !toPerson) return;
    setSaving(true);
    try {
      const gid = current.groupId || null;
      if (!gid) {
        Alert.alert(
          'Cannot settle here',
          `${fromPerson.name} and ${toPerson.name} don't share a group. Settle inside the group.`,
        );
        setSaving(false);
        return;
      }
      await insertTxn(db, {
        groupId: gid, kind: 'settlement', entryMode: 'quick', date: Date.now(),
        category: 'Settlement',
        note: note.trim() || undefined,
        payMethod, // persisted field — no longer baked into the note
        payments: [{ personId: fromPerson.id, amount: amtToPay }],
        shares:   [{ personId: toPerson.id,   amount: amtToPay }],
      });
      haptic.success();
      // Close once a settlement is recorded, even a partial one.
      router.back();
    } catch {
      haptic.error();
      Alert.alert('Something went wrong', 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ErrorState onRetry={() => { setLoadError(false); load(); }} />
      </View>
    );
  }

  // ALL SETTLED UP empty state
  if (settlements.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settle up</Text>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
            <Feather name="x" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.allDoneWrap}>
          <View style={styles.allDoneRing}>
            <Feather name="check" size={40} color={colors.income} />
          </View>
          <Text style={styles.allDoneTitle}>All settled up!</Text>
          <Text style={styles.allDoneSub}>You don't owe anyone and no one owes you right now.</Text>
          <View style={styles.allDoneAvatarRow}>
            {persons.filter(p => !p.is_me).slice(0, 4).map(p => (
              <View key={p.id} style={styles.allDoneAvatar}>
                <MemberAvatar name={p.name} color={p.avatar_color} size={44} imageUri={p.image_uri} />
                <View style={styles.allDoneCheck}>
                  <Feather name="check" size={10} color="#fff" />
                </View>
              </View>
            ))}
          </View>
          <TouchableOpacity style={styles.viewGroupsBtn} onPress={() => router.back()} accessibilityRole="button">
            <Text style={styles.viewGroupsText}>View groups</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/add/quick?kind=expense')} accessibilityRole="button" style={{ marginTop: space.sm }}>
            <Text style={styles.addExpLink}>Add a new expense</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const canSettle = !!current && amtToPay > 0 && !saving;

  return (
    <View style={styles.container}>
      {/* Header matches Add Expense: ✕ left · title center · ✓ save right */}
      <ModalHeader
        title="Settle up"
        onClose={() => router.back()}
        right={
          <TouchableOpacity onPress={handleSettle} disabled={!canSettle} hitSlop={10} accessibilityRole="button" accessibilityLabel="Save settlement">
            <Feather name="check" size={24} color={canSettle ? colors.accent : colors.textMuted} />
          </TouchableOpacity>
        }
      />

      {/* Multi-settlement counter — not in design Screen 4 (handle later). It still
          auto-advances to the next settlement after each "Mark as settled". */}
      {/* {settlements.length > 1 && (
        <View style={styles.counterRow}>
          <Text style={styles.counterText}>
            {currentIdx + 1} of {settlements.length} — across all groups + personal
          </Text>
          <View style={styles.counterDots}>
            {settlements.map((_, i) => (
              <TouchableOpacity key={i} onPress={() => setCurrentIdx(i)} hitSlop={8}>
                <View style={[styles.counterDot, i === currentIdx && styles.counterDotActive]} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )} */}

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Person card */}
        {counterpart && (
          <View style={styles.personCard}>
            <View style={styles.personAvatarWrap}>
              <MemberAvatar name={counterpart.name} color={counterpart.avatar_color} size={56} imageUri={counterpart.image_uri} />
            </View>
            <Text style={styles.personName}>{counterpart.name}</Text>
            <Text style={styles.personCtx}>
              {involvesMe
                ? `${isIOwing ? 'you owe' : 'owes you'} ${contextGroup ? `· ${contextGroup}` : 'across shared groups'}`
                : `owes ${toPerson?.name?.split(' ')[0] ?? 'someone'} ${contextGroup ? `· ${contextGroup}` : ''}`}
            </Text>
            <Text style={[styles.personAmt, { color: !involvesMe ? colors.textPrimary : isIOwing ? colors.expense : colors.income }]}>
              {formatRupees(rawAmt)}
            </Text>
          </View>
        )}

        {/* Amount to settle */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>AMOUNT TO SETTLE</Text>
          <View style={styles.amtRow}>
            <TextInput
              style={styles.amtInput}
              value={customAmt}
              onChangeText={setCustomAmt}
              placeholder={formatRupees(rawAmt)}
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              accessibilityLabel="Amount"
            />
            {!customAmt && (
              <View style={styles.fullChip}>
                <Text style={styles.fullChipText}>Full balance</Text>
              </View>
            )}
          </View>
        </View>

        {/* Payment method */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>HOW WAS IT PAID?</Text>
          <View style={styles.methodRow}>
            {PAY_METHODS.map(m => (
              <TouchableOpacity
                key={m.key}
                style={[styles.methodTile, payMethod === m.key && styles.methodTileActive]}
                onPress={() => { setPayMethod(m.key); haptic.selection(); }}
                accessibilityRole="button"
                accessibilityState={{ selected: payMethod === m.key }}
              >
                <Text style={styles.methodEmoji}>{m.emoji}</Text>
                <Text style={[styles.methodLabel, payMethod === m.key && styles.methodLabelActive]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Note */}
        <View style={styles.section}>
          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="Note (optional)"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Note"
          />
        </View>

        {/* No bottom CTA — the ✓ in the header saves (matches Add Expense). */}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  closeRow: { flexDirection: 'row', justifyContent: 'flex-end', padding: layout.screenPaddingH },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bgMuted, alignItems: 'center', justifyContent: 'center' },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: layout.screenPaddingH, paddingBottom: space.sm },
  headerTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold', color: colors.textPrimary },

  counterRow: { paddingHorizontal: layout.screenPaddingH, paddingBottom: space.sm, gap: 6 },
  counterText: { ...type.caption, color: colors.textMuted },
  counterDots: { flexDirection: 'row', gap: 5 },
  counterDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.bgMuted },
  counterDotActive: { backgroundColor: colors.settle, width: 16 },

  scroll: { padding: layout.screenPaddingH, gap: space.md },

  // Person card
  personCard: { alignItems: 'center', paddingVertical: space.lg },
  personAvatarWrap: {
    shadowColor: colors.settle,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
    marginBottom: space.sm,
  },
  personName: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: colors.textPrimary, marginBottom: 4 },
  personCtx: { ...type.caption, color: colors.textMuted, marginBottom: space.sm },
  personAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 36, letterSpacing: -1 },

  // Sections
  section: { gap: space.xs },
  sectionLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Inter_600SemiBold' },

  amtRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1.5,
    borderColor: colors.accent, paddingHorizontal: space.md, paddingVertical: space.sm + 2,
  },
  amtInput: { fontFamily: 'SpaceMono_400Regular', fontSize: 20, color: colors.textPrimary, flex: 1 },
  fullChip: { backgroundColor: colors.accentMuted, borderRadius: radius.pill, paddingHorizontal: space.sm + 2, paddingVertical: 4 },
  fullChipText: { ...type.caption, color: colors.accent, fontFamily: 'Inter_600SemiBold' },

  methodRow: { flexDirection: 'row', gap: space.sm },
  methodTile: {
    flex: 1, alignItems: 'center', paddingVertical: space.sm + 2, borderRadius: radius.md,
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, gap: 4,
  },
  methodTileActive: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  methodEmoji: { fontSize: 20 },
  methodLabel: { ...type.caption, color: colors.textMuted, fontFamily: 'Inter_600SemiBold' },
  methodLabelActive: { color: colors.accent },

  noteInput: {
    ...type.body, color: colors.textPrimary, backgroundColor: colors.bgCard,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: space.md,
  },

  // Mark as settled CTA — purple/settle color
  settleCta: {
    backgroundColor: colors.settle,
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: 'center',
    shadowColor: colors.settle,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
  },
  settleCtaText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#fff' },

  // All settled empty state
  allDoneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  allDoneRing: {
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 2.5, borderColor: colors.income,
    alignItems: 'center', justifyContent: 'center', marginBottom: space.lg,
  },
  allDoneTitle: { fontSize: 22, fontFamily: 'Inter_600SemiBold', color: colors.textPrimary, marginBottom: space.sm },
  allDoneSub: { ...type.body, color: colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: space.lg },
  allDoneAvatarRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.lg },
  allDoneAvatar: { position: 'relative' },
  allDoneCheck: {
    position: 'absolute', bottom: 0, right: 0,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.income, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.bg,
  },
  viewGroupsBtn: {
    paddingVertical: space.sm + 2, paddingHorizontal: space.xl,
    borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.accent,
  },
  viewGroupsText: { ...type.body, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  addExpLink: { ...type.body, color: colors.textMuted },
});
