/**
 * The model reads each line as {name, qty, amount}: `amount` is the figure printed at the end of
 * the line, which on almost every receipt is the LINE TOTAL (qty × rate). The app multiplies
 * qty × unitPrice, so a line total sent as `unitPrice` counted a 4-naan line four times over
 * (a ₹1,280 bill read as ₹2,880). The per-unit price is worked out here instead.
 *
 * When the total does not divide evenly into the quantity (₹100 for 3), the line stays one item
 * at its printed total, with the quantity kept in the name, so the bill still adds to the paisa.
 */
export type ModelLine = { name?: unknown; qty?: unknown; amount?: unknown };
export type Item = { name: string; qty: string; unitPrice: string };

const paise = (v: unknown): number | null => {
  const n = Number(String(v ?? '').replace(/[^0-9.]/g, ''));
  return String(v ?? '').trim() && Number.isFinite(n) ? Math.round(n * 100) : null;
};
const rupees = (p: number) => (p / 100).toFixed(2);

export function normalizeItems(lines: unknown): Item[] {
  if (!Array.isArray(lines)) return [];
  const out: Item[] = [];
  for (const l of lines as ModelLine[]) {
    const name = typeof l?.name === 'string' ? l.name.trim() : '';
    const total = paise(l?.amount);
    if (!name || total === null || total <= 0) continue;
    const q = Math.floor(Number(String(l?.qty ?? '1').replace(/[^0-9.]/g, '')));
    const qty = Number.isFinite(q) && q >= 1 ? q : 1;
    if (qty > 1 && total % qty === 0) out.push({ name, qty: String(qty), unitPrice: rupees(total / qty) });
    else out.push({ name: qty > 1 ? `${name} ×${qty}` : name, qty: '1', unitPrice: rupees(total) });
  }
  return out;
}
