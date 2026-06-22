/* Shared building blocks for the add/settle flows:
   FlowShell — full-screen slide-up surface with a header.
   Keypad    — fast custom numeric pad (no OS keyboard; feels native).
   SuccessOverlay — springy checkmark confirmation. */

function FlowShell({ title, onClose, closeIcon = 'chevron-left', right, children, footer }) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const { Icon } = DS;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 150, background: 'var(--bg)', display: 'flex', flexDirection: 'column', animation: 'bsSlideUp 300ms cubic-bezier(0.22,1,0.36,1)' }}>
      {/* header */}
      <div style={{ paddingTop: 56, paddingLeft: 12, paddingRight: 16, paddingBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, display: 'flex', color: 'var(--text-secondary)' }}>
          <Icon name={closeIcon} size={24} color="var(--text-secondary)" />
        </button>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--heading-size)', fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{title}</span>
        {right}
      </div>
      {/* body */}
      <div className="bs-scroll" style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 16px' }}>{children}</div>
      {/* footer */}
      {footer ? <div style={{ flexShrink: 0, padding: '12px 16px calc(16px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>{footer}</div> : null}
    </div>
  );
}
window.BS_FlowShell = FlowShell;

function Keypad({ onKey }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const { Icon } = DS;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
      {keys.map((k) => (
        <button
          key={k}
          onClick={() => onKey(k)}
          style={{
            height: 56, border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer',
            background: 'transparent', color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 400,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 120ms ease, transform 80ms ease',
          }}
          onMouseDown={(e) => { e.currentTarget.style.background = 'var(--bg-muted)'; e.currentTarget.style.transform = 'scale(0.96)'; }}
          onMouseUp={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'scale(1)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'scale(1)'; }}
        >
          {k === 'del' ? <Icon name="delete" size={22} color="var(--text-secondary)" /> : k}
        </button>
      ))}
    </div>
  );
}
window.BS_Keypad = Keypad;

function SuccessOverlay({ show, label = 'Saved' }) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const { Icon } = DS;
  if (!show) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 300, background: 'color-mix(in srgb, var(--bg) 92%, transparent)', backdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
      <div style={{ width: 92, height: 92, borderRadius: '50%', background: 'color-mix(in srgb, var(--income) 16%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'bsPop 420ms cubic-bezier(0.34,1.56,0.64,1)' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--income)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={32} color="#072018" strokeWidth={3} />
        </div>
      </div>
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--subheading-size)', fontWeight: 600, color: 'var(--text-primary)', animation: 'bsFade 500ms ease' }}>{label}</span>
    </div>
  );
}
window.BS_SuccessOverlay = SuccessOverlay;
