/* Add bottom-sheet — the FAB's action menu. Slides up from the bottom. */
function AddSheet({ open, onClose }) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const { Icon } = DS;
  const actions = [
    { label: 'Expense', icon: 'minus-circle', tint: 'var(--expense)', desc: 'Record spending' },
    { label: 'Income', icon: 'plus-circle', tint: 'var(--income)', desc: 'Money you received' },
    { label: 'Transfer', icon: 'repeat', tint: 'var(--settle)', desc: 'Move money between people' },
    { label: 'Itemized Bill', icon: 'list', tint: 'var(--accent)', desc: 'Split a bill line by line' },
  ];
  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
        transition: 'opacity 220ms ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          borderTopLeftRadius: 'var(--radius-lg)', borderTopRightRadius: 'var(--radius-lg)',
          padding: '8px 24px 34px', boxShadow: 'var(--shadow-lg)',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 280ms cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--border)', margin: '8px auto 16px' }} />
        {actions.map((a) => (
          <div key={a.label} onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 4px', minHeight: 56, cursor: 'pointer' }}>
            <div style={{ width: 40, height: 40, borderRadius: 20, background: `color-mix(in srgb, ${a.tint} 13%, transparent)`, border: `1px solid color-mix(in srgb, ${a.tint} 27%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={a.icon} size={18} color={a.tint} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--body-size)', fontWeight: 600, color: 'var(--text-primary)' }}>{a.label}</div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--caption-size)', color: 'var(--text-secondary)', marginTop: 1 }}>{a.desc}</div>
            </div>
            <Icon name="chevron-right" size={16} color="var(--text-muted)" />
          </div>
        ))}
      </div>
    </div>
  );
}
window.BS_AddSheet = AddSheet;
