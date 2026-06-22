/* @ds-bundle: {"format":3,"namespace":"BudgetSplitDesignSystem_f6e8de","components":[{"name":"AmountText","sourcePath":"components/finance/AmountText.jsx"},{"name":"Badge","sourcePath":"components/finance/Badge.jsx"},{"name":"BudgetBar","sourcePath":"components/finance/BudgetBar.jsx"},{"name":"CategoryChip","sourcePath":"components/finance/CategoryChip.jsx"},{"name":"FAB","sourcePath":"components/finance/FAB.jsx"},{"name":"MemberAvatar","sourcePath":"components/finance/MemberAvatar.jsx"},{"name":"TransactionRow","sourcePath":"components/finance/TransactionRow.jsx"},{"name":"Button","sourcePath":"components/ui/Button.jsx"},{"name":"Card","sourcePath":"components/ui/Card.jsx"},{"name":"Divider","sourcePath":"components/ui/Card.jsx"},{"name":"EmptyState","sourcePath":"components/ui/EmptyState.jsx"},{"name":"Icon","sourcePath":"components/ui/Icon.jsx"},{"name":"IconCircle","sourcePath":"components/ui/Icon.jsx"},{"name":"Input","sourcePath":"components/ui/Input.jsx"},{"name":"SettingsRow","sourcePath":"components/ui/SettingsRow.jsx"},{"name":"Switch","sourcePath":"components/ui/Switch.jsx"},{"name":"TabPills","sourcePath":"components/ui/TabPills.jsx"}],"sourceHashes":{"components/finance/AmountText.jsx":"bbc7465fe4b0","components/finance/Badge.jsx":"a094da45abb0","components/finance/BudgetBar.jsx":"5f4382e35aff","components/finance/CategoryChip.jsx":"431b73e512cc","components/finance/FAB.jsx":"25b0445f02f1","components/finance/MemberAvatar.jsx":"6975ca377e13","components/finance/TransactionRow.jsx":"d059530cf2b4","components/ui/Button.jsx":"b79be618472b","components/ui/Card.jsx":"0af5c8927dc2","components/ui/EmptyState.jsx":"7b0d2d569839","components/ui/Icon.jsx":"5d5479a5ef7e","components/ui/Input.jsx":"b46b27c497d0","components/ui/SettingsRow.jsx":"4e12a0c89c08","components/ui/Switch.jsx":"fc59ef25bf6e","components/ui/TabPills.jsx":"ad059afeff1a","ui_kits/budgetsplit/AddSheet.jsx":"631ed81b4ea7","ui_kits/budgetsplit/App.jsx":"2ed7c51eee36","ui_kits/budgetsplit/Dashboard.jsx":"0f4d97542642","ui_kits/budgetsplit/GroupDetail.jsx":"b7d97eb05289","ui_kits/budgetsplit/Groups.jsx":"fdffe5ee9c14","ui_kits/budgetsplit/Onboarding.jsx":"09c794ca0e99","ui_kits/budgetsplit/Reports.jsx":"39d71603b6ba","ui_kits/budgetsplit/Settings.jsx":"dd4d0b0c30c8","ui_kits/budgetsplit/data.js":"6a6222642206"},"inlinedExternals":[],"unexposedExports":[{"name":"avatarColor","sourcePath":"components/finance/MemberAvatar.jsx"},{"name":"formatRupees","sourcePath":"components/finance/AmountText.jsx"},{"name":"formatRupeesShort","sourcePath":"components/finance/AmountText.jsx"}]} */

