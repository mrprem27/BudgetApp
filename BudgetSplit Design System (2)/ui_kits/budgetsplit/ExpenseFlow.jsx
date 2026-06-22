/* Complete "Add expense" flow — the core daily action, built for speed:
   live amount (Space Mono) → pick a category → optional note → Add.
   On save the transaction is pushed to the store and shows a success tick. */
function ExpenseFlow({ onClose, onSaved, kind = 'expense' }) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const { Button, Icon, IconCircle, BudgetBar, Card } = DS;
  const Keypad = window.BS_Keypad;
  const fmt = window.BS_formatRupeesShort;
  const D = window.BS_DATA;
  const income = kind === 'income';
  const cats = income ? window.BS_INCOME_CATS : window.BS_CATS;

  const [entry, setEntry] = React.useState('');
  const [cat, setCat] = React.useState(null);
  const [note, setNote] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const paise = window.BS_entryToPaise(entry);
  const ready = paise > 0 && cat !== null;

  // live budget impact — connects data entry to the analytics layer
  const selCat = cat !== null ? cats[cat] : null;
  const budgetLine = !income && selCat ? D.budgetLines.find((l) => l.name === selCat.name) : null;
  let impact = null;
  if (budgetLine && budgetLine.allocated > 0) {
    const curPct = Math.round((budgetLine.spent / budgetLine.allocated) * 100);
    const newSpent = budgetLine.spent + (paise > 0 ? paise : 0);
    const newPct = Math.round((newSpent / budgetLine.allocated) * 100);
    const health = newPct > 100 ? 'red' : newPct >= 85 ? 'amber' : 'green';
    impact = { curPct, newPct, health, allocated: budgetLine.allocated, newSpent };
  }

  function add() {
    if (!ready || saving) return;
    setSaving(true);
    const c = cats[cat];
    window.BS_STORE.addTxn({ category: c.name, note: note || null, icon: income ? 'trending-up' : c.icon, color: income ? '#2BD49B' : c.color, paise: income ? paise : -paise, kind });
    onSaved && onSaved();
  }

  return (
    <window.BS_FlowShell
      title={income ? 'Add income' : 'Add expense'}
      onClose={onClose}
      closeIcon="x"
      footer={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Keypad onKey={(k) => setEntry((s) => window.BS_keyReduce(s, k))} />
          <Button label={ready ? `Add ₹${window.BS_fmtEntry(entry)}` : (income ? 'Add income' : 'Add expense')} variant="primary" fullWidth disabled={!ready} onClick={add} />
        </div>
      }
    >
      {/* Amount hero */}
      <div style={{ textAlign: 'center', padding: '10px 0 18px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 44, letterSpacing: '-1px', color: paise > 0 ? (income ? 'var(--income)' : 'var(--text-primary)') : 'var(--text-muted)' }}>
          <span style={{ fontSize: 28, verticalAlign: '6px', marginRight: 2 }}>{income ? '+₹' : '₹'}</span>{window.BS_fmtEntry(entry)}
        </div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--caption-size)', color: 'var(--text-muted)', marginTop: 4 }}>
          {cat !== null ? cats[cat].name : 'Enter amount, pick a category'}
        </div>
      </div>

      {/* Category grid */}
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', margin: '0 2px 10px' }}>Category</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 18 }}>
        {cats.map((c, i) => {
          const on = cat === i;
          return (
            <button key={c.name} onClick={() => setCat(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '4px 0' }}>
              <span style={{ width: 46, height: 46, borderRadius: '50%', background: on ? c.color : `color-mix(in srgb, ${c.color} 13%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 140ms ease, transform 140ms ease', transform: on ? 'scale(1.06)' : 'scale(1)', boxShadow: on ? '0 0 0 2px var(--bg), 0 0 0 4px ' + c.color : 'none' }}>
                <Icon name={c.icon} size={19} color={on ? '#0A0F11' : c.color} />
              </span>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, color: on ? 'var(--text-primary)' : 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.2 }}>{c.name}</span>
            </button>
          );
        })}
      </div>

      {/* Live budget impact */}
      {impact && (
        <Card style={{ marginBottom: 18, padding: 14, display: 'flex', alignItems: 'center', gap: 12, animation: 'bsFade 220ms ease' }}>
          <IconCircle name={selCat.icon} color={selCat.color} size={34} iconSize={16} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--caption-size)', color: 'var(--text-muted)', marginBottom: 6 }}>{selCat.name} budget · {fmt(impact.newSpent)} of {fmt(impact.allocated)}</div>
            <BudgetBar pct={impact.newPct} health={impact.health} height={5} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, fontFamily: 'var(--font-mono)', fontSize: 13 }}>
            <span style={{ color: 'var(--text-muted)' }}>{impact.curPct}%</span>
            <Icon name="arrow-right" size={11} color="var(--text-muted)" />
            <span style={{ color: impact.health === 'red' ? 'var(--expense)' : impact.health === 'amber' ? 'var(--health-amber)' : 'var(--income)' }}>{impact.newPct}%</span>
          </div>
        </Card>
      )}

      {/* Note */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0 14px', height: 48 }}>
        <Icon name="edit-2" size={16} color="var(--text-muted)" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional)" style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', fontSize: 'var(--body-size)' }} />
      </div>
    </window.BS_FlowShell>
  );
}
window.BS_ExpenseFlow = ExpenseFlow;
