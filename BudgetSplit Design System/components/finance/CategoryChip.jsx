import React from 'react';
import { Icon } from '../ui/Icon';

/**
 * Category pill. Unselected: bgMuted with the category color icon. Selected:
 * solid teal with dark text. Used in pickers and filter bars.
 */
export function CategoryChip({ label, icon = 'tag', color = 'var(--text-secondary)', selected = false, onClick, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-xs)',
        border: 'none',
        cursor: onClick ? 'pointer' : 'default',
        background: selected ? 'var(--accent)' : 'var(--bg-muted)',
        borderRadius: 'var(--radius-pill)',
        padding: '6px 12px',
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--label-size)',
        fontWeight: selected ? 600 : 400,
        color: selected ? 'var(--bg)' : 'var(--text-secondary)',
        transition: 'background 140ms ease',
        ...style,
      }}
    >
      <Icon name={icon} size={13} color={selected ? 'var(--bg)' : color} />
      {label}
    </button>
  );
}
