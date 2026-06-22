import React from 'react';

const AVATAR_COLORS = ['#E53E3E', '#DD6B20', '#D69E2E', '#38A169', '#319795', '#3182CE', '#553C9A', '#B83280', '#2D3748', '#744210'];

/** Stable color pick from a name, when no explicit color is given. */
export function avatarColor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** Initials avatar in a solid color circle. White initials in Inter SemiBold. */
export function MemberAvatar({ name, color, size = 40, selected = false, onClick, style }) {
  const fill = color ?? avatarColor(name);
  const initials = (name || '?')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <span
      onClick={onClick}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: fill,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        cursor: onClick ? 'pointer' : 'default',
        border: selected ? '2px solid #fff' : 'none',
        ...style,
      }}
    >
      <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, color: '#fff', fontSize: Math.round(size * 0.38) }}>{initials}</span>
    </span>
  );
}
