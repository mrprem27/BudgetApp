/* Group detail — members, balance, group budget analytics, and the ledger.
   Pushed when you tap a group. The Budget block is group-scoped Insights:
   utilization, who-paid-what (contribution vs fair share), overspend drivers,
   and the group's rollover rule. Mirrors the personal Budget & Insights screen. */
function GroupDetail({ group, onBack, onSettle }) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const { Card, Divider, TransactionRow, MemberAvatar, Button, Icon, IconCircle, Badge, BudgetBar, AmountText } = DS;
  const fmt = window.BS_formatRupeesShort;
  const D = window.BS_DATA;
  const [store] = window.useBS();
  const g = group || D.groups[0];
  const gb = D.groupBudget[g.id]; // undefined for Personal — handled below

  // group live transactions into date sections
  const sections = [];
  store.txns.forEach((t) => {
    let s = sections.find((x) => x.when === t.when);
    if (!s) { s = { when: t.when, items: [] }; sections.push(s); }
    s.items.push(t);
  });

  const cap = { fontFamily: 'var(--font-ui)', fontSize: 'var(--caption-size)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' };
  const lbl = { fontFamily: 'var(--font-ui)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', margin: '0 2px 10px' };
  const cap2 = { fontFamily: 'var(--font-ui)', fontSize: 'var(--caption-size)', color: 'var(--text-muted)' };

  // ---- group budget derivations ----
  let budgetBlock = null;
  if (gb) {
    const lines = gb.lines.map((l) => {
      const pct = l.allocated > 0 ? Math.round((l.spent / l.allocated) * 100) : 0;
      const health = pct > 100 ? 'red' : pct >= 85 ? 'amber' : 'green';
      return { ...l, pct, health, remaining: l.allocated - l.spent };
    });
    const util = Math.round((gb.spent / gb.allocated) * 100);
    const over = lines.filter((l) => l.pct > 100).sort((a, b) => b.pct - a.pct);
    const near = lines.filter((l) => l.pct >= 85 && l.pct <= 100);
    const onTrack = lines.filter((l) => l.pct < 85).length;
    const utilColor = util > 100 ? 'var(--health-red)' : util >= 85 ? 'var(--health-amber)' : 'var(--income)';
    const maxPaid = Math.max(...gb.members.map((m) => m.paid));
    const fairShare = gb.spent / gb.members.length;

    budgetBlock = (
      <>
        {/* Group utilization hero */}
        <div style={lbl}>Group budget</div>
        <Card style={{ boxShadow: 'var(--shadow-md)', marginBottom: 16, padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ ...cap2, marginBottom: 4 }}>Spent of {fmt(gb.allocated)}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 40, letterSpacing: '-1px', color: utilColor }}>{util}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20, color: utilColor }}>%</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <AmountText paise={gb.spent} size="md" forceColor="var(--text-primary)" rounded />
              <div style={{ ...cap2, color: gb.allocated - gb.spent < 0 ? 'var(--expense)' : 'var(--income)' }}>{gb.allocated - gb.spent < 0 ? `${fmt(gb.spent - gb.allocated)} over` : `${fmt(gb.allocated - gb.spent)} left`}</div>
            </div>
          </div>
          <BudgetBar pct={util} health={util > 100 ? 'red' : util >= 85 ? 'amber' : 'green'} height={8} />
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            {over.length > 0 && <Badge label={`${over.length} over`} icon="alert-triangle" tone="expense" />}
            {near.length > 0 && <Badge label={`${near.length} near limit`} icon="clock" tone="amber" />}
            <Badge label={`${onTrack} on track`} icon="check" tone="income" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <Icon name="refresh-cw" size={13} color="var(--text-muted)" />
            <span style={cap2}>{gb.rollover}</span>
          </div>
        </Card>

        {/* Who paid what — contribution vs fair share */}
        <div style={lbl}>Who paid what</div>
        <Card padded={false} style={{ padding: '4px 16px', marginBottom: 16 }}>
          {gb.members.map((m, i) => {
            const netNum = m.paid - m.share;
            const ahead = netNum >= 0;
            return (
              <div key={m.name} style={{ padding: '13px 0', borderBottom: i < gb.members.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                  <MemberAvatar name={m.name} color={m.color} size={28} />
                  <span style={{ flex: 1, fontFamily: 'var(--font-ui)', fontSize: 'var(--body-size)', color: 'var(--text-primary)' }}>{m.name.split(' ')[0]}{m.name === D.me.name ? ' (you)' : ''}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)' }}>{fmt(m.paid)}</span>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, minWidth: 64, textAlign: 'right', color: ahead ? 'var(--income)' : 'var(--expense)' }}>{ahead ? '+' : '−'}{fmt(Math.abs(netNum))}</span>
                </div>
                <div style={{ height: 5, background: 'var(--bg-muted)', borderRadius: 999, overflow: 'hidden', marginLeft: 38 }}>
                  <div style={{ width: `${(m.paid / maxPaid) * 100}%`, height: '100%', background: m.color, borderRadius: 999 }} />
                </div>
              </div>
            );
          })}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '12px 0' }}>
            <Icon name="info" size={13} color="var(--text-muted)" />
            <span style={cap2}>Fair share is {fmt(fairShare)} each · <span style={{ color: 'var(--income)' }}>+ ahead</span>, <span style={{ color: 'var(--expense)' }}>− owes the group</span></span>
          </div>
        </Card>

        {/* Driving overspend */}
        {over.length > 0 ? (
          <>
            <div style={lbl}>Driving overspend</div>
            <Card padded={false} style={{ padding: '4px 16px', marginBottom: 16 }}>
              {over.map((l, i) => (
                <div key={l.name} style={{ padding: '14px 0', borderBottom: i < over.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <IconCircle name={l.icon} color={l.color} size={32} iconSize={16} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--body-size)', color: 'var(--text-primary)' }}>{l.name}</span>
                      <div style={{ ...cap2, marginTop: 1 }}>{fmt(l.spent - l.allocated)} over the {fmt(l.allocated)} budget</div>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--expense)' }}>{l.pct}%</span>
                  </div>
                  <BudgetBar pct={l.pct} health={l.health} height={5} />
                </div>
              ))}
            </Card>
          </>
        ) : (
          <Card style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 38, height: 38, borderRadius: 12, background: 'color-mix(in srgb, var(--income) 14%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="check-circle" size={18} color="var(--income)" />
            </span>
            <span style={{ flex: 1, fontFamily: 'var(--font-ui)', fontSize: 'var(--body-size)', color: 'var(--text-secondary)' }}>Every category is within budget this period.</span>
          </Card>
        )}

        {/* All group lines */}
        <div style={lbl}>All categories</div>
        <Card padded={false} style={{ padding: '4px 16px', marginBottom: 16 }}>
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
      </>
    );
  }

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
          <div style={{ width: 130 }}><Button label="Settle Up" variant="secondary" size="md" fullWidth onClick={onSettle} /></div>
        </div>
      </Card>

      {/* Group budget analytics */}
      {budgetBlock}

      {/* Ledger */}
      <div style={lbl}>Activity</div>
      {sections.map((s) => (
        <div key={s.when} style={{ marginBottom: 8 }}>
          <div style={{ ...cap, margin: '12px 4px 4px' }}>{s.when}</div>
          <Card padded={false} style={{ padding: '0 16px' }}>
            {s.items.map((t, i) => (
              <React.Fragment key={t.id || i}>
                {i > 0 && <Divider inset={56} />}
                <TransactionRow category={t.category} note={t.note} icon={t.icon} color={t.color} paise={t.paise} kind={t.kind} onClick={() => {}} />
              </React.Fragment>
            ))}
          </Card>
        </div>
      ))}
    </div>
  );
}
window.BS_GroupDetail = GroupDetail;