(() => {

const __ds_ns = (window.BudgetSplitDesignSystem_f6e8de = window.BudgetSplitDesignSystem_f6e8de || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/finance/AmountText.jsx
try { (() => {
/** Format integer paise → "₹1,23,456.00" (Indian grouping). */
function formatRupees(paise) {
  return '₹' + (paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/** Rounded, no paise — for dashboard cards. 150050 → "₹1,501". */
function formatRupeesShort(paise) {
  return '₹' + Math.round(paise / 100).toLocaleString('en-IN');
}
const SIZE = {
  xl: 'var(--amount-xl-size)',
  lg: 'var(--amount-lg-size)',
  md: 'var(--amount-md-size)',
  sm: 'var(--amount-sm-size)'
};
const SPACING = {
  xl: '-0.5px',
  lg: '-0.3px',
  md: '0',
  sm: '0'
};

/**
 * Money, always in Space Mono. Sign drives the color: positive → income green,
 * negative → expense coral, unless forceColor is given. Pass `rounded` for
 * card/summary contexts (no paise), `showSign` to prefix +/−.
 */
function AmountText({
  paise,
  size = 'md',
  forceColor,
  rounded = false,
  showSign = false,
  style
}) {
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const formatted = rounded ? formatRupeesShort(abs) : formatRupees(abs);
  const color = forceColor ?? (paise === 0 ? 'var(--text-primary)' : negative ? 'var(--expense)' : 'var(--income)');
  const sign = showSign ? negative ? '−' : '+' : negative ? '−' : '';
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: SIZE[size],
      letterSpacing: SPACING[size],
      color,
      whiteSpace: 'nowrap',
      ...style
    }
  }, sign, formatted);
}
Object.assign(__ds_scope, { formatRupees, formatRupeesShort, AmountText });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/finance/AmountText.jsx", error: String((e && e.message) || e) }); }

// components/finance/BudgetBar.jsx
try { (() => {
const HEALTH = {
  green: 'var(--health-green)',
  amber: 'var(--health-amber)',
  red: 'var(--health-red)',
  none: 'var(--bg-muted)'
};

/**
 * Budget progress bar. Fill color reflects health (green on track, amber near
 * limit, red over). Animates its width on mount.
 */
function BudgetBar({
  pct,
  health = 'green',
  height = 6,
  style
}) {
  const target = Math.min(100, Math.max(0, pct ?? 0));
  const [w, setW] = React.useState(0);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setW(target));
    return () => cancelAnimationFrame(id);
  }, [target]);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      height,
      background: 'var(--bg-muted)',
      borderRadius: 'var(--radius-pill)',
      overflow: 'hidden',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${w}%`,
      height: '100%',
      background: HEALTH[health] ?? HEALTH.green,
      borderRadius: 'var(--radius-pill)',
      transition: 'width 650ms cubic-bezier(0.22,1,0.36,1)'
    }
  }));
}
Object.assign(__ds_scope, { BudgetBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/finance/BudgetBar.jsx", error: String((e && e.message) || e) }); }

// components/finance/MemberAvatar.jsx
try { (() => {
const AVATAR_COLORS = ['#E53E3E', '#DD6B20', '#D69E2E', '#38A169', '#319795', '#3182CE', '#553C9A', '#B83280', '#2D3748', '#744210'];

/** Stable color pick from a name, when no explicit color is given. */
function avatarColor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = h * 31 + name.charCodeAt(i) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** Initials avatar in a solid color circle. White initials in Inter SemiBold. */
function MemberAvatar({
  name,
  color,
  size = 40,
  selected = false,
  onClick,
  style
}) {
  const fill = color ?? avatarColor(name);
  const initials = (name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return /*#__PURE__*/React.createElement("span", {
    onClick: onClick,
    style: {
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
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontWeight: 600,
      color: '#fff',
      fontSize: Math.round(size * 0.38)
    }
  }, initials));
}
Object.assign(__ds_scope, { avatarColor, MemberAvatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/finance/MemberAvatar.jsx", error: String((e && e.message) || e) }); }

// components/ui/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * The BudgetSplit card — never let rows or fields float bare on the dark
 * background. bgCard fill, 1px border, radius-lg, soft halo shadow.
 */
function Card({
  children,
  padded = true,
  style,
  onClick,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    onClick: onClick,
    style: {
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-sm)',
      padding: padded ? 'var(--space-md)' : 0,
      cursor: onClick ? 'pointer' : undefined,
      ...style
    }
  }, rest), children);
}

/** A full-width hairline divider for inside cards (indent past an icon with marginLeft). */
function Divider({
  inset = 0
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: 'var(--border)',
      marginLeft: inset
    }
  });
}
Object.assign(__ds_scope, { Card, Divider });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/ui/Card.jsx", error: String((e && e.message) || e) }); }

// components/ui/Icon.jsx
try { (() => {
/**
 * Renders a Feather icon as an inline SVG. BudgetSplit uses Feather icons
 * exclusively — same 2px stroke throughout. Requires the Feather script to be
 * present on the page (window.feather); falls back to an empty box otherwise.
 */
function Icon({
  name,
  size = 18,
  color = 'currentColor',
  strokeWidth = 2,
  style
}) {
  const feather = typeof window !== 'undefined' ? window.feather : null;
  const def = feather && feather.icons ? feather.icons[name] : null;
  const svg = def ? def.toSvg({
    width: size,
    height: size,
    color,
    'stroke-width': strokeWidth
  }) : '';
  return React.createElement('span', {
    'aria-hidden': true,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: size,
      height: size,
      ...style
    },
    dangerouslySetInnerHTML: {
      __html: svg
    }
  });
}

/**
 * A colored icon circle — the workhorse motif across BudgetSplit. The circle
 * background is the icon's color at ~13% opacity (hex + "22").
 */
function IconCircle({
  name,
  color = 'var(--accent)',
  size = 40,
  iconSize,
  style
}) {
  const inner = iconSize ?? Math.round(size * 0.45);
  // color may be a CSS var; tint via color-mix so any color string works.
  const bg = `color-mix(in srgb, ${color} 13%, transparent)`;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      width: size,
      height: size,
      borderRadius: '50%',
      background: bg,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      ...style
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: name,
    size: inner,
    color: color
  }));
}
Object.assign(__ds_scope, { Icon, IconCircle });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/ui/Icon.jsx", error: String((e && e.message) || e) }); }

// components/finance/Badge.jsx
try { (() => {
/**
 * Small status pill with a leading icon — "2 over budget", "near limit", etc.
 * tone sets the color family; the background is that color, tinted.
 */
function Badge({
  label,
  icon,
  tone = 'neutral',
  style
}) {
  const TONES = {
    neutral: {
      fg: 'var(--text-secondary)',
      bg: 'var(--bg-muted)'
    },
    accent: {
      fg: 'var(--accent)',
      bg: 'var(--accent-muted)'
    },
    income: {
      fg: 'var(--income)',
      bg: 'color-mix(in srgb, var(--income) 14%, transparent)'
    },
    expense: {
      fg: 'var(--expense)',
      bg: 'var(--coral-muted)'
    },
    amber: {
      fg: 'var(--health-amber)',
      bg: 'color-mix(in srgb, var(--health-amber) 16%, transparent)'
    },
    settle: {
      fg: 'var(--settle)',
      bg: 'color-mix(in srgb, var(--settle) 16%, transparent)'
    }
  };
  const t = TONES[tone] ?? TONES.neutral;
  return /*#__PURE__*/React.createElement("span", {
    style: {
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
      ...style
    }
  }, icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 12,
    color: t.fg
  }) : null, label);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/finance/Badge.jsx", error: String((e && e.message) || e) }); }

// components/finance/CategoryChip.jsx
try { (() => {
/**
 * Category pill. Unselected: bgMuted with the category color icon. Selected:
 * solid teal with dark text. Used in pickers and filter bars.
 */
function CategoryChip({
  label,
  icon = 'tag',
  color = 'var(--text-secondary)',
  selected = false,
  onClick,
  style
}) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClick,
    style: {
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
      ...style
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 13,
    color: selected ? 'var(--bg)' : color
  }), label);
}
Object.assign(__ds_scope, { CategoryChip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/finance/CategoryChip.jsx", error: String((e && e.message) || e) }); }

// components/finance/FAB.jsx
try { (() => {
/**
 * The floating action button — teal→coral gradient, glows in its own coral
 * light. Position it bottom-right over a screen. Renders a plus by default.
 */
function FAB({
  icon = 'plus',
  onClick,
  style
}) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClick,
    "aria-label": "Add",
    style: {
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
      ...style
    },
    onMouseDown: e => {
      e.currentTarget.style.transform = 'scale(0.9)';
    },
    onMouseUp: e => {
      e.currentTarget.style.transform = 'scale(1)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.transform = 'scale(1)';
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 28,
    color: "#fff"
  }));
}
Object.assign(__ds_scope, { FAB });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/finance/FAB.jsx", error: String((e && e.message) || e) }); }

// components/finance/TransactionRow.jsx
try { (() => {
/**
 * A transaction list row: category icon circle + name/note + signed amount.
 * Min 64px tall. Expenses use the category color; income is green, settlement
 * is purple. Amount sign is driven by the paise value.
 */
function TransactionRow({
  category,
  note,
  icon = 'tag',
  color = 'var(--text-secondary)',
  paise,
  kind = 'expense',
  onClick,
  style
}) {
  const visual = kind === 'income' ? {
    icon: 'trending-up',
    color: 'var(--income)'
  } : kind === 'settlement' ? {
    icon: 'check-circle',
    color: 'var(--settle)'
  } : {
    icon,
    color
  };
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    role: onClick ? 'button' : undefined,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-sm)',
      padding: 'var(--space-sm) 0',
      minHeight: 64,
      cursor: onClick ? 'pointer' : 'default',
      ...style
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IconCircle, {
    name: visual.icon,
    color: visual.color,
    size: 40,
    iconSize: 18
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--body-size)',
      color: 'var(--text-primary)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, category), note ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--caption-size)',
      color: 'var(--text-secondary)',
      marginTop: 2,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, note) : null), /*#__PURE__*/React.createElement(__ds_scope.AmountText, {
    paise: paise,
    size: "sm",
    forceColor: kind === 'settlement' ? 'var(--settle)' : undefined
  }));
}
Object.assign(__ds_scope, { TransactionRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/finance/TransactionRow.jsx", error: String((e && e.message) || e) }); }

// components/ui/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * BudgetSplit's button. Primary CTAs use the teal gradient fill; never hand-roll
 * a colored TouchableOpacity. All buttons are 52px tall with radius-md.
 */
function Button({
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
  const heights = {
    lg: 52,
    md: 44,
    sm: 36
  };
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
    whiteSpace: 'nowrap'
  };
  const variants = {
    primary: {
      background: 'var(--gradient-accent)',
      color: '#fff',
      boxShadow: 'var(--shadow-sm)'
    },
    secondary: {
      background: 'transparent',
      color: 'var(--accent)',
      border: '1px solid var(--accent)'
    },
    ghost: {
      background: 'transparent',
      color: 'var(--accent)',
      padding: `0 ${size === 'sm' ? 8 : 12}px`
    },
    destructive: {
      background: 'var(--expense)',
      color: '#fff',
      boxShadow: 'var(--shadow-sm)'
    }
  };
  const content = loading ? '···' : children ?? label;
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    disabled: inactive,
    onClick: inactive ? undefined : onClick,
    style: {
      ...base,
      ...variants[variant],
      ...style
    },
    onMouseDown: e => {
      if (!inactive) e.currentTarget.style.transform = 'scale(0.97)';
    },
    onMouseUp: e => {
      e.currentTarget.style.transform = 'scale(1)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.transform = 'scale(1)';
    }
  }, rest), icon && !loading ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: size === 'sm' ? 15 : 18,
    color: "currentColor"
  }) : null, content);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/ui/Button.jsx", error: String((e && e.message) || e) }); }

// components/ui/EmptyState.jsx
try { (() => {
/**
 * The one empty-state layout used everywhere: 64px icon circle → title → body →
 * optional primary action. Never render a bare "nothing here" string.
 */
function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  tint = 'var(--accent)',
  style
}) {
  const bg = `color-mix(in srgb, ${tint} 13%, transparent)`;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      gap: 'var(--space-sm)',
      padding: 'var(--space-xxl) var(--space-xl)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 64,
      height: 64,
      borderRadius: '50%',
      background: bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 'var(--space-xs)'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 26,
    color: tint
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontWeight: 600,
      fontSize: 'var(--subheading-size)',
      color: 'var(--text-primary)'
    }
  }, title), body ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--body-size)',
      color: 'var(--text-secondary)',
      lineHeight: 'var(--line-body)',
      maxWidth: 320
    }
  }, body) : null, actionLabel && onAction ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--space-md)',
      alignSelf: 'stretch'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Button, {
    label: actionLabel,
    onClick: onAction,
    fullWidth: true
  })) : null);
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/ui/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/ui/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Text input on the bgInput surface. Optional leading icon; focus brings up the
 * teal border. Pass type="amount" to right-align in Space Mono for money entry.
 */
function Input({
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
  return /*#__PURE__*/React.createElement("div", {
    style: {
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
      ...style
    }
  }, icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 17,
    color: "var(--text-muted)"
  }) : null, prefix ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      color: 'var(--text-secondary)',
      fontSize: 'var(--amount-md-size)'
    }
  }, prefix) : null, /*#__PURE__*/React.createElement("input", _extends({
    value: value,
    onChange: onChange,
    placeholder: placeholder,
    disabled: disabled,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      flex: 1,
      minWidth: 0,
      background: 'transparent',
      border: 'none',
      outline: 'none',
      color: 'var(--text-primary)',
      fontFamily: isAmount ? 'var(--font-mono)' : 'var(--font-ui)',
      fontSize: isAmount ? 'var(--amount-md-size)' : 'var(--body-size)',
      textAlign: isAmount ? 'right' : 'left'
    }
  }, rest)));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/ui/Input.jsx", error: String((e && e.message) || e) }); }

// components/ui/SettingsRow.jsx
try { (() => {
/**
 * One row inside a settings-style card: icon circle + label + value/chevron.
 * Min 52px tall. Group several inside a Card with Dividers (inset 64).
 */
function SettingsRow({
  icon,
  label,
  value,
  tint = 'var(--accent)',
  onClick,
  chevron,
  right,
  danger = false,
  style
}) {
  const showChevron = chevron ?? !!onClick;
  const labelColor = danger ? 'var(--expense)' : 'var(--text-primary)';
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    role: onClick ? 'button' : undefined,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      padding: 'var(--space-md)',
      minHeight: 52,
      cursor: onClick ? 'pointer' : 'default',
      ...style
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IconCircle, {
    name: icon,
    color: danger ? 'var(--expense)' : tint,
    size: 32,
    iconSize: 16
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--body-size)',
      color: labelColor
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-xs)',
      flexShrink: 1
    }
  }, right ?? (value ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--body-size)',
      color: 'var(--text-secondary)'
    }
  }, value) : null), showChevron ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-right",
    size: 16,
    color: "var(--text-muted)"
  }) : null));
}
Object.assign(__ds_scope, { SettingsRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/ui/SettingsRow.jsx", error: String((e && e.message) || e) }); }

// components/ui/Switch.jsx
try { (() => {
/** iOS-style toggle. Track turns teal when on; thumb is always the primary text color. */
function Switch({
  checked = false,
  onChange,
  disabled = false,
  style
}) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    role: "switch",
    "aria-checked": checked,
    disabled: disabled,
    onClick: () => !disabled && onChange && onChange(!checked),
    style: {
      width: 50,
      height: 30,
      borderRadius: 'var(--radius-pill)',
      border: 'none',
      padding: 3,
      background: checked ? 'var(--accent)' : 'var(--bg-muted)',
      cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      transition: 'background 160ms ease',
      display: 'inline-flex',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 24,
      height: 24,
      borderRadius: '50%',
      background: 'var(--text-primary)',
      boxShadow: 'var(--shadow-sm)',
      transform: checked ? 'translateX(20px)' : 'translateX(0)',
      transition: 'transform 160ms cubic-bezier(0.34,1.56,0.64,1)'
    }
  }));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/ui/Switch.jsx", error: String((e && e.message) || e) }); }

// components/ui/TabPills.jsx
try { (() => {
/**
 * Segmented control / tab pills — e.g. Today · Month · Year on the dashboard.
 * Active pill fills teal with dark text; the rest sit on bgMuted.
 */
function TabPills({
  tabs,
  value,
  onChange,
  style
}) {
  const items = tabs.map(t => typeof t === 'string' ? {
    key: t,
    label: t
  } : t);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-xs)',
      ...style
    }
  }, items.map(t => {
    const active = t.key === value;
    return /*#__PURE__*/React.createElement("button", {
      key: t.key,
      type: "button",
      onClick: () => onChange && onChange(t.key),
      style: {
        border: 'none',
        cursor: 'pointer',
        padding: '7px 16px',
        borderRadius: 'var(--radius-pill)',
        background: active ? 'var(--accent)' : 'var(--bg-muted)',
        color: active ? 'var(--bg)' : 'var(--text-secondary)',
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--label-size)',
        fontWeight: active ? 600 : 400,
        transition: 'background 140ms ease, color 140ms ease'
      }
    }, t.label);
  }));
}
Object.assign(__ds_scope, { TabPills });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/ui/TabPills.jsx", error: String((e && e.message) || e) }); }

// ui_kits/budgetsplit/AddSheet.jsx
try { (() => {
/* Add bottom-sheet — the FAB's action menu. Slides up from the bottom. */
function AddSheet({
  open,
  onClose
}) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const {
    Icon
  } = DS;
  const actions = [{
    label: 'Expense',
    icon: 'minus-circle',
    tint: 'var(--expense)',
    desc: 'Record spending'
  }, {
    label: 'Income',
    icon: 'plus-circle',
    tint: 'var(--income)',
    desc: 'Money you received'
  }, {
    label: 'Transfer',
    icon: 'repeat',
    tint: 'var(--settle)',
    desc: 'Move money between people'
  }, {
    label: 'Itemized Bill',
    icon: 'list',
    tint: 'var(--accent)',
    desc: 'Split a bill line by line'
  }];
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 200,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
      opacity: open ? 1 : 0,
      pointerEvents: open ? 'auto' : 'none',
      transition: 'opacity 220ms ease'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: 'var(--bg-card)',
      borderTopLeftRadius: 'var(--radius-lg)',
      borderTopRightRadius: 'var(--radius-lg)',
      padding: '8px 24px 34px',
      boxShadow: 'var(--shadow-lg)',
      transform: open ? 'translateY(0)' : 'translateY(100%)',
      transition: 'transform 280ms cubic-bezier(0.22,1,0.36,1)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 38,
      height: 4,
      borderRadius: 2,
      background: 'var(--border)',
      margin: '8px auto 16px'
    }
  }), actions.map(a => /*#__PURE__*/React.createElement("div", {
    key: a.label,
    onClick: onClose,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '10px 4px',
      minHeight: 56,
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 40,
      height: 40,
      borderRadius: 20,
      background: `color-mix(in srgb, ${a.tint} 13%, transparent)`,
      border: `1px solid color-mix(in srgb, ${a.tint} 27%, transparent)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: a.icon,
    size: 18,
    color: a.tint
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--body-size)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, a.label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--caption-size)',
      color: 'var(--text-secondary)',
      marginTop: 1
    }
  }, a.desc)), /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 16,
    color: "var(--text-muted)"
  })))));
}
window.BS_AddSheet = AddSheet;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/budgetsplit/AddSheet.jsx", error: String((e && e.message) || e) }); }

