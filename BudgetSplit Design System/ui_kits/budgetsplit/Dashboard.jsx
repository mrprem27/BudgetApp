/* Dashboard (Home tab) — the BudgetSplit landing screen.
   Hero spending card, budget rollup, owe/owed, donut by category, groups. */
function Dashboard({ onOpenGroup }) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const { TabPills, AmountText, Card, BudgetBar, Badge, Icon, IconCircle, formatRupees, formatRupeesShort } = DS;
  const D = window.BS_DATA;
  const [tab, setTab] = React.useState('month');

  const net = D.month.income - D.month.spending;
  const savings = Math.round((net / D.month.income) * 100);
  const delta = D.month.spending - D.month.prevSpending;
  const deltaPct = Math.round((delta / D.month.prevSpending) * 100);

  // Donut via conic-gradient
  const total = D.byCategory.reduce((s, c) => s + c.paise, 0);
  let acc = 0;
  const stops = D.byCategory.map((c) => {
    const start = (acc / total) * 360;
    acc += c.paise;
    const end = (acc / total) * 360;
    return `${c.color} ${start}deg ${end}deg`;
  }).join(', ');

  const label = { fontFamily: 'var(--font-ui)', fontSize: 'var(--label-size)', color: 'var(--text-secondary)' };
  const cap = { fontFamily: 'var(--font-ui)', fontSize: 'var(--caption-size)', color: 'var(--text-muted)' };

  return (
    <div style={{ padding: '0 16px 130px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 20px' }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--title-size)', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)' }}>BudgetSplit</div>
        <DS.MemberAvatar name={D.me.name} color={D.me.color} size={34} />
      </div>

      <TabPills tabs={[{ key: 'today', label: 'Today' }, { key: 'month', label: 'Month' }, { key: 'year', label: 'Year' }]} value={tab} onChange={setTab} style={{ marginBottom: 20 }} />

      {/* Spending hero */}
      <Card style={{ boxShadow: 'var(--shadow-md)', marginBottom: 16, padding: 24 }}>
        <div style={{ ...label, marginBottom: 4 }}>My spending</div>
        <AmountText paise={D.month.spending} size="xl" forceColor="var(--text-primary)" rounded />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
          <Icon name="arrow-up-right" size={13} color="var(--expense)" />
          <span style={{ ...label, color: 'var(--expense)' }}>{Math.abs(deltaPct)}% vs last month</span>
        </div>
        <div style={{ display: 'flex', marginTop: 18 }}>
          {[['Income', <AmountText paise={D.month.income} size="md" forceColor="var(--income)" rounded />],
            ['Net', <AmountText paise={net} size="md" forceColor="var(--text-primary)" rounded />],
            ['Savings', <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--income)' }}>{savings}%</span>]].map(([t, node], i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={cap}>{t}</span>
              {node}
            </div>
          ))}
        </div>
      </Card>

      {/* Budget rollup */}
      <Card onClick={() => {}} style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--subheading-size)', fontWeight: 600, color: 'var(--text-primary)' }}>Budget</span>
          <Icon name="chevron-right" size={16} color="var(--text-muted)" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {[['Budget', D.budget.allocated, 'var(--text-primary)'], ['Spent', D.budget.spent, 'var(--text-primary)'], ['Left', Math.max(0, D.budget.allocated - D.budget.spent), 'var(--income)']].map(([t, v, c], i) => (
            <React.Fragment key={i}>
              {i > 0 && <div style={{ width: 1, height: 28, background: 'var(--border)' }} />}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span style={cap}>{t}</span>
                <AmountText paise={v} size="sm" forceColor={c} rounded />
              </div>
            </React.Fragment>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Badge label={`${D.budget.over} over budget`} icon="alert-triangle" tone="expense" />
          <Badge label={`${D.budget.near} near limit`} icon="clock" tone="amber" />
        </div>
      </Card>

      {/* Owe / owed */}
      <Card onClick={() => {}} style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--body-size)', color: 'var(--text-secondary)' }}>
          You owe {formatRupees(D.owe)} · Owed {formatRupees(D.owed)}
        </span>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--label-size)', fontWeight: 600, color: 'var(--accent)' }}>Settle Up</span>
      </Card>

      {/* Donut */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ ...label, marginBottom: 16 }}>Spending by category</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <div style={{ position: 'relative', width: 132, height: 132, flexShrink: 0 }}>
            <div style={{ width: 132, height: 132, borderRadius: '50%', background: `conic-gradient(${stops})` }} />
            <div style={{ position: 'absolute', inset: 26, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 22, color: 'var(--text-primary)' }}>{D.byCategory.length}</span>
              <span style={cap}>categories</span>
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}>
            {D.byCategory.slice(0, 5).map((c) => (
              <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: c.color, flexShrink: 0 }} />
                <span style={{ ...cap, color: 'var(--text-secondary)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                <span style={{ ...cap, width: 34, textAlign: 'right' }}>{Math.round((c.paise / total) * 100)}%</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)', width: 62, textAlign: 'right' }}>{formatRupeesShort(c.paise)}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Groups */}
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--subheading-size)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>Groups</div>
      <Card padded={false}>
        {D.groups.map((g, i) => (
          <React.Fragment key={g.id}>
            {i > 0 && <div style={{ height: 1, background: 'var(--border)' }} />}
            <div onClick={() => onOpenGroup && onOpenGroup(g)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, cursor: 'pointer' }}>
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
