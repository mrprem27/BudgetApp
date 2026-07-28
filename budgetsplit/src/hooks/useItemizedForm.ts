import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { settings } from '../lib/settings';
import { getCurrentPlace, type CapturedPlace } from '../lib/location';
import { getAllGroups } from '../db/queries/groups';
import { getGroupMembers, getMe, type Person } from '../db/queries/persons';
import { getCategoriesByFrequency, type Category } from '../db/queries/categories';
import {
  insertItemizedTxn, updateItemizedTxn, getTxnById, getLineItems,
  type ItemizedAdjustment,
} from '../db/queries/transactions';
import { parseToPaise } from '../lib/money';
import {
  computeAdjustedTotal, computeItemSubtotal, computePerPersonShares,
  type LineItemDraft, type Adjustment,
} from '../lib/itemized';
import { type SplitMode } from '../constants/enums';
import { haptic } from '../lib/haptics';
import { useDataRefresh } from '../components/system/DataRefreshProvider';

export type ItemizedStep = 'items' | 'assign' | 'payers' | 'review';
export const ITEMIZED_STEPS: ItemizedStep[] = ['items', 'assign', 'payers', 'review'];

export const STEP_TITLE: Record<ItemizedStep, string> = {
  items: 'Add items',
  assign: 'Assign items',
  payers: 'Who paid?',
  review: 'Review & save',
};

export type AdjustmentType = 'tax' | 'tip' | 'discount';

/**
 * All state and behaviour for the itemized-bill wizard, extracted from
 * `app/add/itemized.tsx` (an 847-line screen) so the screen is pure render.
 * Mirrors the `useAddTxnForm` pattern used by the Quick add flow.
 *
 * Loads the group/members/categories on mount — or, when `editId` is given,
 * rehydrates every step from the stored bill.
 */