// ui_kits/budgetsplit/App.jsx
try { (() => {
/* App shell — phone frame, status bar, scroll area, bottom tab bar + FAB.
   Holds navigation state across the BudgetSplit UI kit. */
function App() {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const {
    FAB,
    Icon
  } = DS;
  const [stage, setStage] = React.useState('onboarding'); // onboarding | app
  const [tab, setTab] = React.useState('home');
  const [detail, setDetail] = React.useState(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const TABS = [{
    key: 'home',
    icon: 'home',
    label: 'Home'
  }, {
    key: 'groups',
    icon: 'users',
    label: 'Groups'
  }, {
    key: 'reports',
    icon: 'bar-chart-2',
    label: 'Reports'
  }, {
    key: 'settings',
    icon: 'settings',
    label: 'Settings'
  }];
  function openGroup(g) {
    setDetail(g);
  }
  const Onboarding = window.BS_Onboarding;
  const GroupDetail = window.BS_GroupDetail;
  const DashboardScreen = window.BS_Dashboard;
  const GroupsScreen = window.BS_Groups;
  const ReportsScreen = window.BS_Reports;
  const SettingsScreen = window.BS_Settings;
  const AddSheet = window.BS_AddSheet;
  let screen;
  if (detail) {
    screen = /*#__PURE__*/React.createElement(GroupDetail, {
      group: detail,
      onBack: () => setDetail(null)
    });
  } else if (tab === 'home') {
    screen = /*#__PURE__*/React.createElement(DashboardScreen, {
      onOpenGroup: openGroup
    });
  } else if (tab === 'groups') {
    screen = /*#__PURE__*/React.createElement(GroupsScreen, {
      onOpenGroup: openGroup
    });
  } else if (tab === 'reports') {
    screen = /*#__PURE__*/React.createElement(ReportsScreen, null);
  } else {
    screen = /*#__PURE__*/React.createElement(SettingsScreen, null);
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: '#05080A',
      padding: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: 390,
      height: 844,
      background: 'var(--bg)',
      borderRadius: 46,
      overflow: 'hidden',
      boxShadow: '0 40px 90px rgba(0,0,0,0.6), 0 0 0 11px #1a1d22, 0 0 0 13px #2a2e34'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 50,
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      padding: '0 28px 6px',
      zIndex: 50,
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, "9:41"), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 120,
      height: 30,
      background: '#000',
      borderRadius: 16,
      position: 'absolute',
      left: '50%',
      transform: 'translateX(-50%)',
      top: 10
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'center',
      color: 'var(--text-primary)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "wifi",
    size: 15,
    color: "var(--text-primary)"
  }), /*#__PURE__*/React.createElement(Icon, {
    name: "battery",
    size: 16,
    color: "var(--text-primary)"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      overflowY: 'auto',
      paddingTop: 50
    },
    className: "bs-scroll"
  }, stage === 'onboarding' ? /*#__PURE__*/React.createElement("div", {
    style: {
      height: 794
    }
  }, /*#__PURE__*/React.createElement(Onboarding, {
    onDone: () => setStage('app')
  })) : screen), stage === 'app' && !detail && /*#__PURE__*/React.createElement(FAB, {
    onClick: () => setAddOpen(true),
    style: {
      bottom: 96,
      right: 20
    }
  }), stage === 'app' && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 84,
      paddingBottom: 18,
      background: 'color-mix(in srgb, var(--bg) 88%, transparent)',
      backdropFilter: 'blur(16px)',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      zIndex: 60
    }
  }, TABS.map(t => {
    const active = !detail && tab === t.key;
    return /*#__PURE__*/React.createElement("button", {
      key: t.key,
      onClick: () => {
        setTab(t.key);
        setDetail(null);
      },
      style: {
        flex: 1,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        paddingTop: 10
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: t.icon,
      size: 22,
      color: active ? 'var(--accent)' : 'var(--text-muted)'
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-ui)',
        fontSize: 10,
        fontWeight: active ? 600 : 400,
        color: active ? 'var(--accent)' : 'var(--text-muted)'
      }
    }, t.label));
  })), /*#__PURE__*/React.createElement(AddSheet, {
    open: addOpen,
    onClose: () => setAddOpen(false)
  })));
}
window.BS_App = App;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/budgetsplit/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/budgetsplit/Dashboard.jsx
try { (() => {
/* Dashboard (Home tab) — the BudgetSplit landing screen.
   Hero spending card, budget rollup, owe/owed, donut by category, groups. */
function Dashboard({
  onOpenGroup
}) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const {
    TabPills,
    AmountText,
    Card,
    BudgetBar,
    Badge,
    Icon,
    IconCircle,
    formatRupees,
    formatRupeesShort
  } = DS;
  const D = window.BS_DATA;
  const [tab, setTab] = React.useState('month');
  const net = D.month.income - D.month.spending;
  const savings = Math.round(net / D.month.income * 100);
  const delta = D.month.spending - D.month.prevSpending;
  const deltaPct = Math.round(delta / D.month.prevSpending * 100);

  // Donut via conic-gradient
  const total = D.byCategory.reduce((s, c) => s + c.paise, 0);
  let acc = 0;
  const stops = D.byCategory.map(c => {
    const start = acc / total * 360;
    acc += c.paise;
    const end = acc / total * 360;
    return `${c.color} ${start}deg ${end}deg`;
  }).join(', ');
  const label = {
    fontFamily: 'var(--font-ui)',
    fontSize: 'var(--label-size)',
    color: 'var(--text-secondary)'
  };
  const cap = {
    fontFamily: 'var(--font-ui)',
    fontSize: 'var(--caption-size)',
    color: 'var(--text-muted)'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 16px 130px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '8px 0 20px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--title-size)',
      fontWeight: 600,
      letterSpacing: '-0.4px',
      color: 'var(--text-primary)'
    }
  }, "BudgetSplit"), /*#__PURE__*/React.createElement(DS.MemberAvatar, {
    name: D.me.name,
    color: D.me.color,
    size: 34
  })), /*#__PURE__*/React.createElement(TabPills, {
    tabs: [{
      key: 'today',
      label: 'Today'
    }, {
      key: 'month',
      label: 'Month'
    }, {
      key: 'year',
      label: 'Year'
    }],
    value: tab,
    onChange: setTab,
    style: {
      marginBottom: 20
    }
  }), /*#__PURE__*/React.createElement(Card, {
    style: {
      boxShadow: 'var(--shadow-md)',
      marginBottom: 16,
      padding: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...label,
      marginBottom: 4
    }
  }, "My spending"), /*#__PURE__*/React.createElement(AmountText, {
    paise: D.month.spending,
    size: "xl",
    forceColor: "var(--text-primary)",
    rounded: true
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-up-right",
    size: 13,
    color: "var(--expense)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      ...label,
      color: 'var(--expense)'
    }
  }, Math.abs(deltaPct), "% vs last month")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      marginTop: 18
    }
  }, [['Income', /*#__PURE__*/React.createElement(AmountText, {
    paise: D.month.income,
    size: "md",
    forceColor: "var(--income)",
    rounded: true
  })], ['Net', /*#__PURE__*/React.createElement(AmountText, {
    paise: net,
    size: "md",
    forceColor: "var(--text-primary)",
    rounded: true
  })], ['Savings', /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 18,
      color: 'var(--income)'
    }
  }, savings, "%")]].map(([t, node], i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: cap
  }, t), node)))), /*#__PURE__*/React.createElement(Card, {
    onClick: () => {},
    style: {
      marginBottom: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--subheading-size)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, "Budget"), /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 16,
    color: "var(--text-muted)"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center'
    }
  }, [['Budget', D.budget.allocated, 'var(--text-primary)'], ['Spent', D.budget.spent, 'var(--text-primary)'], ['Left', Math.max(0, D.budget.allocated - D.budget.spent), 'var(--income)']].map(([t, v, c], i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, i > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1,
      height: 28,
      background: 'var(--border)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: cap
  }, t), /*#__PURE__*/React.createElement(AmountText, {
    paise: v,
    size: "sm",
    forceColor: c,
    rounded: true
  }))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    label: `${D.budget.over} over budget`,
    icon: "alert-triangle",
    tone: "expense"
  }), /*#__PURE__*/React.createElement(Badge, {
    label: `${D.budget.near} near limit`,
    icon: "clock",
    tone: "amber"
  }))), /*#__PURE__*/React.createElement(Card, {
    onClick: () => {},
    style: {
      marginBottom: 16,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--body-size)',
      color: 'var(--text-secondary)'
    }
  }, "You owe ", formatRupees(D.owe), " \xB7 Owed ", formatRupees(D.owed)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--label-size)',
      fontWeight: 600,
      color: 'var(--accent)'
    }
  }, "Settle Up")), /*#__PURE__*/React.createElement(Card, {
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...label,
      marginBottom: 16
    }
  }, "Spending by category"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 22
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: 132,
      height: 132,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 132,
      height: 132,
      borderRadius: '50%',
      background: `conic-gradient(${stops})`
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 26,
      borderRadius: '50%',
      background: 'var(--bg-card)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontWeight: 600,
      fontSize: 22,
      color: 'var(--text-primary)'
    }
  }, D.byCategory.length), /*#__PURE__*/React.createElement("span", {
    style: cap
  }, "categories"))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 9
    }
  }, D.byCategory.slice(0, 5).map(c => /*#__PURE__*/React.createElement("div", {
    key: c.name,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: 4,
      background: c.color,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      ...cap,
      color: 'var(--text-secondary)',
      flex: 1,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, c.name), /*#__PURE__*/React.createElement("span", {
    style: {
      ...cap,
      width: 34,
      textAlign: 'right'
    }
  }, Math.round(c.paise / total * 100), "%"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: 'var(--text-primary)',
      width: 62,
      textAlign: 'right'
    }
  }, formatRupeesShort(c.paise))))))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--subheading-size)',
      fontWeight: 600,
      color: 'var(--text-primary)',
      marginBottom: 10
    }
  }, "Groups"), /*#__PURE__*/React.createElement(Card, {
    padded: false
  }, D.groups.map((g, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: g.id
  }, i > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: 'var(--border)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    onClick: () => onOpenGroup && onOpenGroup(g),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: 16,
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--body-size)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, g.name), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(BudgetBar, {
    pct: g.pct,
    health: g.health,
    height: 4
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      ...cap,
      minWidth: 30,
      textAlign: 'right'
    }
  }, g.pct, "%"))), /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 16,
    color: "var(--text-muted)"
  }))))));
}
window.BS_Dashboard = Dashboard;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/budgetsplit/Dashboard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/budgetsplit/GroupDetail.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Group detail — members, balance banner, and the transaction ledger. Pushed
   when you tap a group. Demonstrates TransactionRow grouped by date section. */
