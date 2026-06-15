/* Reports tab — spend trend (weekly bars) + category breakdown. */
function Reports() {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const { Card, TabPills, AmountText, formatRupeesShort } = DS;
  const D = window.BS_DATA;
  const [tab, setTab] = React.useState('month');
  const bars = [
    { label: 'Jun 1', v: 38 }, { label: 'Jun 8', v: 64 }, { label: 'Jun 15', v: 52 }, { label: 'Jun 22', v: 88 }, { label: 'Jun 29', v: 71 },
  ];
  const maxV = Math.max(...bars.map((b) => b.v));
  const total = D.byCategory.reduce((s, c) => s + c.paise, 0);
  const sorted = [...D.byCategory].sort((a, b) => b.paise - a.paise);
  const cap = { fontFamily: 'var(--font-ui)', fontSize: 'var(--caption-size)', color: 'var(--text-muted)' };
  const label = { fontFamily: 'var(--font-ui)', fontSize: 'var(--label-size)', color: 'var(--text-secondary)' };

  return (
    <div style={{ padding: '0 16px 130px' }}>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--title-size)', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)', padding: '8px 0 20px' }}>Reports</div>
      <TabPills tabs={[{ key: 'month', label: 'Month' }, { key: 'year', label: 'Year' }]} value={tab} onChange={setTab} style={{ marginBottom: 16 }} />

      <Card style={{ marginBottom: 16 }}>
        <div style={{ ...label, marginBottom: 16 }}>Spending over time</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 120 }}>
          {bars.map((b) => (
            <div key={b.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ width: '100%', height: `${(b.v / maxV) * 96}px`, background: 'var(--accent)', borderRadius: 6, opacity: 0.9 }} />
              <span style={{ ...cap, fontSize: 9 }}>{b.label}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div style={{ ...label, marginBottom: 16 }}>By category</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sorted.map((c) => (
            <div key={c.name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--body-size)', color: 'var(--text-primary)' }}>{c.name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)' }}>{formatRupeesShort(c.paise)}</span>
              </div>
              <div style={{ height: 6, background: 'var(--bg-muted)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: `${(c.paise / total) * 100}%`, height: '100%', background: c.color, borderRadius: 999 }} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
window.BS_Reports = Reports;
