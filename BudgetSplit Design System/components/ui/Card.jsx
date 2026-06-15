import React from 'react';

/**
 * The BudgetSplit card — never let rows or fields float bare on the dark
 * background. bgCard fill, 1px border, radius-lg, soft halo shadow.
 */
export function Card({ children, padded = true, style, onClick, ...rest }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        padding: padded ? 'var(--space-md)' : 0,
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

/** A full-width hairline divider for inside cards (indent past an icon with marginLeft). */
export function Divider({ inset = 0 }) {
  return <div style={{ height: 1, background: 'var(--border)', marginLeft: inset }} />;
}