function GroupDetail({
  group,
  onBack
}) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const {
    Card,
    Divider,
    TransactionRow,
    MemberAvatar,
    Button,
    Icon,
    AmountText
  } = DS;
  const D = window.BS_DATA;
  const g = group || D.groups[0];

  // group recent into date sections
  const sections = [];
  D.recent.forEach(t => {
    let s = sections.find(x => x.when === t.when);
    if (!s) {
      s = {
        when: t.when,
        items: []
      };
      sections.push(s);
    }
    s.items.push(t);
  });
  const cap = {
    fontFamily: 'var(--font-ui)',
    fontSize: 'var(--caption-size)',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 16px 130px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '8px 0 16px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    style: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: 0,
      marginLeft: -6,
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-left",
    size: 26,
    color: "var(--text-secondary)"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--heading-size)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, g.name)), /*#__PURE__*/React.createElement(Card, {
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex'
    }
  }, D.members.map((m, i) => /*#__PURE__*/React.createElement("span", {
    key: m.name,
    style: {
      marginLeft: i ? -10 : 0,
      borderRadius: '50%',
      boxShadow: '0 0 0 2px var(--bg-card)'
    }
  }, /*#__PURE__*/React.createElement(MemberAvatar, {
    name: m.name,
    color: m.color,
    size: 36
  })))), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--caption-size)',
      color: 'var(--text-secondary)'
    }
  }, g.members, " members")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--label-size)',
      color: 'var(--text-secondary)',
      marginBottom: 4
    }
  }, "You owe Priya"), /*#__PURE__*/React.createElement(AmountText, {
    paise: -90000,
    size: "lg"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 130
    }
  }, /*#__PURE__*/React.createElement(Button, {
    label: "Settle Up",
    variant: "secondary",
    size: "md",
    fullWidth: true
  })))), sections.map(s => /*#__PURE__*/React.createElement("div", {
    key: s.when,
    style: {
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...cap,
      margin: '12px 4px 4px'
    }
  }, s.when), /*#__PURE__*/React.createElement(Card, {
    padded: false,
    style: {
      padding: '0 16px'
    }
  }, s.items.map((t, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, i > 0 && /*#__PURE__*/React.createElement(Divider, {
    inset: 56
  }), /*#__PURE__*/React.createElement(TransactionRow, _extends({}, t, {
    onClick: () => {}
  }))))))));
}
window.BS_GroupDetail = GroupDetail;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/budgetsplit/GroupDetail.jsx", error: String((e && e.message) || e) }); }

