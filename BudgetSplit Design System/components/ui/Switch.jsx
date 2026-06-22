import React from 'react';

/** iOS-style toggle. Track turns teal when on; thumb is always the primary text color. */
export function Switch({ checked = false, onChange, disabled = false, style }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange && onChange(!checked)}
      style={{
        width: 50,
        height: 30,
        borderRadius: 'var(--radius-pill)',
        border: 'none',
        padding: 3,
        background: checked ? 'var(--accent)' : 'var(--bg-muted)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 160ms ease',
        display: 'inline-flex',
        ...style,
      }}
    >
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: 'var(--text-primary)',
          boxShadow: 'var(--shadow-sm)',
          transform: checked ? 'translateX(20px)' : 'translateX(0)',
          transition: 'transform 160ms cubic-bezier(0.34,1.56,0.64,1)',
        }}
      />
    </button>
  );
}
