/* Budget & Insights — the analytics heart (V2 Phase A). Pushed from the
   dashboard Budget card. Utilization hero → needs-attention → projection →
   recommendations → all category lines. Pure derivation from BS_DATA.budgetLines. */
function BudgetInsights({ onBack, onOpenExpense }) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const { Card, BudgetBar, Badge, Icon, IconCircle, AmountText } = DS;
  const fmt = window.BS_formatRupeesShort;
  const D = window.BS_DATA;

  const lines = D.budgetLines.map((l) => {
    const pct = l.allocated > 0 ? Math.round((l.spent / l.allocated) * 100) : 0;
    const health = pct > 100 ? 'red' : pct >= 85 ? 'amber' : 'green';
    return { ...l, pct, health, remaining: l.allocated - l.spent };
  });
  const allocated = lines.reduce((s, l) => s + l.allocated, 0);
  const spent = lines.reduce((s, l) => s + l.spent, 0);
  const util = Math.round((spent / allocated) * 100);
  const over = lines.filter((l) => l.pct > 100);
  const near = lines.filter((l) => l.pct >= 85 && l.pct <= 100);
  const onTrack = lines.filter((l) => l.pct < 85 && l.spent > 0).length + lines.filter((l) => l.spent === 0).length;
  const attention = [...over, ...near].sort((a, b) => b.pct - a.pct);

  const proj = D.projection;
  const projOver = proj.projected - allocated;

  // rule-based recommendations
  const recs = [];
  over.forEach((l) => {
    const ovr = l.spent - l.allocated;
    recs.push({ icon: 'alert-triangle', tint: 'var(--expense)', text: `${l.name} is ${l.pct - 100}% over — trim about ${fmt(ovr)} to get back on track.` });
  });
  const biggestUnused = lines.filter((l) => l.remaining > 0).sort((a, b) => b.remaining - a.remaining)[0];
  if (biggestUnused && over[0]) {
    recs.push({ icon: 'shuffle', tint: 'var(--accent)', text: `${fmt(biggestUnused.remaining)} unused in ${biggestUnused.name} — you could move some to ${over[0].name}.` });
  }
  if (projOver > 0) {
    recs.push({ icon: 'trending-up', tint: 'var(--health-amber)', text: `Pacing ${Math.round((proj.projected / allocated - 1) * 100)}% above budget — projected ${fmt(proj.projected)} by month-end.` });
  } else {
    recs.push({ icon: 'check-circle', tint: 'var(--income)', text: `On pace to finish under budget — projected ${fmt(proj.projected)}.` });
  }

  const lbl = { fontFamily: 'var(--font-ui)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', margin: '0 2px 10px' };
  const cap = { fontFamily: 'var(--font-ui)', fontSize: 'var(--caption-size)', color: 'var(--text-muted)' };
  const utilColor = util > 100 ? 'var(--health-red)' : util >= 85 ? 'var(--health-amber)' : 'var(--income)';

  return (
    <div style={{ padding: '0 16px 130px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0 16px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginLeft: -6, display: 'flex' }}>
          <Icon name="chevron-left" size={26} color="var(--text-secondary)" />
        </button>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--heading-size)', fontWeight: 600, color: 'var(--text-primary)' }}>Budget &amp; Insights</span>
      </div>

      {/* Utilization hero */}
      <Card style={{ boxShadow: 'var(--shadow-md)', marginBottom: 16, padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ ...lbl, margin: '0 0 4px' }}>Budget used</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 44, letterSpacing: '-1px', color: utilColor }}>{util}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, color: utilColor }}>%</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <AmountText paise={spent} size="md" forceColor="var(--text-primary)" rounded />
            <div style={cap}>of {fmt(allocated)}</div>
          </div>
        </div>
        <BudgetBar pct={util} health={util > 100 ? 'red' : util >= 85 ? 'amber' : 'green'} height={8} />
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <Badge label={`${over.length} over`} icon="alert-triangle" tone="expense" />
          <Badge label={`${near.length} near limit`} icon="clock" tone="amber" />
          <Badge label={`${onTrack} on track`} icon="check" tone="income" />
        </div>
      </Card>

      {/* Needs attention */}
      {attention.length > 0 && (
        <>
          <div style={lbl}>Needs attention</div>
          <Card padded={false} style={{ padding: '4px 16px', marginBottom: 16 }}>
            {attention.map((l, i) => (
              <div key={l.name} style={{ padding: '14px 0', borderBottom: i < attention.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <IconCircle name={l.icon} color={l.color} size={32} iconSize={16} />
                  <span style={{ flex: 1, fontFamily: 'var(--font-ui)', fontSize: 'var(--body-size)', color: 'var(--text-primary)' }}>{l.name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: l.health === 'red' ? 'var(--expense)' : 'var(--health-amber)' }}>{l.pct}%</span>
                </div>
                <BudgetBar pct={l.pct} health={l.health} height={5} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={cap}>{fmt(l.spent)} of {fmt(l.allocated)}</span>
                  <span style={{ ...cap, color: l.remaining < 0 ? 'var(--expense)' : 'var(--income)' }}>{l.remaining < 0 ? `${fmt(-l.remaining)} over` : `${fmt(l.remaining)} left`}</span>
                </div>
              </div>
            ))}
          </Card>
        </>
      )}

      {/* Projection */}
      <Card style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 46, height: 46, borderRadius: 14, background: projOver > 0 ? 'var(--coral-muted)' : 'color-mix(in srgb, var(--income) 14%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="trending-up" size={20} color={projOver > 0 ? 'var(--expense)' : 'var(--income)'} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--body-size)', fontWeight: 600, color: 'var(--text-primary)' }}>Projected month-end {fmt(proj.projected)}</div>
          <div style={cap}>Day {proj.dayOfMonth} of {proj.daysInMonth} · {projOver > 0 ? `${fmt(projOver)} over budget at this pace` : 'under budget at this pace'}</div>
        </div>
      </Card>

      {/* Recommendations */}
      <div style={lbl}>Recommendations</div>
      <Card padded={false} style={{ padding: '4px 16px', marginBottom: 16 }}>
        {recs.map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 0', borderBottom: i < recs.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <span style={{ width: 30, height: 30, borderRadius: '50%', background: `color-mix(in srgb, ${r.tint} 14%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
              <Icon name={r.icon} size={15} color={r.tint} />
            </span>
            <span style={{ flex: 1, fontFamily: 'var(--font-ui)', fontSize: 'var(--body-size)', color: 'var(--text-secondary)', lineHeight: 1.45 }}>{r.text}</span>
          </div>
        ))}
      </Card>

      {/* All categories */}
      <div style={lbl}>All categories</div>
      <Card padded={false} style={{ padding: '4px 16px' }}>
        {lines.map((l, i) => (
          <div key={l.name} style={{ padding: '13px 0', borderBottom: i < lines.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 7 }}>
              <IconCircle name={l.icon} color={l.color} size={28} iconSize={14} />
              <span style={{ flex: 1, fontFamily: 'var(--font-ui)', fontSize: 'var(--body-size)', color: 'var(--text-primary)' }}>{l.name}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>{fmt(l.spent)} / {fmt(l.allocated)}</span>
            </div>
            <BudgetBar pct={l.pct} health={l.health} height={4} />
          </div>
        ))}
      </Card>
    </div>
  );
}
window.BS_BudgetInsights = BudgetInsights;