// ui_kits/budgetsplit/Groups.jsx
try { (() => {
/* Groups tab — list of budget groups with spend + members + budget health. */
function Groups({
  onOpenGroup
}) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const {
    Card,
    BudgetBar,
    IconCircle,
    Icon,
    formatRupeesShort
  } = DS;
  const D = window.BS_DATA;
  const cap = {
    fontFamily: 'var(--font-ui)',
    fontSize: 'var(--caption-size)',
    color: 'var(--text-secondary)'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 16px 130px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--title-size)',
      fontWeight: 600,
      letterSpacing: '-0.4px',
      color: 'var(--text-primary)',
      padding: '8px 0 20px'
    }
  }, "Groups"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, D.groups.map(g => /*#__PURE__*/React.createElement(Card, {
    key: g.id,
    onClick: () => onOpenGroup && onOpenGroup(g),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 46,
      height: 46,
      borderRadius: 14,
      background: `color-mix(in srgb, ${g.color} 13%, transparent)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: g.icon,
    size: 20,
    color: g.color
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--subheading-size)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, g.name), /*#__PURE__*/React.createElement("span", {
    style: cap
  }, formatRupeesShort(g.spent), " this month", !g.personal ? ` · ${g.members} members` : ''), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(BudgetBar, {
    pct: g.pct,
    health: g.health,
    height: 5
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      ...cap,
      color: 'var(--text-muted)',
      minWidth: 30,
      textAlign: 'right'
    }
  }, g.pct, "%"))), /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 18,
    color: "var(--text-muted)"
  })))));
}
window.BS_Groups = Groups;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/budgetsplit/Groups.jsx", error: String((e && e.message) || e) }); }

// ui_kits/budgetsplit/Onboarding.jsx
try { (() => {
/* Onboarding hero — the welcome screen. Tapping "Get Started" enters the app. */
function Onboarding({
  onDone
}) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const {
    Button
  } = DS;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      padding: '0 16px 24px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 92,
      height: 92,
      borderRadius: 24,
      background: 'var(--gradient-brand)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
      boxShadow: 'var(--shadow-lg)'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-mark.png",
    alt: "",
    style: {
      width: 60,
      height: 60
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 36,
      fontWeight: 600,
      letterSpacing: '-0.4px',
      color: 'var(--text-primary)'
    }
  }, "BudgetSplit"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 16,
      color: 'var(--text-secondary)',
      marginTop: 16,
      lineHeight: 1.5,
      maxWidth: 300
    }
  }, "Budget your money and split bills \u2014 all on your phone, nothing in the cloud.")), /*#__PURE__*/React.createElement(Button, {
    label: "Get Started",
    variant: "primary",
    fullWidth: true,
    onClick: onDone
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--caption-size)',
      color: 'var(--text-muted)',
      marginTop: 14
    }
  }, "Takes 20 seconds \xB7 no sign-up"));
}
window.BS_Onboarding = Onboarding;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/budgetsplit/Onboarding.jsx", error: String((e && e.message) || e) }); }

// ui_kits/budgetsplit/Reports.jsx
try { (() => {
/* Reports tab — spend trend (weekly bars) + category breakdown. */
function Reports() {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const {
    Card,
    TabPills,
    AmountText,
    formatRupeesShort
  } = DS;
  const D = window.BS_DATA;
  const [tab, setTab] = React.useState('month');
  const bars = [{
    label: 'Jun 1',
    v: 38
  }, {
    label: 'Jun 8',
    v: 64
  }, {
    label: 'Jun 15',
    v: 52
  }, {
    label: 'Jun 22',
    v: 88
  }, {
    label: 'Jun 29',
    v: 71
  }];
  const maxV = Math.max(...bars.map(b => b.v));
  const total = D.byCategory.reduce((s, c) => s + c.paise, 0);
  const sorted = [...D.byCategory].sort((a, b) => b.paise - a.paise);
  const cap = {
    fontFamily: 'var(--font-ui)',
    fontSize: 'var(--caption-size)',
    color: 'var(--text-muted)'
  };
  const label = {
    fontFamily: 'var(--font-ui)',
    fontSize: 'var(--label-size)',
    color: 'var(--text-secondary)'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 16px 130px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--title-size)',
      fontWeight: 600,
      letterSpacing: '-0.4px',
      color: 'var(--text-primary)',
      padding: '8px 0 20px'
    }
  }, "Reports"), /*#__PURE__*/React.createElement(TabPills, {
    tabs: [{
      key: 'month',
      label: 'Month'
    }, {
      key: 'year',
      label: 'Year'
    }],
    value: tab,
    onChange: setTab,
    style: {
      marginBottom: 16
    }
  }), /*#__PURE__*/React.createElement(Card, {
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...label,
      marginBottom: 16
    }
  }, "Spending over time"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: 10,
      height: 120
    }
  }, bars.map(b => /*#__PURE__*/React.createElement("div", {
    key: b.label,
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      height: `${b.v / maxV * 96}px`,
      background: 'var(--accent)',
      borderRadius: 6,
      opacity: 0.9
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      ...cap,
      fontSize: 9
    }
  }, b.label))))), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
    style: {
      ...label,
      marginBottom: 16
    }
  }, "By category"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, sorted.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.name
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--body-size)',
      color: 'var(--text-primary)'
    }
  }, c.name), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
      color: 'var(--text-primary)'
    }
  }, formatRupeesShort(c.paise))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 6,
      background: 'var(--bg-muted)',
      borderRadius: 999,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${c.paise / total * 100}%`,
      height: '100%',
      background: c.color,
      borderRadius: 999
    }
  })))))));
}
window.BS_Reports = Reports;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/budgetsplit/Reports.jsx", error: String((e && e.message) || e) }); }

