/* Category detail — drill-in from the donut wedge. Shows the category's spend,
   its budget health, and the transactions behind it. */
function CategoryDetail({ category, onBack }) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const { Card, Divider, TransactionRow, BudgetBar, Icon, AmountText, EmptyState } = DS;
  const fmt = window.BS_formatRupeesShort;
  const D = window.BS_DATA;
  const [store] = window.useBS();
  const c = category;

  const totalSpend = D.byCategory.reduce((s, x) => s + x.paise, 0);
  const share = Math.round((c.paise / totalSpend) * 100);
  const line = D.budgetLines.find((l) => l.name === c.name);
  const pct = line && line.allocated ? Math.round((line.spent / line.allocated) * 100) : null;
  const health = pct === null ? 'green' : pct > 100 ? 'red' : pct >= 85 ? 'amber' : 'green';

  let txns = store.txns.filter((t) => t.category === c.name);
  if (txns.length === 0) txns = [{ id: 'syn', category: c.name, note: 'This month', icon: c.icon, color: c.color, paise: -c.paise, kind: 'expense', when: 'This month' }];
  const count = txns.length;
  const avg = Math.round(c.paise / count);

  const cap = { fontFamily: 'var(--font-ui)', fontSize: 'var(--caption-size)', color: 'var(--text-muted)' };
  const lbl = { fontFamily: 'var(--font-ui)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', margin: '0 2px 10px' };

  return (
    <div style={{ padding: '0 16px 130px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0 16px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginLeft: -6, display: 'flex' }}>
          <Icon name="chevron-left" size={26} color="var(--text-secondary)" />
        </button>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--heading-size)', fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</span>
      </div>

      {/* Hero */}
      <Card style={{ boxShadow: 'var(--shadow-md)', marginBottom: 16, padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: line ? 16 : 0 }}>
          <span style={{ width: 52, height: 52, borderRadius: 16, background: `color-mix(in srgb, ${c.color} 14%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name={c.icon} size={24} color={c.color} />
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 30, letterSpacing: '-0.6px', color: 'var(--text-primary)' }}>{fmt(c.paise)}</div>
            <div style={cap}>{share}% of spending · {count} txn{count !== 1 ? 's' : ''} · avg {fmt(avg)}</div>
          </div>
        </div>
        {line && (
          <div>
            <BudgetBar pct={pct} health={health} height={6} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7 }}>
              <span style={cap}>{fmt(line.spent)} of {fmt(line.allocated)} budget</span>
              <span style={{ ...cap, color: line.allocated - line.spent < 0 ? 'var(--expense)' : 'var(--income)' }}>
                {line.allocated - line.spent < 0 ? `${fmt(line.spent - line.allocated)} over` : `${fmt(line.allocated - line.spent)} left`}
              </span>
            </div>
          </div>
        )}
      </Card>

      <div style={lbl}>Transactions</div>
      <Card padded={false} style={{ padding: '4px 16px' }}>
        {txns.map((t, i) => (
          <React.Fragment key={t.id || i}>
            {i > 0 && <Divider inset={56} />}
            <TransactionRow category={t.note || t.category} note={t.when} icon={t.icon || c.icon} color={t.color || c.color} paise={t.paise} kind={t.kind} />
          </React.Fragment>
        ))}
      </Card>
    </div>
  );
}
window.BS_CategoryDetail = CategoryDetail;
