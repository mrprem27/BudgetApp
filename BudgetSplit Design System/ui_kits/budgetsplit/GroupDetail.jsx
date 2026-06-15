/* Group detail — members, balance banner, and the transaction ledger. Pushed
   when you tap a group. Demonstrates TransactionRow grouped by date section. */
function GroupDetail({ group, onBack }) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const { Card, Divider, TransactionRow, MemberAvatar, Button, Icon, AmountText } = DS;
  const D = window.BS_DATA;
  const g = group || D.groups[0];

  // group recent into date sections
  const sections = [];
  D.recent.forEach((t) => {
    let s = sections.find((x) => x.when === t.when);
    if (!s) { s = { when: t.when, items: [] }; sections.push(s); }
    s.items.push(t);
  });
  const cap = { fontFamily: 'var(--font-ui)', fontSize: 'var(--caption-size)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' };

  return (
    <div style={{ padding: '0 16px 130px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0 16px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginLeft: -6, display: 'flex' }}>
          <Icon name="chevron-left" size={26} color="var(--text-secondary)" />
        </button>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--heading-size)', fontWeight: 600, color: 'var(--text-primary)' }}>{g.name}</span>
      </div>

      {/* Members + balance */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex' }}>
            {D.members.map((m, i) => (
              <span key={m.name} style={{ marginLeft: i ? -10 : 0, borderRadius: '50%', boxShadow: '0 0 0 2px var(--bg-card)' }}>
                <MemberAvatar name={m.name} color={m.color} size={36} />
              </span>
            ))}
          </div>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--caption-size)', color: 'var(--text-secondary)' }}>{g.members} members</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--label-size)', color: 'var(--text-secondary)', marginBottom: 4 }}>You owe Priya</div>
            <AmountText paise={-90000} size="lg" />
          </div>
          <div style={{ width: 130 }}><Button label="Settle Up" variant="secondary" size="md" fullWidth /></div>
        </div>
      </Card>

      {/* Ledger */}
      {sections.map((s) => (
        <div key={s.when} style={{ marginBottom: 8 }}>
          <div style={{ ...cap, margin: '12px 4px 4px' }}>{s.when}</div>
          <Card padded={false} style={{ padding: '0 16px' }}>
            {s.items.map((t, i) => (
              <React.Fragment key={i}>
                {i > 0 && <Divider inset={56} />}
                <TransactionRow {...t} onClick={() => {}} />
              </React.Fragment>
            ))}
          </Card>
        </div>
      ))}
    </div>
  );
}
window.BS_GroupDetail = GroupDetail;
