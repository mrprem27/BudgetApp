import React from 'react';

/**
 * Segmented control / tab pills — e.g. Today · Month · Year on the dashboard.
 * Active pill fills teal with dark text; the rest sit on bgMuted.
 */
export function TabPills({ tabs, value, onChange, style }) {
  const items = tabs.map((t) => (typeof t === 'string' ? { key: t, label: t } : t));
  return (
    <div style={{ display: 'flex', gap: 'var(--space-xs)', ...style }}>
      {items.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange && onChange(t.key)}
            style={{
              border: 'none',
              cursor: 'pointer',
              padding: '7px 16px',
              borderRadius: 'var(--radius-pill)',
              background: active ? 'var(--accent)' : 'var(--bg-muted)',
              color: active ? 'var(--bg)' : 'var(--text-secondary)',
              fontFamily: 'var(--font-ui)',
              fontSize: 'var(--label-size)',
              fontWeight: active ? 600 : 400,
              transition: 'background 140ms ease, color 140ms ease',
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
