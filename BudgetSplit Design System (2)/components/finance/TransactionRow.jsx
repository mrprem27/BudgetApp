import React from 'react';
import { IconCircle } from '../ui/Icon';
import { AmountText } from './AmountText';

/**
 * A transaction list row: category icon circle + name/note + signed amount.
 * Min 64px tall. Expenses use the category color; income is green, settlement
 * is purple. Amount sign is driven by the paise value.
 */
export function TransactionRow({ category, note, icon = 'tag', color = 'var(--text-secondary)', paise, kind = 'expense', onClick, style }) {
  const visual =
    kind === 'income' ? { icon: 'trending-up', color: 'var(--income)' }
    : kind === 'settlement' ? { icon: 'check-circle', color: 'var(--settle)' }
    : { icon, color };
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-sm)',
        padding: 'var(--space-sm) 0',
        minHeight: 64,
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      <IconCircle name={visual.icon} color={visual.color} size={40} iconSize={18} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--body-size)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{category}</div>
        {note ? (
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--caption-size)', color: 'var(--text-secondary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{note}</div>
        ) : null}
      </div>
      <AmountText paise={paise} size="sm" forceColor={kind === 'settlement' ? 'var(--settle)' : undefined} />
    </div>
  );
}