// ui_kits/budgetsplit/Settings.jsx
try { (() => {
/* Settings tab — profile, privacy toggles, preferences, personal limits. */
function Settings() {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const {
    Card,
    Divider,
    SettingsRow,
    Switch,
    MemberAvatar,
    Icon
  } = DS;
  const D = window.BS_DATA;
  const [faceId, setFaceId] = React.useState(false);
  const [privacy, setPrivacy] = React.useState(true);
  const [loc, setLoc] = React.useState(false);
  const section = {
    fontFamily: 'var(--font-ui)',
    fontSize: 'var(--label-size)',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    margin: '20px 0 8px'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 16px 130px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--title-size)',
      fontWeight: 600,
      letterSpacing: '-0.4px',
      color: 'var(--text-primary)',
      padding: '8px 0 4px'
    }
  }, "Settings"), /*#__PURE__*/React.createElement("div", {
    style: section
  }, "Account"), /*#__PURE__*/React.createElement(Card, {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(MemberAvatar, {
    name: D.me.name,
    color: D.me.color,
    size: 44
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--subheading-size)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, D.me.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--caption-size)',
      color: 'var(--text-muted)',
      marginTop: 2
    }
  }, "Tap to edit your name")), /*#__PURE__*/React.createElement(Icon, {
    name: "edit-2",
    size: 16,
    color: "var(--text-muted)"
  })), /*#__PURE__*/React.createElement("div", {
    style: section
  }, "Privacy & Security"), /*#__PURE__*/React.createElement(Card, {
    padded: false
  }, /*#__PURE__*/React.createElement(SettingsRow, {
    icon: "lock",
    label: "Face ID / Touch ID lock",
    right: /*#__PURE__*/React.createElement(Switch, {
      checked: faceId,
      onChange: setFaceId
    })
  }), /*#__PURE__*/React.createElement(Divider, {
    inset: 64
  }), /*#__PURE__*/React.createElement(SettingsRow, {
    icon: "eye-off",
    label: "Privacy screen",
    right: /*#__PURE__*/React.createElement(Switch, {
      checked: privacy,
      onChange: setPrivacy
    })
  }), /*#__PURE__*/React.createElement(Divider, {
    inset: 64
  }), /*#__PURE__*/React.createElement(SettingsRow, {
    icon: "map-pin",
    label: "Save transaction location",
    right: /*#__PURE__*/React.createElement(Switch, {
      checked: loc,
      onChange: setLoc
    })
  })), /*#__PURE__*/React.createElement("div", {
    style: section
  }, "Preferences"), /*#__PURE__*/React.createElement(Card, {
    padded: false
  }, /*#__PURE__*/React.createElement(SettingsRow, {
    icon: "repeat",
    label: "Default budget cadence",
    value: "Monthly",
    onClick: () => {}
  }), /*#__PURE__*/React.createElement(Divider, {
    inset: 64
  }), /*#__PURE__*/React.createElement(SettingsRow, {
    icon: "dollar-sign",
    label: "Currency",
    value: "\u20B9 Indian Rupee",
    chevron: false
  })), /*#__PURE__*/React.createElement("div", {
    style: section
  }, "Manage"), /*#__PURE__*/React.createElement(Card, {
    padded: false
  }, /*#__PURE__*/React.createElement(SettingsRow, {
    icon: "tag",
    label: "Categories",
    onClick: () => {}
  }), /*#__PURE__*/React.createElement(Divider, {
    inset: 64
  }), /*#__PURE__*/React.createElement(SettingsRow, {
    icon: "clock",
    label: "History",
    onClick: () => {}
  }), /*#__PURE__*/React.createElement(Divider, {
    inset: 64
  }), /*#__PURE__*/React.createElement(SettingsRow, {
    icon: "help-circle",
    label: "Help & Guide",
    onClick: () => {}
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      marginTop: 24,
      fontFamily: 'var(--font-ui)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--body-size)',
      color: 'var(--text-primary)'
    }
  }, "BudgetSplit v1.0"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--caption-size)',
      color: 'var(--text-secondary)',
      marginTop: 2
    }
  }, "Offline-first \xB7 No accounts \xB7 No tracking")));
}
window.BS_Settings = Settings;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/budgetsplit/Settings.jsx", error: String((e && e.message) || e) }); }

