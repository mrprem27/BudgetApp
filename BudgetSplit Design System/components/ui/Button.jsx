import React from 'react';
import { Icon } from './Icon';

/**
 * BudgetSplit's button. Primary CTAs use the teal gradient fill; never hand-roll
 * a colored TouchableOpacity. All buttons are 52px tall with radius-md.
 */
export function Button({
  label,
  children,
  variant = 'primary',
  size = 'lg',
  icon,
  disabled = false,
  loading = false,
  fullWidth = false,
  onClick,
  style,
  ...rest
}) {
  const inactive = disabled || loading;
  const heights = { lg: 52, md: 44, sm: 36 };
  const height = heights[size] ?? 52;

  const base = {
    height,
    border: 'none',
    borderRadius: 'var(--radius-md)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-sm)',
    padding: `0 ${size === 'sm' ? 14 : 20}px`,
    width: fullWidth ? '100%' : undefined,
    fontFamily: 'var(--font-ui)',
    fontWeight: 'var(--button-weight)',
    fontSize: size === 'sm' ? 'var(--label-size)' : 'var(--button-size)',
    cursor: inactive ? 'default' : 'pointer',
    opacity: inactive ? 0.4 : 1,
    transition: 'transform 120ms ease, filter 120ms ease, background 120ms ease',
    whiteSpace: 'nowrap',
  };

  const variants = {
    primary: {
      background: 'var(--gradient-accent)',
      color: '#fff',
      boxShadow: 'var(--shadow-sm)',
    },
    secondary: {
      background: 'transparent',
      color: 'var(--accent)',
      border: '1px solid var(--accent)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--accent)',
      padding: `0 ${size === 'sm' ? 8 : 12}px`,
    },
    destructive: {
      background: 'var(--expense)',
      color: '#fff',
      boxShadow: 'var(--shadow-sm)',
    },
  };

  const content = loading ? '···' : (children ?? label);

  return (
    <button
      type="button"
      disabled={inactive}
      onClick={inactive ? undefined : onClick}
      style={{ ...base, ...variants[variant], ...style }}
      onMouseDown={(e) => { if (!inactive) e.currentTarget.style.transform = 'scale(0.97)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      {...rest}
    >
      {icon && !loading ? <Icon name={icon} size={size === 'sm' ? 15 : 18} color="currentColor" /> : null}
      {content}
    </button>
  );
}
