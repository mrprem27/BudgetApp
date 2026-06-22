import React from 'react';
import { Icon } from './Icon';

/**
 * Text input on the bgInput surface. Optional leading icon; focus brings up the
 * teal border. Pass type="amount" to right-align in Space Mono for money entry.
 */
export function Input({
  value,
  onChange,
  placeholder,
  icon,
  type = 'text',
  prefix,
  disabled = false,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const isAmount = type === 'amount';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-sm)',
        background: 'var(--bg-input)',
        border: `1px solid ${focus ? 'var(--border-focus)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-md)',
        padding: `0 ${14}px`,
        height: 48,
        opacity: disabled ? 0.5 : 1,
        transition: 'border-color 120ms ease',
        ...style,
      }}
    >
      {icon ? <Icon name={icon} size={17} color="var(--text-muted)" /> : null}
      {prefix ? (
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontSize: 'var(--amount-md-size)' }}>{prefix}</span>
      ) : null}
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          flex: 1,
          minWidth: 0,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: 'var(--text-primary)',
          fontFamily: isAmount ? 'var(--font-mono)' : 'var(--font-ui)',
          fontSize: isAmount ? 'var(--amount-md-size)' : 'var(--body-size)',
          textAlign: isAmount ? 'right' : 'left',
        }}
        {...rest}
      />
    </div>
  );
}
