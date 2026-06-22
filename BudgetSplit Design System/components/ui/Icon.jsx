import React from 'react';

/**
 * Renders a Feather icon as an inline SVG. BudgetSplit uses Feather icons
 * exclusively — same 2px stroke throughout. Requires the Feather script to be
 * present on the page (window.feather); falls back to an empty box otherwise.
 */
export function Icon({ name, size = 18, color = 'currentColor', strokeWidth = 2, style }) {
  const feather = typeof window !== 'undefined' ? window.feather : null;
  const def = feather && feather.icons ? feather.icons[name] : null;
  const svg = def
    ? def.toSvg({ width: size, height: size, color, 'stroke-width': strokeWidth })
    : '';
  return React.createElement('span', {
    'aria-hidden': true,
    style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, ...style },
    dangerouslySetInnerHTML: { __html: svg },
  });
}

/**
 * A colored icon circle — the workhorse motif across BudgetSplit. The circle
 * background is the icon's color at ~13% opacity (hex + "22").
 */
export function IconCircle({ name, color = 'var(--accent)', size = 40, iconSize, style }) {
  const inner = iconSize ?? Math.round(size * 0.45);
  // color may be a CSS var; tint via color-mix so any color string works.
  const bg = `color-mix(in srgb, ${color} 13%, transparent)`;
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        ...style,
      }}
    >
      <Icon name={name} size={inner} color={color} />
    </span>
  );
}
