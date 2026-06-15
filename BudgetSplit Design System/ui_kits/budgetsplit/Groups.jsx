/* Groups tab — list of budget groups with spend + members + budget health. */
function Groups({ onOpenGroup }) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const { Card, BudgetBar, IconCircle, Icon, formatRupeesShort } = DS;
  const D = window.BS_DATA;
  const cap = { fontFamily: 'var(--font-ui)', fontSize: 'var(--caption-size)', color: 'var(--text-secondary)' };

  return (
    <div style={{ padding: '0 16px 130px' }}>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--title-size)', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)', padding: '8px 0 20px' }}>Groups</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {D.groups.map((g) => (
          <Card key={g.id} onClick={() => onOpenGroup && onOpenGroup(g)} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, background: `color-mix(in srgb, ${g.color} 13%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name={g.icon} size={20} color={g.color} />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--subheading-size)', fontWeight: 600, color: 'var(--text-primary)' }}>{g.name}</span>
              <span style={cap}>{formatRupeesShort(g.spent)} this month{!g.personal ? ` · ${g.members} members` : ''}</span>
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
