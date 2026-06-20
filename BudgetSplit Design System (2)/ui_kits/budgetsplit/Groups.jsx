/* Groups tab — leads with a balances hero (net position + who-owes-whom,
   tap a person to settle), then the list of budget groups with health bars.
   Mirrors the dashboard/reports "hero → progressive detail" pattern. */
function Groups({ onOpenGroup, onSettle }) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const { Card, BudgetBar, MemberAvatar, Icon, AmountText } = DS;
  const fmt = window.BS_formatRupeesShort;
  const D = window.BS_DATA;
  const [store] = window.useBS();

  const owe = store.balances.filter((b) => b.net < 0);
  const owed = store.balances.filter((b) => b.net > 0);
  const youOwe = owe.reduce((s, b) => s + -b.net, 0);
  const youAreOwed = owed.reduce((s, b) => s + b.net, 0);
  const net = youAreOwed - youOwe;
  const settled = store.balances.filter((b) => b.net !== 0);
  // biggest balances first
  const people = [...settled].sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

  const cap = { fontFamily: 'var(--font-ui)', fontSize: 'var(--caption-size)', color: 'var(--text-secondary)' };
  const lbl = { fontFamily: 'var(--font-ui)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', margin: '20px 2px 10px' };

  return (
    <div style={{ padding: '0 16px 130px' }}>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--title-size)', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)', padding: '8px 0 20px' }}>Groups</div>

      {/* Balances hero */}
      <Card style={{ boxShadow: 'var(--shadow-md)', marginBottom: 4, padding: 22 }}>
        <div style={{ ...cap, color: 'var(--text-secondary)', marginBottom: 4 }}>Net balance · {settled.length} {settled.length === 1 ? 'person' : 'people'}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 38, letterSpacing: '-1px', color: net < 0 ? 'var(--expense)' : 'var(--income)' }}>{net < 0 ? '−' : '+'}{fmt(Math.abs(net))}</span>
          <span style={{ ...cap, color: 'var(--text-muted)' }}>{net < 0 ? 'you owe overall' : 'in your favour'}</span>
        </div>
        <div style={{ display: 'flex', marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={cap}>You owe</span>
            <AmountText paise={youOwe} size="md" forceColor="var(--expense)" rounded />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, borderLeft: '1px solid var(--border)', paddingLeft: 16 }}>
            <span style={cap}>You're owed</span>
            <AmountText paise={youAreOwed} size="md" forceColor="var(--income)" rounded />
          </div>
        </div>
      </Card>

      {/* Who owes whom — tap to settle */}
      <div style={lbl}>Settle up · tap a person</div>
      <Card padded={false} style={{ padding: '4px 16px' }}>
        {people.map((b, i) => {
          const youOweThem = b.net < 0;
          return (
            <div key={b.name} onClick={onSettle} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: i < people.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}>
              <MemberAvatar name={b.name} color={b.color} size={36} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--body-size)', fontWeight: 600, color: 'var(--text-primary)' }}>{b.name}</div>
                <div style={{ ...cap, color: 'var(--text-muted)' }}>{youOweThem ? 'you owe' : 'owes you'}</div>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: youOweThem ? 'var(--expense)' : 'var(--income)' }}>{fmt(Math.abs(b.net))}</span>
              <Icon name="chevron-right" size={16} color="var(--text-muted)" />
            </div>
          );
        })}
      </Card>

      {/* Group list */}
      <div style={lbl}>Your groups</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {D.groups.map((g) => (
          <Card key={g.id} onClick={() => onOpenGroup && onOpenGroup(g)} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, background: `color-mix(in srgb, ${g.color} 13%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name={g.icon} size={20} color={g.color} />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--subheading-size)', fontWeight: 600, color: 'var(--text-primary)' }}>{g.name}</span>
              <span style={cap}>{fmt(g.spent)} this month{!g.personal ? ` · ${g.members} members` : ''}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1 }}><BudgetBar pct={g.pct} health={g.health} height={5} /></div>
                <span style={{ ...cap, color: 'var(--text-muted)', minWidth: 30, textAlign: 'right' }}>{g.pct}%</span>
              </div>
            </div>
            <Icon name="chevron-right" size={18} color="var(--text-muted)" />
          </Card>
        ))}
      </div>
    </div>
  );
}
window.BS_Groups = Groups;
