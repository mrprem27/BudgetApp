import React from 'react';
import { Icon } from '../ui/Icon';

/**
 * Small status pill with a leading icon — "2 over budget", "near limit", etc.
 * tone sets the color family; the background is that color, tinted.
 */
export function Badge({ label, icon, tone = 'neutral', style }) {
  const TONES = {
    neutral: { fg: 'var(--text-secondary)', bg: 'var(--bg-muted)' },
    accent:  { fg: 'var(--accent)', bg: 'var(--accent-muted)' },
    income:  { fg: 'var(--income)', bg: 'color-mix(in srgb, var(--income) 14%, transparent)' },
    expense: { fg: 'var(--expense)', bg: 'var(--coral-muted)' },
    amber:   { fg: 'var(--health-amber)', bg: 'color-mix(in srgb, var(--health-amber) 16%, transparent)' },
    settle:  { fg: 'var(--settle)', bg: 'color-mix(in srgb, var(--settle) 16%, transparent)' },
  };
  const t = TONES[tone] ?? TONES.neutral;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-xs)',
        background: t.bg,
        color: t.fg,
        borderRadius: 'var(--radius-pill)',
        padding: '4px 10px',
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--caption-size)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {icon ? <Icon name={icon} size={12} color={t.fg} /> : null}
      {label}
    </span>
  );
}