// ui_kits/budgetsplit/data.js
try { (() => {
/* BudgetSplit UI-kit seed data. Amounts are integer paise (₹1 = 100 paise).
   Context: an urban Indian working professional in Gurgaon — the same framing
   the real app's category catalog is tuned for. */
window.BS_DATA = {
  me: {
    name: 'Aarav Mehta',
    color: '#319795'
  },
  // Dashboard headline (this month, my share)
  month: {
    spending: 4218000,
    // ₹42,180
    prevSpending: 3890000,
    income: 9500000 // ₹95,000
  },
  owe: 132500,
  // you owe ₹1,325
  owed: 460000,
  // owed ₹4,600

  budget: {
    allocated: 5000000,
    spent: 4218000,
    over: 1,
    near: 2
  },
  // Spending by category (paise) — feeds the donut
  byCategory: [{
    name: 'Rent',
    paise: 1800000,
    color: '#7C6AF7'
  }, {
    name: 'Food Delivery',
    paise: 624000,
    color: '#F0A500'
  }, {
    name: 'Groceries',
    paise: 512000,
    color: '#3ECF8E'
  }, {
    name: 'Cab & Auto',
    paise: 388000,
    color: '#FACC15'
  }, {
    name: 'Subscriptions',
    paise: 294000,
    color: '#2DD4BF'
  }, {
    name: 'Eating Out',
    paise: 600000,
    color: '#FB923C'
  }],
  recent: [{
    category: 'Food Delivery',
    note: 'Swiggy — dinner',
    icon: 'shopping-bag',
    color: '#F0A500',
    paise: -48000,
    kind: 'expense',
    when: 'Today'
  }, {
    category: 'Cab & Auto',
    note: 'Uber to office',
    icon: 'navigation',
    color: '#FACC15',
    paise: -21800,
    kind: 'expense',
    when: 'Today'
  }, {
    category: 'Chai & Snacks',
    note: 'Blue Tokai',
    icon: 'box',
    color: '#FBBF24',
    paise: -36000,
    kind: 'expense',
    when: 'Today'
  }, {
    category: 'Salary',
    note: 'October — Acme Corp',
    icon: 'briefcase',
    color: '#3ECF8E',
    paise: 9500000,
    kind: 'income',
    when: 'Yesterday'
  }, {
    category: 'Groceries',
    note: 'BigBasket weekly',
    icon: 'shopping-cart',
    color: '#3ECF8E',
    paise: -184500,
    kind: 'expense',
    when: 'Yesterday'
  }, {
    category: 'Settle with Priya',
    note: 'Goa trip share',
    icon: 'check-circle',
    color: '#8B7CF8',
    paise: -90000,
    kind: 'settlement',
    when: '14 Jun'
  }, {
    category: 'Subscriptions',
    note: 'Spotify + Netflix',
    icon: 'repeat',
    color: '#2DD4BF',
    paise: -79900,
    kind: 'expense',
    when: '14 Jun'
  }],
  groups: [{
    id: 'flat',
    name: 'Flatmates — Gurgaon',
    icon: 'home',
    color: '#7C6AF7',
    spent: 6840000,
    members: 3,
    pct: 78,
    health: 'amber'
  }, {
    id: 'goa',
    name: 'Goa Trip',
    icon: 'map',
    color: '#F472B6',
    spent: 4215000,
    members: 5,
    pct: 104,
    health: 'red'
  }, {
    id: 'me',
    name: 'Personal',
    icon: 'credit-card',
    color: '#20C4B8',
    spent: 4218000,
    members: 1,
    pct: 84,
    health: 'amber',
    personal: true
  }, {
    id: 'off',
    name: 'Office Lunch Club',
    icon: 'coffee',
    color: '#FB923C',
    spent: 312000,
    members: 6,
    pct: 41,
    health: 'green'
  }],
  members: [{
    name: 'Aarav Mehta',
    color: '#319795'
  }, {
    name: 'Priya Singh',
    color: '#B83280'
  }, {
    name: 'Rohit Khanna',
    color: '#38A169'
  }]
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/budgetsplit/data.js", error: String((e && e.message) || e) }); }

__ds_ns.AmountText = __ds_scope.AmountText;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.BudgetBar = __ds_scope.BudgetBar;

__ds_ns.CategoryChip = __ds_scope.CategoryChip;

__ds_ns.FAB = __ds_scope.FAB;

__ds_ns.MemberAvatar = __ds_scope.MemberAvatar;

__ds_ns.TransactionRow = __ds_scope.TransactionRow;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Divider = __ds_scope.Divider;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.IconCircle = __ds_scope.IconCircle;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.SettingsRow = __ds_scope.SettingsRow;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.TabPills = __ds_scope.TabPills;

})();
