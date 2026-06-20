/* Dashboard (Home) — decluttered, progressive-disclosure layout:
   one spending hero → interactive donut centerpiece (drill into a category) →
   compact Budget + Balances tiles → recent → groups. */
function Dashboard({ onOpenGroup, onSettle, onOpenBudget, onOpenCategory }) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const { AmountText, Card, Divider, TransactionRow, BudgetBar, Icon } = DS;
  const formatRupees = window.BS_formatRupees, fmt = window.BS_formatRupeesShort;
  const D = window.BS_DATA;
  const [store] = window.useBS();
  const CategoryDonut = window.BS_CategoryDonut;

  // live spending
  const extra = store.txns.filter((t) => String(t.id).startsWith('t-') && t.kind === 'expense').reduce((s, t) => s + Math.abs(t.paise), 0);
  const spending = D.month.spending + extra;
  const net = D.month.income - spending;
  const savings = Math.round((net / D.month.income) * 100);
  const deltaPct = Math.round(((spending - D.month.prevSpending) / D.month.prevSpending) * 100);

  const youOwe = store.balances.filter((b) => b.net < 0).reduce((s, b) => s + -b.net, 0);
  const oweCount = store.balances.filter((b) => b.net < 0).length;
  const catTotal = D.byCategory.reduce((s, c) => s + c.paise, 0);

  const util = Math.round((D.budget.spent / D.budget.allocated) * 100);
  const left = D.budget.allocated - D.budget.spent;

  const label = { fontFamily: 'var(--font-ui)', fontSize: 'var(--label-size)', color: 'var(--text-secondary)' };
  const cap = { fontFamily: 'var(--font-ui)', fontSize: 'var(--caption-size)', color: 'var(--text-muted)' };
  const sect = { fontFamily: 'var(--font-ui)', fontSize: 'var(--subheading-size)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 };

  return (
    <div style={{ padding: '0 16px 130px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 20px' }}>
        <div>
          <div style={{ ...cap, marginBottom: 2 }}>Good evening</div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--title-size)', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)' }}>{D.me.name.split(' ')[0]}</div>
        </div>
        <DS.MemberAvatar name={D.me.name} color={D.me.color} size={38} />
      </div>

      {/* Spending hero */}
      <Card style={{ boxShadow: 'var(--shadow-md)', marginBottom: 16, padding: 24 }}>
        <div style={{ ...label, marginBottom: 4 }}>My spending · this month</div>
        <AmountText paise={spending} size="xl" forceColor="var(--text-primary)" rounded />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
          <Icon name={deltaPct >= 0 ? 'arrow-up-right' : 'arrow-down-right'} size={13} color={deltaPct >= 0 ? 'var(--expense)' : 'var(--income)'} />
          <span style={{ ...label, color: deltaPct >= 0 ? 'var(--expense)' : 'var(--income)' }}>{Math.abs(deltaPct)}% vs last month</span>
        </div>
        <div style={{ display: 'flex', marginTop: 18 }}>
          {[['Income', <AmountText paise={D.month.income} size="md" forceColor="var(--income)" rounded />],
            ['Net', <AmountText paise={net} size="md" forceColor="var(--text-primary)" rounded />],
            ['Saved', <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--income)' }}>{savings}%</span>]].map(([t, node], i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={cap}>{t}</span>
              {node}
            </div>
          ))}
        </div>
      </Card>

      {/* Donut centerpiece */}
      <Card style={{ marginBottom: 16, padding: '22px 16px 18px' }}>
        <div style={{ ...label, marginBottom: 4, textAlign: 'center' }}>Where it went</div>
        <CategoryDonut data={D.byCategory} total={catTotal} onOpen={(c) => onOpenCategory && onOpenCategory(c)} />
      </Card>

      {/* Compact tiles: Budget + Balances */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        <Card onClick={onOpenBudget} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={label}>Budget</span>
            <Icon name="chevron-right" size={15} color="var(--text-muted)" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 26, letterSpacing: '-0.5px', color: util > 100 ? 'var(--health-red)' : util >= 85 ? 'var(--health-amber)' : 'var(--income)' }}>{util}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-secondary)' }}>%</span>
          </div>
          <BudgetBar pct={util} health={util > 100 ? 'red' : util >= 85 ? 'amber' : 'green'} height={5} />
          <span style={cap}>{fmt(left)} left</span>
        </Card>

        <Card onClick={onSettle} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={label}>Balances</span>
            <Icon name="chevron-right" size={15} color="var(--text-muted)" />
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--caption-size)', color: 'var(--text-muted)' }}>You owe</div>
          <AmountText paise={youOwe} size="md" forceColor="var(--expense)" rounded />
          <span style={cap}>{oweCount} {oweCount === 1 ? 'person' : 'people'} · tap to settle</span>
        </Card>
      </div>

      {/* Recent */}
      <div style={sect}>Recent</div>
      <Card padded={false} style={{ padding: '4px 16px', marginBottom: 24 }}>
        {store.txns.slice(0, 3).map((t, i) => (
          <React.Fragment key={t.id}>
            {i > 0 && <Divider inset={56} />}
            <TransactionRow category={t.category} note={t.note} icon={t.icon} color={t.color} paise={t.paise} kind={t.kind} />
          </React.Fragment>
        ))}
      </Card>

      {/* Groups */}
      <div style={sect}>Groups</div>
      <Card padded={false}>
        {D.groups.map((g, i) => (
          <React.Fragment key={g.id}>
            {i > 0 && <div style={{ height: 1, background: 'var(--border)' }} />}
            <div onClick={() => onOpenGroup && onOpenGroup(g)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, cursor: 'pointer' }}>
              <span style={{ width: 38, height: 38, borderRadius: 12, background: `color-mix(in srgb, ${g.color} 13%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={g.icon} size={17} color={g.color} />
              </span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--body-size)', fontWeight: 600, color: 'var(--text-primary)' }}>{g.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1 }}><BudgetBar pct={g.pct} health={g.health} height={4} /></div>
                  <span style={{ ...cap, minWidth: 30, textAlign: 'right' }}>{g.pct}%</span>
                </div>
              </div>
              <Icon name="chevron-right" size={16} color="var(--text-muted)" />
            </div>
          </React.Fragment>
        ))}
      </Card>
    </div>
  );
}
window.BS_Dashboard = Dashboard;
