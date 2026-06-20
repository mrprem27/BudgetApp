/* Interactive category donut — the dashboard centerpiece.
   Tap a wedge: it pops out, the rest dim, and the center morphs to that
   category's readout. Tap the center "View" (or the wedge again) to drill in.
   Replaces the old dense 5-row legend with progressive disclosure. */
function CategoryDonut({ data, total, onOpen }) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const { Icon } = DS;
  const fmt = window.BS_formatRupeesShort;
  const [sel, setSel] = React.useState(null);

  const cx = 100, cy = 100, ro = 88, ri = 60, gap = 2.2;
  const TAU = Math.PI * 2;
  const pt = (r, deg) => {
    const a = (deg - 90) * Math.PI / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const wedge = (a0, a1, rin, rout) => {
    const large = a1 - a0 > 180 ? 1 : 0;
    const [x0, y0] = pt(rout, a0), [x1, y1] = pt(rout, a1);
    const [x2, y2] = pt(rin, a1), [x3, y3] = pt(rin, a0);
    return `M${x0} ${y0} A${rout} ${rout} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${rin} ${rin} 0 ${large} 0 ${x3} ${y3} Z`;
  };

  let acc = 0;
  const segs = data.map((c) => {
    const frac = c.paise / total;
    const a0 = acc * 360 + gap / 2;
    const a1 = (acc + frac) * 360 - gap / 2;
    acc += frac;
    const mid = (a0 + a1) / 2;
    return { ...c, frac, a0, a1, mid, pct: Math.round(frac * 100) };
  });

  const selected = sel !== null ? segs[sel] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: 220, height: 220 }}>
        <svg viewBox="-10 -10 220 220" width="220" height="220">
          {segs.map((s, i) => {
            const on = sel === i;
            const dim = sel !== null && !on;
            const pop = on ? 7 : 0;
            const a = (s.mid - 90) * Math.PI / 180;
            const dx = Math.cos(a) * pop, dy = Math.sin(a) * pop;
            return (
              <path
                key={s.name}
                d={wedge(s.a0, s.a1, ri, on ? ro + 4 : ro)}
                fill={s.color}
                onClick={() => (on ? onOpen && onOpen(s) : setSel(i))}
                style={{ cursor: 'pointer', opacity: dim ? 0.32 : 1, transform: `translate(${dx}px, ${dy}px)`, transition: 'opacity 220ms ease, transform 260ms cubic-bezier(0.34,1.56,0.64,1)' }}
              />
            );
          })}
        </svg>

        {/* center readout */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', textAlign: 'center', padding: 40 }}>
          {selected ? (
            <div key={selected.name} style={{ animation: 'bsFade 220ms ease', pointerEvents: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginBottom: 2 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: selected.color }} />
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text-secondary)', maxWidth: 110, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selected.name}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, letterSpacing: '-0.5px', color: 'var(--text-primary)' }}>{fmt(selected.paise)}</div>
              <button onClick={() => onOpen && onOpen(selected)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 2, marginTop: 4 }}>
                {selected.pct}% · View <Icon name="chevron-right" size={12} color="var(--accent)" />
              </button>
            </div>
          ) : (
            <div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Spent</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 26, letterSpacing: '-0.5px', color: 'var(--text-primary)' }}>{fmt(total)}</div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>tap a slice</div>
            </div>
          )}
        </div>
      </div>

      {/* quick-pick chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 14 }}>
        {segs.map((s, i) => {
          const on = sel === i;
          return (
            <button key={s.name} onClick={() => setSel(on ? null : i)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-pill)', padding: '5px 10px', background: on ? 'var(--bg-muted)' : 'transparent', transition: 'background 160ms ease' }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: s.color, flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: on ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{s.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
window.BS_CategoryDonut = CategoryDonut;
