import React from 'react';
import { Icon } from './Icon';
import { Button } from './Button';

/**
 * The one empty-state layout used everywhere: 64px icon circle → title → body →
 * optional primary action. Never render a bare "nothing here" string.
 */
export function EmptyState({ icon, title, body, actionLabel, onAction, tint = 'var(--accent)', style }) {
  const bg = `color-mix(in srgb, ${tint} 13%, transparent)`;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 'var(--space-sm)',
        padding: 'var(--space-xxl) var(--space-xl)',
        ...style,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 'var(--space-xs)',
        }}
      >
        <Icon name={icon} size={26} color={tint} />
      </div>
      <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 'var(--subheading-size)', color: 'var(--text-primary)' }}>{title}</div>
      {body ? (
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--body-size)', color: 'var(--text-secondary)', lineHeight: 'var(--line-body)', maxWidth: 320 }}>{body}</div>
      ) : null}
      {actionLabel && onAction ? (
        <div style={{ marginTop: 'var(--space-md)', alignSelf: 'stretch' }}>
          <Button label={actionLabel} onClick={onAction} fullWidth />
        </div>
      ) : null}
    </div>
  );
}
