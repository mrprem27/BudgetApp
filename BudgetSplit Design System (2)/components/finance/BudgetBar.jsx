import React from 'react';

const HEALTH = {
  green: 'var(--health-green)',
  amber: 'var(--health-amber)',
  red: 'var(--health-red)',
  none: 'var(--bg-muted)',
};

/**
 * Budget progress bar. Fill color reflects health (green on track, amber near
 * limit, red over). Animates its width on mount.
 */
export function BudgetBar({ pct, health = 'green', height = 6, style }) {
  const target = Math.min(100, Math.max(0, pct ?? 0));
  const [w, setW] = React.useState(0);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setW(target));
    return () => cancelAnimationFrame(id);
  }, [target]);
  return (
    <div
      style={{
        width: '100%',
        height,
        background: 'var(--bg-muted)',
        borderRadius: 'var(--radius-pill)',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          width: `${w}%`,
          height: '100%',
          background: HEALTH[health] ?? HEALTH.green,
          borderRadius: 'var(--radius-pill)',
          transition: 'width 650ms cubic-bezier(0.22,1,0.36,1)',
        }}
      />
    </div>
  );
}
