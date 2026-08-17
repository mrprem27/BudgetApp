import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { File } from 'expo-file-system';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { settings } from '../lib/settings';
import { getCurrentPlace, type CapturedPlace } from '../lib/location';
import { getAllGroups } from '../db/queries/groups';
import { getGroupMembers, getMe, type Person } from '../db/queries/persons';
import { getCategoriesByFrequency, type Category } from '../db/queries/categories';
import {
  insertItemizedTxn, updateItemizedTxn, getTxnById, getLineItems,
  type ItemizedAdjustmentType,
} from '../db/queries/transactions';
import { parseToPaise } from '../lib/money';
import {
  computeAdjustedTotal, computeItemSubtotal, computePerPersonShares,
  type LineItemDraft, type Adjustment,
} from '../lib/itemized';
import { type SplitMode } from '../constants/enums';
import { haptic } from '../lib/haptics';
import { useDataRefresh } from '../components/system/DataRefreshProvider';
import { pickAttachment, deleteAttachment, AttachmentStorageError } from '../lib/attachment';
import { getReceiptExtractor, type ParsedLineItem } from '../lib/ocrProviders';

export type ItemizedStep = 'items' | 'assign' | 'payers' | 'review';
export const ITEMIZED_STEPS: ItemizedStep[] = ['items', 'assign', 'payers', 'review'];

export const STEP_TITLE: Record<ItemizedStep, string> = {
  items: 'Add items',
  assign: 'Assign items',
  payers: 'Who paid?',
  review: 'Review & save',
};

export type AdjustmentType = ItemizedAdjustmentType;

/** Display label per adjustment type — shared by the adjustment buttons, the
 *  add-adjustment sheet title, and the label stored on the adjustment itself. */
export const ADJUSTMENT_LABELS: Record<AdjustmentType, string> = {
  tax: 'Tax',
  tip: 'Tip',
  discount: 'Discount',
  service: 'Service Charge',
};

/**
 * Poll a just-written file until it reports as fully flushed to disk, instead
 * of trusting a single immediate read. `File.exists`/`.size` are live native
 * reads, and a large camera photo can still be mid-write the instant
 * `pickAttachment()` resolves — a bare `new File(uri)` check right after can
 * catch that split second and report a false failure.
 */