export function useItemizedForm(paramGroupId?: string, editId?: string) {
  const isEditing = !!editId;
  const db = useSQLiteContext();
  const router = useRouter();
  const { refresh } = useDataRefresh();

  const [step, setStep] = useState<ItemizedStep>('items');
  const [selectedGroupId, setSelectedGroupId] = useState(paramGroupId ?? '');
  const [members, setMembers] = useState<Person[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [note, setNote] = useState('');
  const [items, setItems] = useState<LineItemDraft[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState('1');
  const [newPrice, setNewPrice] = useState('');
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [showAdjModal, setShowAdjModal] = useState(false);
  const [adjType, setAdjType] = useState<AdjustmentType>('tax');
  const [adjMode, setAdjMode] = useState<'flat' | 'percent'>('percent');
  const [adjValue, setAdjValue] = useState('');
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [place, setPlace] = useState<CapturedPlace | null>(null);
  const [locEnabled, setLocEnabled] = useState(false);
  const [capturingLoc, setCapturingLoc] = useState(false);

  async function captureLocation() {
    setCapturingLoc(true);
    try { setPlace(await getCurrentPlace()); } finally { setCapturingLoc(false); }
  }

  useEffect(() => {
    if (isEditing) return;
    (async () => {
      const on = await settings.saveLocation();
      setLocEnabled(on);
      if (on) await captureLocation();
    })();
  }, [isEditing]);

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

  useEffect(() => {
    (async () => {
      const meRow = await getMe(db);

      if (editId) {
        // Editing an existing itemized bill — load it and prefill every step.
        const t = await getTxnById(db, editId);
        if (t) {
          const gid = t.group_id;
          setSelectedGroupId(gid);
          const [cats, mems, lineItems] = await Promise.all([
            getCategoriesByFrequency(db, gid),
            getGroupMembers(db, gid),
            getLineItems(db, editId),
          ]);
          setCategories(cats);
          setMembers(mems);
          setSelectedCategory(cats.find(c => c.name === t.category) ?? cats[0] ?? null);
          setNote(t.note ?? '');
          setItems(lineItems.map(li => ({
            id: li.id,
            name: li.name,
            qty: String(li.qty),
            unitPrice: (li.unit_price / 100).toString(),
            assignedTo: (() => { try { return JSON.parse(li.assigned_to) as string[]; } catch { return []; } })(),
            splitMode: (li.split_mode ?? undefined) as SplitMode | undefined,
            splitValues: (() => { try { return li.split_values ? JSON.parse(li.split_values) as Record<string, string> : undefined; } catch { return undefined; } })(),
          })));
          if (t.adjustments) {
            try { setAdjustments(JSON.parse(t.adjustments) as Adjustment[]); } catch { /* ignore */ }
          }
          const payerMap: Record<string, string> = {};
          for (const p of t.payments) payerMap[p.personId] = (p.amount / 100).toString();
          setPayerAmounts(payerMap);
        }
        return;
      }

      const grps = await getAllGroups(db);
      const gid = paramGroupId ?? grps[0]?.id ?? '';
      setSelectedGroupId(gid);
      if (gid) await loadGroup(gid, meRow);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- derived totals -------------------------------------------------------

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

  const peopleFor = (ids: string[]) =>
    ids.map(pid => members.find(m => m.id === pid)).filter((m): m is Person => !!m);

  // ---- item editing ---------------------------------------------------------

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
    setEditingId(c => (c === id ? null : c));
  }

  /** Inline edit of an existing item's name / qty / unit price. */
  function updateItem(id: string, patch: Partial<Pick<LineItemDraft, 'name' | 'qty' | 'unitPrice'>>) {
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)));
  }

  function toggleAssign(itemId: string, personId: string) {
    setItems(prev => prev.map(i => {
      if (i.id !== itemId) return i;
      const already = i.assignedTo.includes(personId);
      return { ...i, assignedTo: already ? i.assignedTo.filter(id => id !== personId) : [...i.assignedTo, personId] };
    }));
  }

  function splitRestEqually() {
    setItems(prev => prev.map(i => (i.assignedTo.length === 0 ? { ...i, assignedTo: members.map(m => m.id) } : i)));
  }

  /** Set an item's split mode (Equal / Specific / Percent / Shares). */
  function setItemSplitMode(itemId: string, mode: SplitMode) {
    setItems(prev => prev.map(i => (i.id === itemId ? { ...i, splitMode: mode } : i)));
  }

  /** Set a per-member value for an item's non-equal split. */
  function setItemSplitValue(itemId: string, personId: string, value: string) {
    setItems(prev => prev.map(i => (i.id === itemId
      ? { ...i, splitValues: { ...(i.splitValues ?? {}), [personId]: value.replace(/[^0-9.]/g, '') } }
      : i)));
  }

  // ---- adjustments ----------------------------------------------------------

  function openAdj(t: AdjustmentType) {
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

  // ---- save -----------------------------------------------------------------

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      const shares = Object.entries(perPerson)
        .map(([personId, amount]) => ({ personId, amount }))
        .filter(s => s.amount > 0);

      const payload = {
        groupId: selectedGroupId,
        kind: 'expense' as const,
        entryMode: 'itemized' as const,
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
          splitMode: i.splitMode,
          splitValues: i.splitValues,
        })),
        adjustments: adjustments as ItemizedAdjustment[],
        lat: place?.lat,
        lng: place?.lng,
        placeLabel: place?.label ?? undefined,
      };
      if (isEditing) await updateItemizedTxn(db, editId!, payload);
      else await insertItemizedTxn(db, payload);
      haptic.success();
      refresh();
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

  return {
    // wizard
    step, setStep, stepTitle: STEP_TITLE[step], isEditing,
    // group / meta
    selectedGroupId, members, categories, setCategories,
    selectedCategory, setSelectedCategory,
    note, setNote,
    // items
    items, editingId, setEditingId,
    newName, setNewName, newQty, setNewQty, newPrice, setNewPrice,
    addItem, removeItem, updateItem,
    toggleAssign, splitRestEqually, setItemSplitMode, setItemSplitValue,
    expandedItem, setExpandedItem,
    // adjustments
    adjustments, showAdjModal, setShowAdjModal,
    adjType, adjMode, setAdjMode, adjValue, setAdjValue,
    openAdj, addAdjustment, removeAdjustment,
    // totals
    subtotal, total, perPerson, unassignedTotal,
    payments, paymentRemainder, peopleFor,
    // payers
    payerAmounts, setPayerAmounts,
    // location
    place, setPlace, locEnabled, capturingLoc, captureLocation,
    // save
    saving, handleSave, canProceedItems, canProceedAssign, canSave,
  };
}
