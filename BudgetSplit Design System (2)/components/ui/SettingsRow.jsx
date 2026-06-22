import React from 'react';
import { Icon, IconCircle } from './Icon';

/**
 * One row inside a settings-style card: icon circle + label + value/chevron.
 * Min 52px tall. Group several inside a Card with Dividers (inset 64).
 */
export function SettingsRow({
  icon,
  label,
  value,
  tint = 'var(--accent)',
  onClick,
  chevron,
  right,
  danger = false,
  style,
}) {
  const showChevron = chevron ?? !!onClick;
  const labelColor = danger ? 'var(--expense)' : 'var(--text-primary)';
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-md)',
        padding: 'var(--space-md)',
        minHeight: 52,
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      <IconCircle name={icon} color={danger ? 'var(--expense)' : tint} size={32} iconSize={16} />
      <span style={{ flex: 1, fontFamily: 'var(--font-ui)', fontSize: 'var(--body-size)', color: labelColor }}>{label}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-xs)', flexShrink: 1 }}>
        {right ?? (value ? (
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--body-size)', color: 'var(--text-secondary)' }}>{value}</span>
        ) : null)}
        {showChevron ? <Icon name="chevron-right" size={16} color="var(--text-muted)" /> : null}
      </span>
    </div>
  );
}
