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
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { getGlobalNet } from '../src/db/queries/balances';
import { getAllPersons } from '../src/db/queries/persons';
import { getCommonGroupId } from '../src/db/queries/groups';
import { insertTxn } from '../src/db/queries/transactions';
import { simplify } from '../src/lib/settle';
import { formatRupees, formatCompact, parseToPaise } from '../src/lib/money';
import { haptic } from '../src/lib/haptics';
import type { Person } from '../src/db/queries/persons';

type PayMethod = 'upi' | 'cash' | 'bank';

const PAY_METHODS: { key: PayMethod; label: string; emoji: string }[] = [
  { key: 'upi',  label: 'UPI',  emoji: '📱' },
  { key: 'cash', label: 'Cash', emoji: '💵' },
  { key: 'bank', label: 'Bank', emoji: '🏦' },
];

export default function GlobalSettleScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { focus } = useLocalSearchParams<{ focus?: string }>();

  const [net, setNet] = useState<Record<string, number>>({});
  const [persons, setPersons] = useState<Person[]>([]);
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
      const [n, all] = await Promise.all([getGlobalNet(db), getAllPersons(db)]);
      setNet(n);
      setPersons(all);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }

  const personMap = new Map(persons.map(p => [p.id, p]));
  const settlements = simplify(net);

  // Auto-focus person from ?focus= param
  useEffect(() => {
    if (autoFocused.current || !focus || persons.length === 0) return;
    const idx = settlements.findIndex(x => x.from === focus || x.to === focus);
    if (idx >= 0) { autoFocused.current = true; setCurrentIdx(idx); }
  }, [focus, persons, net]);

  // Reset amount when switching settlement
  useEffect(() => { setCustomAmt(''); setNote(''); setPayMethod('upi'); }, [currentIdx]);

  const current = settlements[currentIdx] ?? null;
  const fromPerson = current ? personMap.get(current.from) : null;
  const toPerson   = current ? personMap.get(current.to)   : null;
  const me = persons.find(p => p.is_me === 1);

  // Determine display perspective: who are WE settling with?
  const isIOwing = current ? current.from === me?.id : false;
  const counterpart = isIOwing ? toPerson : fromPerson;
  const rawAmt = current?.amount ?? 0;
  const amtToPay = customAmt ? parseToPaise(customAmt) : rawAmt;

  async function handleSettle() {
    if (!current || !fromPerson || !toPerson) return;
    setSaving(true);
    try {
      const gid = await getCommonGroupId(db, fromPerson.id, toPerson.id);
      if (!gid) {
        Alert.alert(
          'Cannot settle here',
          `${fromPerson.name} and ${toPerson.name} don't share a group. Settle inside the group.`,
        );
        setSaving(false);
        return;
      }
      const noteStr = note.trim() || `Settled via ${payMethod.toUpperCase()}`;
      await insertTxn(db, {
        groupId: gid, kind: 'settlement', entryMode: 'quick', date: Date.now(),
        category: 'Settlement',
        note: noteStr,
        payments: [{ personId: fromPerson.id, amount: amtToPay }],
        shares:   [{ personId: toPerson.id,   amount: amtToPay }],
      });
      haptic.success();
      await load();
      // Advance to next or close
      const next = currentIdx < settlements.length - 1 ? currentIdx : Math.max(0, currentIdx - 1);
      setCurrentIdx(next);
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
        <View style={styles.closeRow}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
            <Feather name="x" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.allDoneWrap}>
          <View style={styles.allDoneRing}>
            <Feather name="check" size={32} color={colors.income} />
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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settle up</Text>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
          <Feather name="x" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Multi-settlement counter */}
      {settlements.length > 1 && (
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
      )}

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Person card */}
        {counterpart && (
          <View style={styles.personCard}>
            <View style={styles.personAvatarWrap}>
              <MemberAvatar name={counterpart.name} color={counterpart.avatar_color} size={56} imageUri={counterpart.image_uri} />
            </View>
            <Text style={styles.personName}>{counterpart.name}</Text>
            <Text style={styles.personCtx}>
              {isIOwing ? 'you owe from shared groups' : 'owes you from shared groups'}
            </Text>
            <Text style={[styles.personAmt, { color: isIOwing ? colors.expense : colors.income }]}>
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
              placeholderTextColor={colors.textPrimary}
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

        {/* CTA */}
        <TouchableOpacity
          style={[styles.settleCta, saving && { opacity: 0.6 }]}
          onPress={handleSettle}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Mark as settled"
        >
          <Text style={styles.settleCtaText}>{saving ? 'Settling…' : 'Mark as settled'}</Text>
        </TouchableOpacity>

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
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 2.5, borderColor: colors.income,
    alignItems: 'center', justifyContent: 'center', marginBottom: space.md,
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