async function waitForFileReady(uri: string, attempts = 5, delayMs = 150): Promise<File> {
  let file = new File(uri);
  for (let i = 0; i < attempts - 1 && (!file.exists || (file.size ?? 0) === 0); i++) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    file = new File(uri);
  }
  return file;
}

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
  /**
   * The bill's own date. `handleSave` used to hardcode `Date.now()` on update as
   * well as insert, so fixing a July bill in August silently moved it to August:
   * July's totals lost it and August gained it, with no date field on screen to
   * hint that anything had changed. An edit must preserve the date it loaded.
   */
  const [txnDate, setTxnDate] = useState(() => Date.now());
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
  const [attachmentUri, setAttachmentUri] = useState<string | null>(null);
  // The receipt this bill had *before* any edit-mode change, captured once at
  // load. Replacing/removing the receipt while editing overwrites `attachmentUri`
  // itself, so without this the old file's path is gone by save time and never
  // unlinked — a ref (not state) since nothing should re-render off it.
  const originalAttachmentUriRef = useRef<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ rawText: string | null; candidates: ParsedLineItem[]; fellBack?: boolean } | null>(null);
  const [showScanSheet, setShowScanSheet] = useState(false);

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
          setTxnDate(t.date);
          setAttachmentUri(t.attachment_uri ?? null);
          originalAttachmentUriRef.current = t.attachment_uri ?? null;
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

  /** Bulk-append items (from a receipt scan) — same shape addItem() produces. */
  function addItems(drafts: ParsedLineItem[]) {
    if (drafts.length === 0) return;
    setItems(prev => [
      ...prev,
      ...drafts.map(d => ({
        id: Math.random().toString(),
        name: d.name,
        qty: d.qty,
        unitPrice: d.unitPrice,
        assignedTo: [] as string[],
      })),
    ]);
  }

  function removeItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id));
    setEditingId(c => (c === id ? null : c));
  }

  /** Inline edit of an existing item's name / qty / unit price. */
  function updateItem(id: string, patch: Partial<Pick<LineItemDraft, 'name' | 'qty' | 'unitPrice'>>) {
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)));
  }

  // ---- receipt scan (iOS only — see AttachmentRow/pickAttachment for the same
  // capture pattern Quick-Add uses) -------------------------------------------

  /**
   * Capture a receipt photo (persisted like any other attachment), run it
   * through the active receipt-scan provider (device or cloud — see
   * lib/ocrProviders), and open the scan sheet with whatever raw text the
   * provider returns (device only) plus its line-item guesses. Never throws
   * to the caller — storage/scan failures surface as an Alert so a failed
   * scan never blocks manual entry.
   */
  async function handleScanReceipt(source: 'camera' | 'gallery') {
    if (scanning) return;
    setScanning(true);
    try {
      const uri = await pickAttachment(source);
      if (!uri) return; // cancelled or permission denied
      setAttachmentUri(uri);

      // Verify the copy actually landed on disk before handing it to native
      // code — if this is ever false after retrying, that tells us definitively
      // the problem is a JS-side copy race, not the native OCR module, which the
      // identical "failed to load" error from the native side couldn't
      // distinguish. `File.exists`/`.size` are live native reads (not cached at
      // construction), and a large camera photo can still be mid-flush to disk
      // the instant pickAttachment() resolves — a single immediate check can
      // read `false`/`0` a beat before the file is actually ready, so retry a
      // few times before concluding the copy genuinely failed.
      const written = await waitForFileReady(uri);
      if (!written.exists || (written.size ?? 0) === 0) {
        setScanResult({
          rawText: `[Pre-flight check failed] The photo wasn't fully saved before scanning (exists=${written.exists}, size=${written.size ?? 0}). This points to the copy step, not the OCR itself — try again.`,
          candidates: [],
        });
        setShowScanSheet(true);
        return;
      }

      try {
        const extractor = await getReceiptExtractor();
        const result = await extractor.extractLineItems(uri);
        setScanResult(result);
      } catch (scanError) {
        // Surface the REAL error in the debug panel instead of silently
        // showing "No text detected" — that message is indistinguishable from a
        // genuinely blank receipt and hides real failures (permission issues, a
        // stale native-module bridge after a hot reload, a network/proxy error
        // on the cloud path, etc).
        const msg = scanError instanceof Error ? scanError.message : String(scanError);
        setScanResult({ rawText: `[Scan error — this is not "no text found", the scan itself failed]\n${msg}`, candidates: [] });
      }
      setShowScanSheet(true);
    } catch (e) {
      const msg = e instanceof AttachmentStorageError ? e.message : 'Could not scan that receipt. Try again, or add items manually.';
      Alert.alert('Scan failed', msg);
    } finally {
      setScanning(false);
    }
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
      label: ADJUSTMENT_LABELS[adjType],
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
        date: txnDate,
        category: selectedCategory?.name ?? 'Other',
        note: note.trim() || undefined,
        attachmentUri: attachmentUri ?? undefined,
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
        adjustments,
        lat: place?.lat,
        lng: place?.lng,
        placeLabel: place?.label ?? undefined,
      };
      if (isEditing) {
        await updateItemizedTxn(db, editId!, payload);
        // Replacing/removing the receipt while editing must unlink the old
        // file — otherwise it orphans on disk forever, since nothing else
        // ever revisits a bill's *previous* attachment.
        const original = originalAttachmentUriRef.current;
        if (original && original !== attachmentUri) await deleteAttachment(original);
      } else {
        await insertItemizedTxn(db, payload);
      }
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
    txnDate, setTxnDate,
    // items
    items, editingId, setEditingId,
    newName, setNewName, newQty, setNewQty, newPrice, setNewPrice,
    addItem, addItems, removeItem, updateItem,
    toggleAssign, splitRestEqually, setItemSplitMode, setItemSplitValue,
    expandedItem, setExpandedItem,
    // receipt scan
    attachmentUri, scanning, scanResult, showScanSheet, setShowScanSheet, handleScanReceipt,
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
