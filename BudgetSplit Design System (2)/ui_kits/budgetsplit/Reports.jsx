/* Reports tab — interactive, progressive-disclosure analytics.
   Tap a trend bar: it lifts, the rest dim, and a detail panel reveals that
   period's total, budget delta, and the categories behind it. A dashed budget
   overlay sits across the chart. Category list rows drill into CategoryDetail.
   Mirrors the dashboard donut's tap-to-reveal pattern. */
function Reports({ onOpenCategory }) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const { Card, TabPills, Badge, Icon, IconCircle } = DS;
  const fmt = window.BS_formatRupeesShort;
  const D = window.BS_DATA;
  const [range, setRange] = React.useState('month');
  const [sel, setSel] = React.useState(null);
  // reset selection when switching range
  React.useEffect(() => { setSel(null); }, [range]);

  const series = D.reports[range];
  const bars = series.bars;
  const budget = series.budget;
  const total = bars.reduce((s, b) => s + b.paise, 0);
  const periodBudget = budget * bars.length;
  const maxV = Math.max(...bars.map((b) => b.paise), budget);
  const avg = Math.round(total / bars.length);
  const periodDelta = total - periodBudget;
  const selected = sel !== null ? bars[sel] : null;

  // map a trend top-category to the dashboard's byCategory entry so drill-in
  // lands on the full month context; fall back to the week's own figures.
  const resolveCat = (t) => D.byCategory.find((c) => c.name === t.name) || { name: t.name, color: t.color, icon: t.icon, paise: t.paise };

  const lbl = { fontFamily: 'var(--font-ui)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', margin: '0 2px 10px' };
  const cap = { fontFamily: 'var(--font-ui)', fontSize: 'var(--caption-size)', color: 'var(--text-muted)' };
  const label = { fontFamily: 'var(--font-ui)', fontSize: 'var(--label-size)', color: 'var(--text-secondary)' };

  const CHART_H = 150;
  const budgetY = (budget / maxV) * CHART_H;

  return (
    <div style={{ padding: '0 16px 130px' }}>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--title-size)', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)', padding: '8px 0 20px' }}>Reports</div>
      <TabPills tabs={[{ key: 'month', label: 'Month' }, { key: 'year', label: 'Year' }]} value={range} onChange={setRange} style={{ marginBottom: 16 }} />

      {/* Trend hero */}
      <Card style={{ boxShadow: 'var(--shadow-md)', marginBottom: 16, padding: '20px 18px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ ...label, marginBottom: 4 }}>Total spent · {range === 'month' ? 'this month' : 'last 12 mo'}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 34, letterSpacing: '-0.8px', color: 'var(--text-primary)' }}>{fmt(total)}</div>
          </div>
          <div style={{ textAlign: 'right', marginTop: 4 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: periodDelta > 0 ? 'var(--expense)' : 'var(--income)' }}>
              <Icon name={periodDelta > 0 ? 'arrow-up-right' : 'arrow-down-right'} size={13} color={periodDelta > 0 ? 'var(--expense)' : 'var(--income)'} />
              {fmt(Math.abs(periodDelta))}
            </div>
            <div style={{ ...cap, marginTop: 2 }}>{periodDelta > 0 ? 'over' : 'under'} budget</div>
          </div>
        </div>

        {/* Chart */}
        <div style={{ position: 'relative', height: CHART_H }}>
          {/* budget overlay */}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: budgetY, borderTop: '1.5px dashed var(--text-muted)', opacity: 0.55, zIndex: 2, pointerEvents: 'none' }}>
            <span style={{ position: 'absolute', right: 0, top: -16, fontFamily: 'var(--font-ui)', fontSize: 9, letterSpacing: '0.3px', color: 'var(--text-muted)', background: 'var(--bg-card)', padding: '0 4px' }}>BUDGET {fmt(budget)}</span>
          </div>
          {/* bars */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: range === 'year' ? 5 : 10 }}>
            {bars.map((b, i) => {
              const on = sel === i;
              const dim = sel !== null && !on;
              const over = b.paise > budget;
              const h = (b.paise / maxV) * CHART_H;
              const baseColor = over ? 'var(--health-amber)' : 'var(--accent)';
              return (
                <div key={b.label} onClick={() => setSel(on ? null : i)} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                  <div style={{
                    width: '100%',
                    height: Math.max(h, 4),
                    background: baseColor,
                    borderRadius: 6,
                    opacity: dim ? 0.3 : on ? 1 : 0.82,
                    boxShadow: on ? `0 6px 16px color-mix(in srgb, ${over ? 'var(--health-amber)' : 'var(--accent)'} 45%, transparent)` : 'none',
                    transition: 'opacity 200ms ease, box-shadow 200ms ease, height 400ms cubic-bezier(0.22,1,0.36,1)',
                  }} />
                  <span style={{ ...cap, fontSize: range === 'year' ? 8 : 9, color: on ? 'var(--text-primary)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>{b.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Detail panel — swaps between period summary and the tapped period */}
      {selected ? (
        <Card key={selected.label} style={{ marginBottom: 16, animation: 'bsFade 240ms ease' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={cap}>{range === 'month' ? 'Week of ' : ''}{selected.label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, letterSpacing: '-0.5px', color: 'var(--text-primary)', marginTop: 2 }}>{fmt(selected.paise)}</div>
            </div>
            <Badge
              label={`${fmt(Math.abs(selected.paise - budget))} ${selected.paise > budget ? 'over' : 'under'}`}
              icon={selected.paise > budget ? 'alert-triangle' : 'check'}
              tone={selected.paise > budget ? 'amber' : 'income'}
            />
          </div>
          {selected.top ? (
            <>
              <div style={{ ...cap, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Top categories</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {selected.top.map((t) => {
                  const tShare = Math.round((t.paise / selected.paise) * 100);
                  return (
                    <div key={t.name} onClick={() => onOpenCategory && onOpenCategory(resolveCat(t))} style={{ cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <IconCircle name={t.icon} color={t.color} size={26} iconSize={13} />
                        <span style={{ flex: 1, fontFamily: 'var(--font-ui)', fontSize: 'var(--body-size)', color: 'var(--text-primary)' }}>{t.name}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)' }}>{fmt(t.paise)}</span>
                        <Icon name="chevron-right" size={15} color="var(--text-muted)" />
                      </div>
                      <div style={{ height: 5, background: 'var(--bg-muted)', borderRadius: 999, overflow: 'hidden', marginLeft: 36 }}>
                        <div style={{ width: `${tShare}%`, height: '100%', background: t.color, borderRadius: 999 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div style={{ ...cap, lineHeight: 1.5 }}>Tap a month in the chart to compare against the {fmt(budget)} monthly budget. Switch to <strong style={{ color: 'var(--text-secondary)' }}>Month</strong> for a category breakdown.</div>
          )}
        </Card>
      ) : (
        <Card style={{ marginBottom: 16, display: 'flex' }}>
          {[['Avg / ' + (range === 'month' ? 'week' : 'mo'), fmt(avg)],
            ['Budget', fmt(periodBudget)],
            [periodDelta > 0 ? 'Over' : 'Under', fmt(Math.abs(periodDelta))]].map(([t, v], i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, borderLeft: i ? '1px solid var(--border)' : 'none' }}>
              <span style={cap}>{t}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: t === 'Over' ? 'var(--expense)' : t === 'Under' ? 'var(--income)' : 'var(--text-primary)' }}>{v}</span>
            </div>
          ))}
        </Card>
      )}

      {/* Category breakdown — progressive: tap a row to drill in */}
      <div style={lbl}>By category · tap to explore</div>
      <Card padded={false} style={{ padding: '4px 16px' }}>
        {[...D.byCategory].sort((a, b) => b.paise - a.paise).map((c, i, arr) => {
          const totalCat = D.byCategory.reduce((s, x) => s + x.paise, 0);
          const share = Math.round((c.paise / totalCat) * 100);
          return (
            <div key={c.name} onClick={() => onOpenCategory && onOpenCategory(c)} style={{ padding: '13px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 7 }}>
                <IconCircle name={c.icon} color={c.color} size={28} iconSize={14} />
                <span style={{ flex: 1, fontFamily: 'var(--font-ui)', fontSize: 'var(--body-size)', color: 'var(--text-primary)' }}>{c.name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)' }}>{fmt(c.paise)}</span>
                <span style={{ ...cap, minWidth: 30, textAlign: 'right' }}>{share}%</span>
                <Icon name="chevron-right" size={15} color="var(--text-muted)" />
              </div>
              <div style={{ height: 5, background: 'var(--bg-muted)', borderRadius: 999, overflow: 'hidden', marginLeft: 40 }}>
                <div style={{ width: `${share}%`, height: '100%', background: c.color, borderRadius: 999 }} />
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
window.BS_Reports = Reports;
