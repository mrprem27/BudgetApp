import React from 'react';
import { Icon } from '../ui/Icon';

/**
 * The floating action button — teal→coral gradient, glows in its own coral
 * light. Position it bottom-right over a screen. Renders a plus by default.
 */
export function FAB({ icon = 'plus', onClick, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Add"
      style={{
        position: 'absolute',
        right: 'var(--space-lg)',
        bottom: 'var(--space-lg)',
        width: 60,
        height: 60,
        borderRadius: 20,
        border: 'none',
        cursor: 'pointer',
        background: 'var(--gradient-brand)',
        boxShadow: 'var(--shadow-fab)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'transform 140ms cubic-bezier(0.34,1.56,0.64,1)',
        ...style,
      }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.9)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
    >
      <Icon name={icon} size={28} color="#fff" />
    </button>
  );
}
