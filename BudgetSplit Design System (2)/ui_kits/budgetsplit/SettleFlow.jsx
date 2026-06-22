/* Complete "Settle up" flow:
   balances list → pick a person → amount autofills to what's outstanding
   (editable via keypad) → Record payment → balance reduces, settlement logged. */
function SettleFlow({ onClose, onSaved }) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const { Button, Icon, MemberAvatar, AmountText } = DS;
  const Keypad = window.BS_Keypad;
  const [state] = window.useBS();

  const [step, setStep] = React.useState('list'); // list | pay
  const [sel, setSel] = React.useState(null);     // balance object
  const [entry, setEntry] = React.useState('');

  const youOwe = state.balances.filter((b) => b.net < 0).reduce((s, b) => s + -b.net, 0);
  const owed = state.balances.filter((b) => b.net > 0).reduce((s, b) => s + b.net, 0);

  function openPay(b) {
    setSel(b);
    setEntry((Math.abs(b.net) / 100).toString());
    setStep('pay');
  }
  function record() {
    const paise = window.BS_entryToPaise(entry);
    if (paise <= 0) return;
    window.BS_STORE.recordSettle(sel.name, paise);
    onSaved && onSaved();
  }

  const lbl = { fontFamily: 'var(--font-ui)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', margin: '0 2px 10px' };

  if (step === 'pay') {
    const paise = window.BS_entryToPaise(entry);
    const owe = sel.net < 0;
    return (
      <window.BS_FlowShell
        title="Record payment"
        onClose={() => setStep('list')}
        closeIcon="chevron-left"
        footer={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Keypad onKey={(k) => setEntry((s) => window.BS_keyReduce(s, k))} />
            <Button label="Record payment" variant="primary" fullWidth disabled={paise <= 0} onClick={record} />
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '14px 0 22px' }}>
          <MemberAvatar name={sel.name} color={sel.color} size={56} />
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--body-size)', color: 'var(--text-secondary)' }}>
            {owe ? 'You pay' : 'You receive from'} <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{sel.name.split(' ')[0]}</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 44, letterSpacing: '-1px', color: 'var(--text-primary)' }}>
            <span style={{ fontSize: 28, verticalAlign: '6px', marginRight: 2 }}>₹</span>{window.BS_fmtEntry(entry)}
          </div>
          <button onClick={() => setEntry((Math.abs(sel.net) / 100).toString())} style={{ background: 'var(--bg-muted)', border: 'none', borderRadius: 'var(--radius-pill)', color: 'var(--text-secondary)', cursor: 'pointer', padding: '6px 14px', fontFamily: 'var(--font-ui)', fontSize: 'var(--caption-size)' }}>
            Outstanding ₹{(Math.abs(sel.net) / 100).toLocaleString('en-IN')} · tap to fill
          </button>
        </div>
      </window.BS_FlowShell>
    );
  }

  return (
    <window.BS_FlowShell title="Settle up" onClose={onClose} closeIcon="x">
      {/* Summary */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 22 }}>
        <div style={{ flex: 1, background: 'var(--coral-muted)', borderRadius: 'var(--radius-lg)', padding: 16 }}>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--caption-size)', color: 'var(--text-secondary)' }}>You owe</div>
          <AmountText paise={youOwe} size="lg" forceColor="var(--expense)" />
        </div>
        <div style={{ flex: 1, background: 'color-mix(in srgb, var(--income) 12%, transparent)', borderRadius: 'var(--radius-lg)', padding: 16 }}>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--caption-size)', color: 'var(--text-secondary)' }}>You're owed</div>
          <AmountText paise={owed} size="lg" forceColor="var(--income)" />
        </div>
      </div>

      <div style={lbl}>Balances</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {state.balances.map((b) => {
          const settled = b.net === 0;
          const owe = b.net < 0;
          return (
            <div key={b.name} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 14, boxShadow: 'var(--shadow-sm)' }}>
              <MemberAvatar name={b.name} color={b.color} size={42} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--body-size)', fontWeight: 600, color: 'var(--text-primary)' }}>{b.name}</div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--caption-size)', color: settled ? 'var(--income)' : owe ? 'var(--expense)' : 'var(--income)' }}>
                  {settled ? 'All settled' : owe ? `You owe ₹${(Math.abs(b.net) / 100).toLocaleString('en-IN')}` : `Owes you ₹${(b.net / 100).toLocaleString('en-IN')}`}
                </div>
              </div>
              {settled
                ? <Icon name="check-circle" size={22} color="var(--income)" />
                : <Button label="Settle" variant="secondary" size="sm" onClick={() => openPay(b)} />}
            </div>
          );
        })}
      </div>
      <div style={{ textAlign: 'center', marginTop: 18, fontFamily: 'var(--font-ui)', fontSize: 'var(--caption-size)', color: 'var(--text-muted)' }}>
        Payments are recorded here — BudgetSplit never moves real money.
      </div>
    </window.BS_FlowShell>
  );
}
window.BS_SettleFlow = SettleFlow;
