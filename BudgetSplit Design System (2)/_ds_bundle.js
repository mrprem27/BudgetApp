/* @ds-bundle: {"format":3,"namespace":"BudgetSplitDesignSystem_f6e8de","components":[{"name":"AmountText","sourcePath":"components/finance/AmountText.jsx"},{"name":"Badge","sourcePath":"components/finance/Badge.jsx"},{"name":"BudgetBar","sourcePath":"components/finance/BudgetBar.jsx"},{"name":"CategoryChip","sourcePath":"components/finance/CategoryChip.jsx"},{"name":"FAB","sourcePath":"components/finance/FAB.jsx"},{"name":"MemberAvatar","sourcePath":"components/finance/MemberAvatar.jsx"},{"name":"TransactionRow","sourcePath":"components/finance/TransactionRow.jsx"},{"name":"Button","sourcePath":"components/ui/Button.jsx"},{"name":"Card","sourcePath":"components/ui/Card.jsx"},{"name":"Divider","sourcePath":"components/ui/Card.jsx"},{"name":"EmptyState","sourcePath":"components/ui/EmptyState.jsx"},{"name":"Icon","sourcePath":"components/ui/Icon.jsx"},{"name":"IconCircle","sourcePath":"components/ui/Icon.jsx"},{"name":"Input","sourcePath":"components/ui/Input.jsx"},{"name":"SettingsRow","sourcePath":"components/ui/SettingsRow.jsx"},{"name":"Switch","sourcePath":"components/ui/Switch.jsx"},{"name":"TabPills","sourcePath":"components/ui/TabPills.jsx"}],"sourceHashes":{"components/finance/AmountText.jsx":"bbc7465fe4b0","components/finance/Badge.jsx":"a094da45abb0","components/finance/BudgetBar.jsx":"5f4382e35aff","components/finance/CategoryChip.jsx":"431b73e512cc","components/finance/FAB.jsx":"25b0445f02f1","components/finance/MemberAvatar.jsx":"6975ca377e13","components/finance/TransactionRow.jsx":"d059530cf2b4","components/ui/Button.jsx":"b79be618472b","components/ui/Card.jsx":"0af5c8927dc2","components/ui/EmptyState.jsx":"7b0d2d569839","components/ui/Icon.jsx":"5d5479a5ef7e","components/ui/Input.jsx":"b46b27c497d0","components/ui/SettingsRow.jsx":"4e12a0c89c08","components/ui/Switch.jsx":"fc59ef25bf6e","components/ui/TabPills.jsx":"ad059afeff1a","ui_kits/budgetsplit/AddSheet.jsx":"8768ad72cf22","ui_kits/budgetsplit/App.jsx":"2dfd6511831b","ui_kits/budgetsplit/BudgetInsights.jsx":"cf860ed373d3","ui_kits/budgetsplit/CategoryDetail.jsx":"f981a8cd7d31","ui_kits/budgetsplit/CategoryDonut.jsx":"98e3ff1d0dd0","ui_kits/budgetsplit/Dashboard.jsx":"9ace4e2bc91a","ui_kits/budgetsplit/ExpenseFlow.jsx":"7aa261d8a180","ui_kits/budgetsplit/FlowKit.jsx":"a9ce16019d82","ui_kits/budgetsplit/GroupDetail.jsx":"fb4859b1c656","ui_kits/budgetsplit/Groups.jsx":"dccb6dec6f59","ui_kits/budgetsplit/ItemizedFlow.jsx":"a6c0009dc14b","ui_kits/budgetsplit/Onboarding.jsx":"ad0c1d829c0c","ui_kits/budgetsplit/Reports.jsx":"5cda913631f4","ui_kits/budgetsplit/Settings.jsx":"dd4d0b0c30c8","ui_kits/budgetsplit/SettleFlow.jsx":"662db9338595","ui_kits/budgetsplit/data.js":"b029f51f5082","ui_kits/budgetsplit/store.js":"cb9681370a15"},"inlinedExternals":[],"unexposedExports":[{"name":"avatarColor","sourcePath":"components/finance/MemberAvatar.jsx"},{"name":"formatRupees","sourcePath":"components/finance/AmountText.jsx"},{"name":"formatRupeesShort","sourcePath":"components/finance/AmountText.jsx"}]} */

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
  onClose,
  onPick
}) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const {
    Icon
  } = DS;
  const actions = [{
    key: 'expense',
    label: 'Expense',
    icon: 'minus-circle',
    tint: 'var(--expense)',
    desc: 'Record spending'
  }, {
    key: 'itemized',
    label: 'Split a bill',
    icon: 'users',
    tint: 'var(--accent)',
    desc: 'Split line items between people'
  }, {
    key: 'settle',
    label: 'Settle up',
    icon: 'check-circle',
    tint: 'var(--settle)',
    desc: 'Record a payment'
  }, {
    key: 'income',
    label: 'Income',
    icon: 'plus-circle',
    tint: 'var(--income)',
    desc: 'Money you received'
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
    key: a.key,
    onClick: () => {
      onClose && onClose();
      onPick && onPick(a.key);
    },
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
   Owns navigation, the live add/settle flows, and success feedback. */
function App() {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const {
    FAB,
    Icon
  } = DS;
  const [stage, setStage] = React.useState('onboarding'); // onboarding | app
  const [tab, setTab] = React.useState('home');
  const [detail, setDetail] = React.useState(null);
  const [budget, setBudget] = React.useState(false);
  const [category, setCategory] = React.useState(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [flow, setFlow] = React.useState(null); // expense | income | itemized | settle
  const [success, setSuccess] = React.useState(null);
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
  const Onboarding = window.BS_Onboarding;
  const GroupDetail = window.BS_GroupDetail;
  const DashboardScreen = window.BS_Dashboard;
  const GroupsScreen = window.BS_Groups;
  const ReportsScreen = window.BS_Reports;
  const SettingsScreen = window.BS_Settings;
  const AddSheet = window.BS_AddSheet;
  const ExpenseFlow = window.BS_ExpenseFlow;
  const ItemizedFlow = window.BS_ItemizedFlow;
  const SettleFlow = window.BS_SettleFlow;
  const SuccessOverlay = window.BS_SuccessOverlay;
  const BudgetInsights = window.BS_BudgetInsights;
  const CategoryDetail = window.BS_CategoryDetail;
  function openGroup(g) {
    setDetail(g);
  }
  function openSettle() {
    setFlow('settle');
  }
  function finish(label) {
    setFlow(null);
    setDetail(null);
    setBudget(false);
    setCategory(null);
    setTab('home');
    setSuccess(label);
    setTimeout(() => setSuccess(null), 1500);
  }
  let screen;
  if (category) {
    screen = /*#__PURE__*/React.createElement(CategoryDetail, {
      category: category,
      onBack: () => setCategory(null)
    });
  } else if (budget) {
    screen = /*#__PURE__*/React.createElement(BudgetInsights, {
      onBack: () => setBudget(false)
    });
  } else if (detail) {
    screen = /*#__PURE__*/React.createElement(GroupDetail, {
      group: detail,
      onBack: () => setDetail(null),
      onSettle: openSettle
    });
  } else if (tab === 'home') {
    screen = /*#__PURE__*/React.createElement(DashboardScreen, {
      onOpenGroup: openGroup,
      onSettle: openSettle,
      onOpenBudget: () => setBudget(true),
      onOpenCategory: c => setCategory(c)
    });
  } else if (tab === 'groups') {
    screen = /*#__PURE__*/React.createElement(GroupsScreen, {
      onOpenGroup: openGroup,
      onSettle: openSettle
    });
  } else if (tab === 'reports') {
    screen = /*#__PURE__*/React.createElement(ReportsScreen, {
      onOpenCategory: c => setCategory(c)
    });
  } else {
    screen = /*#__PURE__*/React.createElement(SettingsScreen, null);
  }
  const flowEl = flow === 'expense' ? /*#__PURE__*/React.createElement(ExpenseFlow, {
    onClose: () => setFlow(null),
    onSaved: () => finish('Expense added')
  }) : flow === 'income' ? /*#__PURE__*/React.createElement(ExpenseFlow, {
    kind: "income",
    onClose: () => setFlow(null),
    onSaved: () => finish('Income added')
  }) : flow === 'itemized' ? /*#__PURE__*/React.createElement(ItemizedFlow, {
    onClose: () => setFlow(null),
    onSaved: () => finish('Split saved')
  }) : flow === 'settle' ? /*#__PURE__*/React.createElement(SettleFlow, {
    onClose: () => setFlow(null),
    onSaved: () => finish('Payment recorded')
  }) : null;
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
      zIndex: 120,
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
  })) : screen), stage === 'app' && !detail && !budget && !category && !flow && /*#__PURE__*/React.createElement(FAB, {
    onClick: () => setAddOpen(true),
    style: {
      bottom: 96,
      right: 20
    }
  }), stage === 'app' && !flow && /*#__PURE__*/React.createElement("div", {
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
    const active = !detail && !budget && !category && tab === t.key;
    return /*#__PURE__*/React.createElement("button", {
      key: t.key,
      onClick: () => {
        setTab(t.key);
        setDetail(null);
        setBudget(false);
        setCategory(null);
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
    onClose: () => setAddOpen(false),
    onPick: k => setFlow(k)
  }), flowEl, /*#__PURE__*/React.createElement(SuccessOverlay, {
    show: !!success,
    label: success || 'Saved'
  })));
}
window.BS_App = App;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/budgetsplit/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/budgetsplit/BudgetInsights.jsx
try { (() => {
/* Budget & Insights — the analytics heart (V2 Phase A). Pushed from the
   dashboard Budget card. Utilization hero → needs-attention → projection →
   recommendations → all category lines. Pure derivation from BS_DATA.budgetLines. */
function BudgetInsights({
  onBack,
  onOpenExpense
}) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const {
    Card,
    BudgetBar,
    Badge,
    Icon,
    IconCircle,
    AmountText
  } = DS;
  const fmt = window.BS_formatRupeesShort;
  const D = window.BS_DATA;
  const lines = D.budgetLines.map(l => {
    const pct = l.allocated > 0 ? Math.round(l.spent / l.allocated * 100) : 0;
    const health = pct > 100 ? 'red' : pct >= 85 ? 'amber' : 'green';
    return {
      ...l,
      pct,
      health,
      remaining: l.allocated - l.spent
    };
  });
  const allocated = lines.reduce((s, l) => s + l.allocated, 0);
  const spent = lines.reduce((s, l) => s + l.spent, 0);
  const util = Math.round(spent / allocated * 100);
  const over = lines.filter(l => l.pct > 100);
  const near = lines.filter(l => l.pct >= 85 && l.pct <= 100);
  const onTrack = lines.filter(l => l.pct < 85 && l.spent > 0).length + lines.filter(l => l.spent === 0).length;
  const attention = [...over, ...near].sort((a, b) => b.pct - a.pct);
  const proj = D.projection;
  const projOver = proj.projected - allocated;

  // rule-based recommendations
  const recs = [];
  over.forEach(l => {
    const ovr = l.spent - l.allocated;
    recs.push({
      icon: 'alert-triangle',
      tint: 'var(--expense)',
      text: `${l.name} is ${l.pct - 100}% over — trim about ${fmt(ovr)} to get back on track.`
    });
  });
  const biggestUnused = lines.filter(l => l.remaining > 0).sort((a, b) => b.remaining - a.remaining)[0];
  if (biggestUnused && over[0]) {
    recs.push({
      icon: 'shuffle',
      tint: 'var(--accent)',
      text: `${fmt(biggestUnused.remaining)} unused in ${biggestUnused.name} — you could move some to ${over[0].name}.`
    });
  }
  if (projOver > 0) {
    recs.push({
      icon: 'trending-up',
      tint: 'var(--health-amber)',
      text: `Pacing ${Math.round((proj.projected / allocated - 1) * 100)}% above budget — projected ${fmt(proj.projected)} by month-end.`
    });
  } else {
    recs.push({
      icon: 'check-circle',
      tint: 'var(--income)',
      text: `On pace to finish under budget — projected ${fmt(proj.projected)}.`
    });
  }
  const lbl = {
    fontFamily: 'var(--font-ui)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--text-secondary)',
    margin: '0 2px 10px'
  };
  const cap = {
    fontFamily: 'var(--font-ui)',
    fontSize: 'var(--caption-size)',
    color: 'var(--text-muted)'
  };
  const utilColor = util > 100 ? 'var(--health-red)' : util >= 85 ? 'var(--health-amber)' : 'var(--income)';
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
  }, "Budget & Insights")), /*#__PURE__*/React.createElement(Card, {
    style: {
      boxShadow: 'var(--shadow-md)',
      marginBottom: 16,
      padding: 22
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      ...lbl,
      margin: '0 0 4px'
    }
  }, "Budget used"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 44,
      letterSpacing: '-1px',
      color: utilColor
    }
  }, util), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 22,
      color: utilColor
    }
  }, "%"))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement(AmountText, {
    paise: spent,
    size: "md",
    forceColor: "var(--text-primary)",
    rounded: true
  }), /*#__PURE__*/React.createElement("div", {
    style: cap
  }, "of ", fmt(allocated)))), /*#__PURE__*/React.createElement(BudgetBar, {
    pct: util,
    health: util > 100 ? 'red' : util >= 85 ? 'amber' : 'green',
    height: 8
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    label: `${over.length} over`,
    icon: "alert-triangle",
    tone: "expense"
  }), /*#__PURE__*/React.createElement(Badge, {
    label: `${near.length} near limit`,
    icon: "clock",
    tone: "amber"
  }), /*#__PURE__*/React.createElement(Badge, {
    label: `${onTrack} on track`,
    icon: "check",
    tone: "income"
  }))), attention.length > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: lbl
  }, "Needs attention"), /*#__PURE__*/React.createElement(Card, {
    padded: false,
    style: {
      padding: '4px 16px',
      marginBottom: 16
    }
  }, attention.map((l, i) => /*#__PURE__*/React.createElement("div", {
    key: l.name,
    style: {
      padding: '14px 0',
      borderBottom: i < attention.length - 1 ? '1px solid var(--border)' : 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement(IconCircle, {
    name: l.icon,
    color: l.color,
    size: 32,
    iconSize: 16
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--body-size)',
      color: 'var(--text-primary)'
    }
  }, l.name), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
      color: l.health === 'red' ? 'var(--expense)' : 'var(--health-amber)'
    }
  }, l.pct, "%")), /*#__PURE__*/React.createElement(BudgetBar, {
    pct: l.pct,
    health: l.health,
    height: 5
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: cap
  }, fmt(l.spent), " of ", fmt(l.allocated)), /*#__PURE__*/React.createElement("span", {
    style: {
      ...cap,
      color: l.remaining < 0 ? 'var(--expense)' : 'var(--income)'
    }
  }, l.remaining < 0 ? `${fmt(-l.remaining)} over` : `${fmt(l.remaining)} left`)))))), /*#__PURE__*/React.createElement(Card, {
    style: {
      marginBottom: 16,
      display: 'flex',
      alignItems: 'center',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 46,
      height: 46,
      borderRadius: 14,
      background: projOver > 0 ? 'var(--coral-muted)' : 'color-mix(in srgb, var(--income) 14%, transparent)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "trending-up",
    size: 20,
    color: projOver > 0 ? 'var(--expense)' : 'var(--income)'
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
  }, "Projected month-end ", fmt(proj.projected)), /*#__PURE__*/React.createElement("div", {
    style: cap
  }, "Day ", proj.dayOfMonth, " of ", proj.daysInMonth, " \xB7 ", projOver > 0 ? `${fmt(projOver)} over budget at this pace` : 'under budget at this pace'))), /*#__PURE__*/React.createElement("div", {
    style: lbl
  }, "Recommendations"), /*#__PURE__*/React.createElement(Card, {
    padded: false,
    style: {
      padding: '4px 16px',
      marginBottom: 16
    }
  }, recs.map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      gap: 12,
      alignItems: 'flex-start',
      padding: '14px 0',
      borderBottom: i < recs.length - 1 ? '1px solid var(--border)' : 'none'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 30,
      height: 30,
      borderRadius: '50%',
      background: `color-mix(in srgb, ${r.tint} 14%, transparent)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      marginTop: 1
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: r.icon,
    size: 15,
    color: r.tint
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--body-size)',
      color: 'var(--text-secondary)',
      lineHeight: 1.45
    }
  }, r.text)))), /*#__PURE__*/React.createElement("div", {
    style: lbl
  }, "All categories"), /*#__PURE__*/React.createElement(Card, {
    padded: false,
    style: {
      padding: '4px 16px'
    }
  }, lines.map((l, i) => /*#__PURE__*/React.createElement("div", {
    key: l.name,
    style: {
      padding: '13px 0',
      borderBottom: i < lines.length - 1 ? '1px solid var(--border)' : 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 7
    }
  }, /*#__PURE__*/React.createElement(IconCircle, {
    name: l.icon,
    color: l.color,
    size: 28,
    iconSize: 14
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--body-size)',
      color: 'var(--text-primary)'
    }
  }, l.name), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      color: 'var(--text-secondary)'
    }
  }, fmt(l.spent), " / ", fmt(l.allocated))), /*#__PURE__*/React.createElement(BudgetBar, {
    pct: l.pct,
    health: l.health,
    height: 4
  })))));
}
window.BS_BudgetInsights = BudgetInsights;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/budgetsplit/BudgetInsights.jsx", error: String((e && e.message) || e) }); }

// ui_kits/budgetsplit/CategoryDetail.jsx
try { (() => {
/* Category detail — drill-in from the donut wedge. Shows the category's spend,
   its budget health, and the transactions behind it. */
function CategoryDetail({
  category,
  onBack
}) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const {
    Card,
    Divider,
    TransactionRow,
    BudgetBar,
    Icon,
    AmountText,
    EmptyState
  } = DS;
  const fmt = window.BS_formatRupeesShort;
  const D = window.BS_DATA;
  const [store] = window.useBS();
  const c = category;
  const totalSpend = D.byCategory.reduce((s, x) => s + x.paise, 0);
  const share = Math.round(c.paise / totalSpend * 100);
  const line = D.budgetLines.find(l => l.name === c.name);
  const pct = line && line.allocated ? Math.round(line.spent / line.allocated * 100) : null;
  const health = pct === null ? 'green' : pct > 100 ? 'red' : pct >= 85 ? 'amber' : 'green';
  let txns = store.txns.filter(t => t.category === c.name);
  if (txns.length === 0) txns = [{
    id: 'syn',
    category: c.name,
    note: 'This month',
    icon: c.icon,
    color: c.color,
    paise: -c.paise,
    kind: 'expense',
    when: 'This month'
  }];
  const count = txns.length;
  const avg = Math.round(c.paise / count);
  const cap = {
    fontFamily: 'var(--font-ui)',
    fontSize: 'var(--caption-size)',
    color: 'var(--text-muted)'
  };
  const lbl = {
    fontFamily: 'var(--font-ui)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--text-secondary)',
    margin: '0 2px 10px'
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
  }, c.name)), /*#__PURE__*/React.createElement(Card, {
    style: {
      boxShadow: 'var(--shadow-md)',
      marginBottom: 16,
      padding: 22
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      marginBottom: line ? 16 : 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 52,
      height: 52,
      borderRadius: 16,
      background: `color-mix(in srgb, ${c.color} 14%, transparent)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: c.icon,
    size: 24,
    color: c.color
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 30,
      letterSpacing: '-0.6px',
      color: 'var(--text-primary)'
    }
  }, fmt(c.paise)), /*#__PURE__*/React.createElement("div", {
    style: cap
  }, share, "% of spending \xB7 ", count, " txn", count !== 1 ? 's' : '', " \xB7 avg ", fmt(avg)))), line && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(BudgetBar, {
    pct: pct,
    health: health,
    height: 6
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginTop: 7
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: cap
  }, fmt(line.spent), " of ", fmt(line.allocated), " budget"), /*#__PURE__*/React.createElement("span", {
    style: {
      ...cap,
      color: line.allocated - line.spent < 0 ? 'var(--expense)' : 'var(--income)'
    }
  }, line.allocated - line.spent < 0 ? `${fmt(line.spent - line.allocated)} over` : `${fmt(line.allocated - line.spent)} left`)))), /*#__PURE__*/React.createElement("div", {
    style: lbl
  }, "Transactions"), /*#__PURE__*/React.createElement(Card, {
    padded: false,
    style: {
      padding: '4px 16px'
    }
  }, txns.map((t, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: t.id || i
  }, i > 0 && /*#__PURE__*/React.createElement(Divider, {
    inset: 56
  }), /*#__PURE__*/React.createElement(TransactionRow, {
    category: t.note || t.category,
    note: t.when,
    icon: t.icon || c.icon,
    color: t.color || c.color,
    paise: t.paise,
    kind: t.kind
  })))));
}
window.BS_CategoryDetail = CategoryDetail;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/budgetsplit/CategoryDetail.jsx", error: String((e && e.message) || e) }); }

// ui_kits/budgetsplit/CategoryDonut.jsx
try { (() => {
/* Interactive category donut — the dashboard centerpiece.
   Tap a wedge: it pops out, the rest dim, and the center morphs to that
   category's readout. Tap the center "View" (or the wedge again) to drill in.
   Replaces the old dense 5-row legend with progressive disclosure. */
function CategoryDonut({
  data,
  total,
  onOpen
}) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const {
    Icon
  } = DS;
  const fmt = window.BS_formatRupeesShort;
  const [sel, setSel] = React.useState(null);
  const cx = 100,
    cy = 100,
    ro = 88,
    ri = 60,
    gap = 2.2;
  const TAU = Math.PI * 2;
  const pt = (r, deg) => {
    const a = (deg - 90) * Math.PI / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const wedge = (a0, a1, rin, rout) => {
    const large = a1 - a0 > 180 ? 1 : 0;
    const [x0, y0] = pt(rout, a0),
      [x1, y1] = pt(rout, a1);
    const [x2, y2] = pt(rin, a1),
      [x3, y3] = pt(rin, a0);
    return `M${x0} ${y0} A${rout} ${rout} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${rin} ${rin} 0 ${large} 0 ${x3} ${y3} Z`;
  };
  let acc = 0;
  const segs = data.map(c => {
    const frac = c.paise / total;
    const a0 = acc * 360 + gap / 2;
    const a1 = (acc + frac) * 360 - gap / 2;
    acc += frac;
    const mid = (a0 + a1) / 2;
    return {
      ...c,
      frac,
      a0,
      a1,
      mid,
      pct: Math.round(frac * 100)
    };
  });
  const selected = sel !== null ? segs[sel] : null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: 220,
      height: 220
    }
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "-10 -10 220 220",
    width: "220",
    height: "220"
  }, segs.map((s, i) => {
    const on = sel === i;
    const dim = sel !== null && !on;
    const pop = on ? 7 : 0;
    const a = (s.mid - 90) * Math.PI / 180;
    const dx = Math.cos(a) * pop,
      dy = Math.sin(a) * pop;
    return /*#__PURE__*/React.createElement("path", {
      key: s.name,
      d: wedge(s.a0, s.a1, ri, on ? ro + 4 : ro),
      fill: s.color,
      onClick: () => on ? onOpen && onOpen(s) : setSel(i),
      style: {
        cursor: 'pointer',
        opacity: dim ? 0.32 : 1,
        transform: `translate(${dx}px, ${dy}px)`,
        transition: 'opacity 220ms ease, transform 260ms cubic-bezier(0.34,1.56,0.64,1)'
      }
    });
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
      textAlign: 'center',
      padding: 40
    }
  }, selected ? /*#__PURE__*/React.createElement("div", {
    key: selected.name,
    style: {
      animation: 'bsFade 220ms ease',
      pointerEvents: 'auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      justifyContent: 'center',
      marginBottom: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: 4,
      background: selected.color
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 12,
      color: 'var(--text-secondary)',
      maxWidth: 110,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, selected.name)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 24,
      letterSpacing: '-0.5px',
      color: 'var(--text-primary)'
    }
  }, fmt(selected.paise)), /*#__PURE__*/React.createElement("button", {
    onClick: () => onOpen && onOpen(selected),
    style: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: 'var(--accent)',
      fontFamily: 'var(--font-ui)',
      fontSize: 11,
      fontWeight: 600,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 2,
      marginTop: 4
    }
  }, selected.pct, "% \xB7 View ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 12,
    color: "var(--accent)"
  }))) : /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 11,
      color: 'var(--text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.5px'
    }
  }, "Spent"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 26,
      letterSpacing: '-0.5px',
      color: 'var(--text-primary)'
    }
  }, fmt(total)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 10,
      color: 'var(--text-muted)',
      marginTop: 2
    }
  }, "tap a slice")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6,
      justifyContent: 'center',
      marginTop: 14
    }
  }, segs.map((s, i) => {
    const on = sel === i;
    return /*#__PURE__*/React.createElement("button", {
      key: s.name,
      onClick: () => setSel(on ? null : i),
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        border: 'none',
        cursor: 'pointer',
        borderRadius: 'var(--radius-pill)',
        padding: '5px 10px',
        background: on ? 'var(--bg-muted)' : 'transparent',
        transition: 'background 160ms ease'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 8,
        height: 8,
        borderRadius: 4,
        background: s.color,
        flexShrink: 0
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-ui)',
        fontSize: 11,
        color: on ? 'var(--text-primary)' : 'var(--text-secondary)'
      }
    }, s.name));
  })));
}
window.BS_CategoryDonut = CategoryDonut;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/budgetsplit/CategoryDonut.jsx", error: String((e && e.message) || e) }); }

// ui_kits/budgetsplit/Dashboard.jsx
try { (() => {
/* Dashboard (Home) — decluttered, progressive-disclosure layout:
   one spending hero → interactive donut centerpiece (drill into a category) →
   compact Budget + Balances tiles → recent → groups. */
function Dashboard({
  onOpenGroup,
  onSettle,
  onOpenBudget,
  onOpenCategory
}) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const {
    AmountText,
    Card,
    Divider,
    TransactionRow,
    BudgetBar,
    Icon
  } = DS;
  const formatRupees = window.BS_formatRupees,
    fmt = window.BS_formatRupeesShort;
  const D = window.BS_DATA;
  const [store] = window.useBS();
  const CategoryDonut = window.BS_CategoryDonut;

  // live spending
  const extra = store.txns.filter(t => String(t.id).startsWith('t-') && t.kind === 'expense').reduce((s, t) => s + Math.abs(t.paise), 0);
  const spending = D.month.spending + extra;
  const net = D.month.income - spending;
  const savings = Math.round(net / D.month.income * 100);
  const deltaPct = Math.round((spending - D.month.prevSpending) / D.month.prevSpending * 100);
  const youOwe = store.balances.filter(b => b.net < 0).reduce((s, b) => s + -b.net, 0);
  const oweCount = store.balances.filter(b => b.net < 0).length;
  const catTotal = D.byCategory.reduce((s, c) => s + c.paise, 0);
  const util = Math.round(D.budget.spent / D.budget.allocated * 100);
  const left = D.budget.allocated - D.budget.spent;
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
  const sect = {
    fontFamily: 'var(--font-ui)',
    fontSize: 'var(--subheading-size)',
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: 10
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
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      ...cap,
      marginBottom: 2
    }
  }, "Good evening"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--title-size)',
      fontWeight: 600,
      letterSpacing: '-0.4px',
      color: 'var(--text-primary)'
    }
  }, D.me.name.split(' ')[0])), /*#__PURE__*/React.createElement(DS.MemberAvatar, {
    name: D.me.name,
    color: D.me.color,
    size: 38
  })), /*#__PURE__*/React.createElement(Card, {
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
  }, "My spending \xB7 this month"), /*#__PURE__*/React.createElement(AmountText, {
    paise: spending,
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
    name: deltaPct >= 0 ? 'arrow-up-right' : 'arrow-down-right',
    size: 13,
    color: deltaPct >= 0 ? 'var(--expense)' : 'var(--income)'
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      ...label,
      color: deltaPct >= 0 ? 'var(--expense)' : 'var(--income)'
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
  })], ['Saved', /*#__PURE__*/React.createElement("span", {
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
    style: {
      marginBottom: 16,
      padding: '22px 16px 18px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...label,
      marginBottom: 4,
      textAlign: 'center'
    }
  }, "Where it went"), /*#__PURE__*/React.createElement(CategoryDonut, {
    data: D.byCategory,
    total: catTotal,
    onOpen: c => onOpenCategory && onOpenCategory(c)
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12,
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement(Card, {
    onClick: onOpenBudget,
    style: {
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: label
  }, "Budget"), /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 15,
    color: "var(--text-muted)"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 3
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 26,
      letterSpacing: '-0.5px',
      color: util > 100 ? 'var(--health-red)' : util >= 85 ? 'var(--health-amber)' : 'var(--income)'
    }
  }, util), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 14,
      color: 'var(--text-secondary)'
    }
  }, "%")), /*#__PURE__*/React.createElement(BudgetBar, {
    pct: util,
    health: util > 100 ? 'red' : util >= 85 ? 'amber' : 'green',
    height: 5
  }), /*#__PURE__*/React.createElement("span", {
    style: cap
  }, fmt(left), " left")), /*#__PURE__*/React.createElement(Card, {
    onClick: onSettle,
    style: {
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: label
  }, "Balances"), /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 15,
    color: "var(--text-muted)"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--caption-size)',
      color: 'var(--text-muted)'
    }
  }, "You owe"), /*#__PURE__*/React.createElement(AmountText, {
    paise: youOwe,
    size: "md",
    forceColor: "var(--expense)",
    rounded: true
  }), /*#__PURE__*/React.createElement("span", {
    style: cap
  }, oweCount, " ", oweCount === 1 ? 'person' : 'people', " \xB7 tap to settle"))), /*#__PURE__*/React.createElement("div", {
    style: sect
  }, "Recent"), /*#__PURE__*/React.createElement(Card, {
    padded: false,
    style: {
      padding: '4px 16px',
      marginBottom: 24
    }
  }, store.txns.slice(0, 3).map((t, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: t.id
  }, i > 0 && /*#__PURE__*/React.createElement(Divider, {
    inset: 56
  }), /*#__PURE__*/React.createElement(TransactionRow, {
    category: t.category,
    note: t.note,
    icon: t.icon,
    color: t.color,
    paise: t.paise,
    kind: t.kind
  })))), /*#__PURE__*/React.createElement("div", {
    style: sect
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
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 38,
      height: 38,
      borderRadius: 12,
      background: `color-mix(in srgb, ${g.color} 13%, transparent)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: g.icon,
    size: 17,
    color: g.color
  })), /*#__PURE__*/React.createElement("div", {
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

// ui_kits/budgetsplit/ExpenseFlow.jsx
try { (() => {
/* Complete "Add expense" flow — the core daily action, built for speed:
   live amount (Space Mono) → pick a category → optional note → Add.
   On save the transaction is pushed to the store and shows a success tick. */
function ExpenseFlow({
  onClose,
  onSaved,
  kind = 'expense'
}) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const {
    Button,
    Icon,
    IconCircle,
    BudgetBar,
    Card
  } = DS;
  const Keypad = window.BS_Keypad;
  const fmt = window.BS_formatRupeesShort;
  const D = window.BS_DATA;
  const income = kind === 'income';
  const cats = income ? window.BS_INCOME_CATS : window.BS_CATS;
  const [entry, setEntry] = React.useState('');
  const [cat, setCat] = React.useState(null);
  const [note, setNote] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const paise = window.BS_entryToPaise(entry);
  const ready = paise > 0 && cat !== null;

  // live budget impact — connects data entry to the analytics layer
  const selCat = cat !== null ? cats[cat] : null;
  const budgetLine = !income && selCat ? D.budgetLines.find(l => l.name === selCat.name) : null;
  let impact = null;
  if (budgetLine && budgetLine.allocated > 0) {
    const curPct = Math.round(budgetLine.spent / budgetLine.allocated * 100);
    const newSpent = budgetLine.spent + (paise > 0 ? paise : 0);
    const newPct = Math.round(newSpent / budgetLine.allocated * 100);
    const health = newPct > 100 ? 'red' : newPct >= 85 ? 'amber' : 'green';
    impact = {
      curPct,
      newPct,
      health,
      allocated: budgetLine.allocated,
      newSpent
    };
  }
  function add() {
    if (!ready || saving) return;
    setSaving(true);
    const c = cats[cat];
    window.BS_STORE.addTxn({
      category: c.name,
      note: note || null,
      icon: income ? 'trending-up' : c.icon,
      color: income ? '#2BD49B' : c.color,
      paise: income ? paise : -paise,
      kind
    });
    onSaved && onSaved();
  }
  return /*#__PURE__*/React.createElement(window.BS_FlowShell, {
    title: income ? 'Add income' : 'Add expense',
    onClose: onClose,
    closeIcon: "x",
    footer: /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }
    }, /*#__PURE__*/React.createElement(Keypad, {
      onKey: k => setEntry(s => window.BS_keyReduce(s, k))
    }), /*#__PURE__*/React.createElement(Button, {
      label: ready ? `Add ₹${window.BS_fmtEntry(entry)}` : income ? 'Add income' : 'Add expense',
      variant: "primary",
      fullWidth: true,
      disabled: !ready,
      onClick: add
    }))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      padding: '10px 0 18px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 44,
      letterSpacing: '-1px',
      color: paise > 0 ? income ? 'var(--income)' : 'var(--text-primary)' : 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 28,
      verticalAlign: '6px',
      marginRight: 2
    }
  }, income ? '+₹' : '₹'), window.BS_fmtEntry(entry)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--caption-size)',
      color: 'var(--text-muted)',
      marginTop: 4
    }
  }, cat !== null ? cats[cat].name : 'Enter amount, pick a category')), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      color: 'var(--text-secondary)',
      margin: '0 2px 10px'
    }
  }, "Category"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 8,
      marginBottom: 18
    }
  }, cats.map((c, i) => {
    const on = cat === i;
    return /*#__PURE__*/React.createElement("button", {
      key: c.name,
      onClick: () => setCat(i),
      style: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        padding: '4px 0'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 46,
        height: 46,
        borderRadius: '50%',
        background: on ? c.color : `color-mix(in srgb, ${c.color} 13%, transparent)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 140ms ease, transform 140ms ease',
        transform: on ? 'scale(1.06)' : 'scale(1)',
        boxShadow: on ? '0 0 0 2px var(--bg), 0 0 0 4px ' + c.color : 'none'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: c.icon,
      size: 19,
      color: on ? '#0A0F11' : c.color
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-ui)',
        fontSize: 10,
        color: on ? 'var(--text-primary)' : 'var(--text-secondary)',
        textAlign: 'center',
        lineHeight: 1.2
      }
    }, c.name));
  })), impact && /*#__PURE__*/React.createElement(Card, {
    style: {
      marginBottom: 18,
      padding: 14,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      animation: 'bsFade 220ms ease'
    }
  }, /*#__PURE__*/React.createElement(IconCircle, {
    name: selCat.icon,
    color: selCat.color,
    size: 34,
    iconSize: 16
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--caption-size)',
      color: 'var(--text-muted)',
      marginBottom: 6
    }
  }, selCat.name, " budget \xB7 ", fmt(impact.newSpent), " of ", fmt(impact.allocated)), /*#__PURE__*/React.createElement(BudgetBar, {
    pct: impact.newPct,
    health: impact.health,
    height: 5
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 3,
      fontFamily: 'var(--font-mono)',
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-muted)'
    }
  }, impact.curPct, "%"), /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-right",
    size: 11,
    color: "var(--text-muted)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: impact.health === 'red' ? 'var(--expense)' : impact.health === 'amber' ? 'var(--health-amber)' : 'var(--income)'
    }
  }, impact.newPct, "%"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      background: 'var(--bg-input)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      padding: '0 14px',
      height: 48
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "edit-2",
    size: 16,
    color: "var(--text-muted)"
  }), /*#__PURE__*/React.createElement("input", {
    value: note,
    onChange: e => setNote(e.target.value),
    placeholder: "Add a note (optional)",
    style: {
      flex: 1,
      background: 'transparent',
      border: 'none',
      outline: 'none',
      color: 'var(--text-primary)',
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--body-size)'
    }
  })));
}
window.BS_ExpenseFlow = ExpenseFlow;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/budgetsplit/ExpenseFlow.jsx", error: String((e && e.message) || e) }); }

// ui_kits/budgetsplit/FlowKit.jsx
try { (() => {
/* Shared building blocks for the add/settle flows:
   FlowShell — full-screen slide-up surface with a header.
   Keypad    — fast custom numeric pad (no OS keyboard; feels native).
   SuccessOverlay — springy checkmark confirmation. */

function FlowShell({
  title,
  onClose,
  closeIcon = 'chevron-left',
  right,
  children,
  footer
}) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const {
    Icon
  } = DS;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 150,
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      animation: 'bsSlideUp 300ms cubic-bezier(0.22,1,0.36,1)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      paddingTop: 56,
      paddingLeft: 12,
      paddingRight: 16,
      paddingBottom: 8,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: 8,
      display: 'flex',
      color: 'var(--text-secondary)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: closeIcon,
    size: 24,
    color: "var(--text-secondary)"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--heading-size)',
      fontWeight: 600,
      color: 'var(--text-primary)',
      flex: 1
    }
  }, title), right), /*#__PURE__*/React.createElement("div", {
    className: "bs-scroll",
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: '4px 16px 16px'
    }
  }, children), footer ? /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      padding: '12px 16px calc(16px + env(safe-area-inset-bottom))',
      borderTop: '1px solid var(--border)',
      background: 'var(--bg)'
    }
  }, footer) : null);
}
window.BS_FlowShell = FlowShell;
function Keypad({
  onKey
}) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const {
    Icon
  } = DS;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 6
    }
  }, keys.map(k => /*#__PURE__*/React.createElement("button", {
    key: k,
    onClick: () => onKey(k),
    style: {
      height: 56,
      border: 'none',
      borderRadius: 'var(--radius-md)',
      cursor: 'pointer',
      background: 'transparent',
      color: 'var(--text-primary)',
      fontFamily: 'var(--font-mono)',
      fontSize: 24,
      fontWeight: 400,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'background 120ms ease, transform 80ms ease'
    },
    onMouseDown: e => {
      e.currentTarget.style.background = 'var(--bg-muted)';
      e.currentTarget.style.transform = 'scale(0.96)';
    },
    onMouseUp: e => {
      e.currentTarget.style.background = 'transparent';
      e.currentTarget.style.transform = 'scale(1)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.background = 'transparent';
      e.currentTarget.style.transform = 'scale(1)';
    }
  }, k === 'del' ? /*#__PURE__*/React.createElement(Icon, {
    name: "delete",
    size: 22,
    color: "var(--text-secondary)"
  }) : k)));
}
window.BS_Keypad = Keypad;
function SuccessOverlay({
  show,
  label = 'Saved'
}) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const {
    Icon
  } = DS;
  if (!show) return null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 300,
      background: 'color-mix(in srgb, var(--bg) 92%, transparent)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 92,
      height: 92,
      borderRadius: '50%',
      background: 'color-mix(in srgb, var(--income) 16%, transparent)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      animation: 'bsPop 420ms cubic-bezier(0.34,1.56,0.64,1)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 64,
      height: 64,
      borderRadius: '50%',
      background: 'var(--income)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 32,
    color: "#072018",
    strokeWidth: 3
  }))), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--subheading-size)',
      fontWeight: 600,
      color: 'var(--text-primary)',
      animation: 'bsFade 500ms ease'
    }
  }, label));
}
window.BS_SuccessOverlay = SuccessOverlay;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/budgetsplit/FlowKit.jsx", error: String((e && e.message) || e) }); }

// ui_kits/budgetsplit/GroupDetail.jsx
try { (() => {
/* Group detail — members, balance, group budget analytics, and the ledger.
   Pushed when you tap a group. The Budget block is group-scoped Insights:
   utilization, who-paid-what (contribution vs fair share), overspend drivers,
   and the group's rollover rule. Mirrors the personal Budget & Insights screen. */
function GroupDetail({
  group,
  onBack,
  onSettle
}) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const {
    Card,
    Divider,
    TransactionRow,
    MemberAvatar,
    Button,
    Icon,
    IconCircle,
    Badge,
    BudgetBar,
    AmountText
  } = DS;
  const fmt = window.BS_formatRupeesShort;
  const D = window.BS_DATA;
  const [store] = window.useBS();
  const g = group || D.groups[0];
  const gb = D.groupBudget[g.id]; // undefined for Personal — handled below

  // group live transactions into date sections
  const sections = [];
  store.txns.forEach(t => {
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
  const lbl = {
    fontFamily: 'var(--font-ui)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--text-secondary)',
    margin: '0 2px 10px'
  };
  const cap2 = {
    fontFamily: 'var(--font-ui)',
    fontSize: 'var(--caption-size)',
    color: 'var(--text-muted)'
  };

  // ---- group budget derivations ----
  let budgetBlock = null;
  if (gb) {
    const lines = gb.lines.map(l => {
      const pct = l.allocated > 0 ? Math.round(l.spent / l.allocated * 100) : 0;
      const health = pct > 100 ? 'red' : pct >= 85 ? 'amber' : 'green';
      return {
        ...l,
        pct,
        health,
        remaining: l.allocated - l.spent
      };
    });
    const util = Math.round(gb.spent / gb.allocated * 100);
    const over = lines.filter(l => l.pct > 100).sort((a, b) => b.pct - a.pct);
    const near = lines.filter(l => l.pct >= 85 && l.pct <= 100);
    const onTrack = lines.filter(l => l.pct < 85).length;
    const utilColor = util > 100 ? 'var(--health-red)' : util >= 85 ? 'var(--health-amber)' : 'var(--income)';
    const maxPaid = Math.max(...gb.members.map(m => m.paid));
    const fairShare = gb.spent / gb.members.length;
    budgetBlock = /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      style: lbl
    }, "Group budget"), /*#__PURE__*/React.createElement(Card, {
      style: {
        boxShadow: 'var(--shadow-md)',
        marginBottom: 16,
        padding: 22
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        marginBottom: 14
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        ...cap2,
        marginBottom: 4
      }
    }, "Spent of ", fmt(gb.allocated)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'baseline',
        gap: 4
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 40,
        letterSpacing: '-1px',
        color: utilColor
      }
    }, util), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 20,
        color: utilColor
      }
    }, "%"))), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'right'
      }
    }, /*#__PURE__*/React.createElement(AmountText, {
      paise: gb.spent,
      size: "md",
      forceColor: "var(--text-primary)",
      rounded: true
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        ...cap2,
        color: gb.allocated - gb.spent < 0 ? 'var(--expense)' : 'var(--income)'
      }
    }, gb.allocated - gb.spent < 0 ? `${fmt(gb.spent - gb.allocated)} over` : `${fmt(gb.allocated - gb.spent)} left`))), /*#__PURE__*/React.createElement(BudgetBar, {
      pct: util,
      health: util > 100 ? 'red' : util >= 85 ? 'amber' : 'green',
      height: 8
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 8,
        marginTop: 14,
        flexWrap: 'wrap'
      }
    }, over.length > 0 && /*#__PURE__*/React.createElement(Badge, {
      label: `${over.length} over`,
      icon: "alert-triangle",
      tone: "expense"
    }), near.length > 0 && /*#__PURE__*/React.createElement(Badge, {
      label: `${near.length} near limit`,
      icon: "clock",
      tone: "amber"
    }), /*#__PURE__*/React.createElement(Badge, {
      label: `${onTrack} on track`,
      icon: "check",
      tone: "income"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        marginTop: 14,
        paddingTop: 14,
        borderTop: '1px solid var(--border)'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "refresh-cw",
      size: 13,
      color: "var(--text-muted)"
    }), /*#__PURE__*/React.createElement("span", {
      style: cap2
    }, gb.rollover))), /*#__PURE__*/React.createElement("div", {
      style: lbl
    }, "Who paid what"), /*#__PURE__*/React.createElement(Card, {
      padded: false,
      style: {
        padding: '4px 16px',
        marginBottom: 16
      }
    }, gb.members.map((m, i) => {
      const netNum = m.paid - m.share;
      const ahead = netNum >= 0;
      return /*#__PURE__*/React.createElement("div", {
        key: m.name,
        style: {
          padding: '13px 0',
          borderBottom: i < gb.members.length - 1 ? '1px solid var(--border)' : 'none'
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 7
        }
      }, /*#__PURE__*/React.createElement(MemberAvatar, {
        name: m.name,
        color: m.color,
        size: 28
      }), /*#__PURE__*/React.createElement("span", {
        style: {
          flex: 1,
          fontFamily: 'var(--font-ui)',
          fontSize: 'var(--body-size)',
          color: 'var(--text-primary)'
        }
      }, m.name.split(' ')[0], m.name === D.me.name ? ' (you)' : ''), /*#__PURE__*/React.createElement("span", {
        style: {
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          color: 'var(--text-primary)'
        }
      }, fmt(m.paid)), /*#__PURE__*/React.createElement("span", {
        style: {
          fontFamily: 'var(--font-ui)',
          fontSize: 11,
          fontWeight: 600,
          minWidth: 64,
          textAlign: 'right',
          color: ahead ? 'var(--income)' : 'var(--expense)'
        }
      }, ahead ? '+' : '−', fmt(Math.abs(netNum)))), /*#__PURE__*/React.createElement("div", {
        style: {
          height: 5,
          background: 'var(--bg-muted)',
          borderRadius: 999,
          overflow: 'hidden',
          marginLeft: 38
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          width: `${m.paid / maxPaid * 100}%`,
          height: '100%',
          background: m.color,
          borderRadius: 999
        }
      })));
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        padding: '12px 0'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "info",
      size: 13,
      color: "var(--text-muted)"
    }), /*#__PURE__*/React.createElement("span", {
      style: cap2
    }, "Fair share is ", fmt(fairShare), " each \xB7 ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--income)'
      }
    }, "+ ahead"), ", ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--expense)'
      }
    }, "\u2212 owes the group")))), over.length > 0 ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      style: lbl
    }, "Driving overspend"), /*#__PURE__*/React.createElement(Card, {
      padded: false,
      style: {
        padding: '4px 16px',
        marginBottom: 16
      }
    }, over.map((l, i) => /*#__PURE__*/React.createElement("div", {
      key: l.name,
      style: {
        padding: '14px 0',
        borderBottom: i < over.length - 1 ? '1px solid var(--border)' : 'none'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement(IconCircle, {
      name: l.icon,
      color: l.color,
      size: 32,
      iconSize: 16
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--body-size)',
        color: 'var(--text-primary)'
      }
    }, l.name), /*#__PURE__*/React.createElement("div", {
      style: {
        ...cap2,
        marginTop: 1
      }
    }, fmt(l.spent - l.allocated), " over the ", fmt(l.allocated), " budget")), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 13,
        color: 'var(--expense)'
      }
    }, l.pct, "%")), /*#__PURE__*/React.createElement(BudgetBar, {
      pct: l.pct,
      health: l.health,
      height: 5
    }))))) : /*#__PURE__*/React.createElement(Card, {
      style: {
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 12
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 38,
        height: 38,
        borderRadius: 12,
        background: 'color-mix(in srgb, var(--income) 14%, transparent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "check-circle",
      size: 18,
      color: "var(--income)"
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--body-size)',
        color: 'var(--text-secondary)'
      }
    }, "Every category is within budget this period.")), /*#__PURE__*/React.createElement("div", {
      style: lbl
    }, "All categories"), /*#__PURE__*/React.createElement(Card, {
      padded: false,
      style: {
        padding: '4px 16px',
        marginBottom: 16
      }
    }, lines.map((l, i) => /*#__PURE__*/React.createElement("div", {
      key: l.name,
      style: {
        padding: '13px 0',
        borderBottom: i < lines.length - 1 ? '1px solid var(--border)' : 'none'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 7
      }
    }, /*#__PURE__*/React.createElement(IconCircle, {
      name: l.icon,
      color: l.color,
      size: 28,
      iconSize: 14
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--body-size)',
        color: 'var(--text-primary)'
      }
    }, l.name), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        color: 'var(--text-secondary)'
      }
    }, fmt(l.spent), " / ", fmt(l.allocated))), /*#__PURE__*/React.createElement(BudgetBar, {
      pct: l.pct,
      health: l.health,
      height: 4
    })))));
  }
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
    fullWidth: true,
    onClick: onSettle
  })))), budgetBlock, /*#__PURE__*/React.createElement("div", {
    style: lbl
  }, "Activity"), sections.map(s => /*#__PURE__*/React.createElement("div", {
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
    key: t.id || i
  }, i > 0 && /*#__PURE__*/React.createElement(Divider, {
    inset: 56
  }), /*#__PURE__*/React.createElement(TransactionRow, {
    category: t.category,
    note: t.note,
    icon: t.icon,
    color: t.color,
    paise: t.paise,
    kind: t.kind,
    onClick: () => {}
  })))))));
}
window.BS_GroupDetail = GroupDetail;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/budgetsplit/GroupDetail.jsx", error: String((e && e.message) || e) }); }

// ui_kits/budgetsplit/Groups.jsx
try { (() => {
/* Groups tab — leads with a balances hero (net position + who-owes-whom,
   tap a person to settle), then the list of budget groups with health bars.
   Mirrors the dashboard/reports "hero → progressive detail" pattern. */
function Groups({
  onOpenGroup,
  onSettle
}) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const {
    Card,
    BudgetBar,
    MemberAvatar,
    Icon,
    AmountText
  } = DS;
  const fmt = window.BS_formatRupeesShort;
  const D = window.BS_DATA;
  const [store] = window.useBS();
  const owe = store.balances.filter(b => b.net < 0);
  const owed = store.balances.filter(b => b.net > 0);
  const youOwe = owe.reduce((s, b) => s + -b.net, 0);
  const youAreOwed = owed.reduce((s, b) => s + b.net, 0);
  const net = youAreOwed - youOwe;
  const settled = store.balances.filter(b => b.net !== 0);
  // biggest balances first
  const people = [...settled].sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  const cap = {
    fontFamily: 'var(--font-ui)',
    fontSize: 'var(--caption-size)',
    color: 'var(--text-secondary)'
  };
  const lbl = {
    fontFamily: 'var(--font-ui)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--text-secondary)',
    margin: '20px 2px 10px'
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
  }, "Groups"), /*#__PURE__*/React.createElement(Card, {
    style: {
      boxShadow: 'var(--shadow-md)',
      marginBottom: 4,
      padding: 22
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...cap,
      color: 'var(--text-secondary)',
      marginBottom: 4
    }
  }, "Net balance \xB7 ", settled.length, " ", settled.length === 1 ? 'person' : 'people'), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 38,
      letterSpacing: '-1px',
      color: net < 0 ? 'var(--expense)' : 'var(--income)'
    }
  }, net < 0 ? '−' : '+', fmt(Math.abs(net))), /*#__PURE__*/React.createElement("span", {
    style: {
      ...cap,
      color: 'var(--text-muted)'
    }
  }, net < 0 ? 'you owe overall' : 'in your favour')), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      marginTop: 18,
      paddingTop: 16,
      borderTop: '1px solid var(--border)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 3
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: cap
  }, "You owe"), /*#__PURE__*/React.createElement(AmountText, {
    paise: youOwe,
    size: "md",
    forceColor: "var(--expense)",
    rounded: true
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 3,
      borderLeft: '1px solid var(--border)',
      paddingLeft: 16
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: cap
  }, "You're owed"), /*#__PURE__*/React.createElement(AmountText, {
    paise: youAreOwed,
    size: "md",
    forceColor: "var(--income)",
    rounded: true
  })))), /*#__PURE__*/React.createElement("div", {
    style: lbl
  }, "Settle up \xB7 tap a person"), /*#__PURE__*/React.createElement(Card, {
    padded: false,
    style: {
      padding: '4px 16px'
    }
  }, people.map((b, i) => {
    const youOweThem = b.net < 0;
    return /*#__PURE__*/React.createElement("div", {
      key: b.name,
      onClick: onSettle,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '13px 0',
        borderBottom: i < people.length - 1 ? '1px solid var(--border)' : 'none',
        cursor: 'pointer'
      }
    }, /*#__PURE__*/React.createElement(MemberAvatar, {
      name: b.name,
      color: b.color,
      size: 36
    }), /*#__PURE__*/React.createElement("div", {
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
    }, b.name), /*#__PURE__*/React.createElement("div", {
      style: {
        ...cap,
        color: 'var(--text-muted)'
      }
    }, youOweThem ? 'you owe' : 'owes you')), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 15,
        color: youOweThem ? 'var(--expense)' : 'var(--income)'
      }
    }, fmt(Math.abs(b.net))), /*#__PURE__*/React.createElement(Icon, {
      name: "chevron-right",
      size: 16,
      color: "var(--text-muted)"
    }));
  })), /*#__PURE__*/React.createElement("div", {
    style: lbl
  }, "Your groups"), /*#__PURE__*/React.createElement("div", {
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
  }, fmt(g.spent), " this month", !g.personal ? ` · ${g.members} members` : ''), /*#__PURE__*/React.createElement("div", {
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

// ui_kits/budgetsplit/ItemizedFlow.jsx
try { (() => {
/* Complete "Split a bill" flow — the differentiated, complex one, made legible:
   choose who's in → add line items → tap avatars to assign each item →
   see each person's share update live → save (others then owe you their share). */
function ItemizedFlow({
  onClose,
  onSaved
}) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const {
    Button,
    Icon,
    MemberAvatar,
    AmountText,
    Card
  } = DS;
  const [members, setMembers] = React.useState([{
    name: 'Aarav Mehta',
    color: '#319795',
    me: true,
    in: true
  }, {
    name: 'Priya Singh',
    color: '#B83280',
    in: true
  }, {
    name: 'Rohit Khanna',
    color: '#38A169',
    in: true
  }, {
    name: 'Neha Kapoor',
    color: '#3182CE',
    in: false
  }]);
  const inIdx = members.map((m, i) => m.in ? i : -1).filter(i => i >= 0);
  const [items, setItems] = React.useState([{
    id: 1,
    name: 'Pizzas',
    entry: '840',
    who: [0, 1, 2]
  }, {
    id: 2,
    name: 'Drinks',
    entry: '420',
    who: [1, 2]
  }]);
  const [saving, setSaving] = React.useState(false);
  const nextId = React.useRef(3);
  const P = window.BS_entryToPaise;
  const shares = members.map(() => 0);
  let total = 0;
  items.forEach(it => {
    const p = P(it.entry);
    total += p;
    const who = it.who.filter(i => members[i] && members[i].in);
    if (who.length) who.forEach(i => {
      shares[i] += p / who.length;
    });
  });
  function toggleMember(i) {
    setMembers(ms => ms.map((m, idx) => idx === i ? {
      ...m,
      in: !m.in
    } : m));
  }
  function toggleAssign(itemId, mi) {
    setItems(its => its.map(it => {
      if (it.id !== itemId) return it;
      const has = it.who.includes(mi);
      return {
        ...it,
        who: has ? it.who.filter(x => x !== mi) : [...it.who, mi]
      };
    }));
  }
  function addItem() {
    setItems(its => [...its, {
      id: nextId.current++,
      name: '',
      entry: '',
      who: [...inIdx]
    }]);
  }
  function setItem(id, patch) {
    setItems(its => its.map(it => it.id === id ? {
      ...it,
      ...patch
    } : it));
  }
  function removeItem(id) {
    setItems(its => its.filter(it => it.id !== id));
  }
  const ready = total > 0;
  function save() {
    if (!ready || saving) return;
    setSaving(true);
    const myShare = Math.round(shares[0]);
    window.BS_STORE.addTxn({
      category: 'Split bill',
      note: `Split ${inIdx.length} ways · you paid ₹${(total / 100).toLocaleString('en-IN')}`,
      icon: 'users',
      color: '#F472B6',
      paise: -myShare,
      kind: 'expense'
    });
    // others now owe you their share
    members.forEach((m, i) => {
      if (m.me || !m.in) return;
      const sh = Math.round(shares[i]);
      if (sh > 0) {
        const bal = window.BS_STORE.get().balances.find(b => b.name === m.name);
        if (bal) window.BS_STORE.recordSettle && null; // balances adjusted below
      }
    });
    // directly bump balances: they owe you more
    const st = window.BS_STORE.get();
    st.balances = st.balances.map(b => {
      const mi = members.findIndex(m => m.name === b.name && m.in && !m.me);
      if (mi < 0) return b;
      return {
        ...b,
        net: b.net + Math.round(shares[mi])
      };
    });
    onSaved && onSaved();
  }
  const lbl = {
    fontFamily: 'var(--font-ui)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--text-secondary)',
    margin: '0 2px 10px'
  };
  return /*#__PURE__*/React.createElement(window.BS_FlowShell, {
    title: "Split a bill",
    onClose: onClose,
    closeIcon: "x",
    footer: /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-ui)',
        fontSize: 11,
        color: 'var(--text-muted)'
      }
    }, "Bill total"), /*#__PURE__*/React.createElement(AmountText, {
      paise: total,
      size: "lg",
      forceColor: "var(--text-primary)"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        width: 150
      }
    }, /*#__PURE__*/React.createElement(Button, {
      label: "Save split",
      variant: "primary",
      fullWidth: true,
      disabled: !ready,
      onClick: save
    })))
  }, /*#__PURE__*/React.createElement("div", {
    style: lbl
  }, "Who's in"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      marginBottom: 20,
      flexWrap: 'wrap'
    }
  }, members.map((m, i) => /*#__PURE__*/React.createElement("button", {
    key: m.name,
    onClick: () => !m.me && toggleMember(i),
    style: {
      background: 'none',
      border: 'none',
      cursor: m.me ? 'default' : 'pointer',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 5,
      opacity: m.in ? 1 : 0.4,
      transition: 'opacity 140ms ease'
    }
  }, /*#__PURE__*/React.createElement(MemberAvatar, {
    name: m.name,
    color: m.color,
    size: 44,
    selected: m.in
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 10,
      color: 'var(--text-secondary)'
    }
  }, m.me ? 'You' : m.name.split(' ')[0])))), /*#__PURE__*/React.createElement("div", {
    style: lbl
  }, "Items \xB7 tap avatars to assign"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      marginBottom: 14
    }
  }, items.map(it => /*#__PURE__*/React.createElement(Card, {
    key: it.id,
    style: {
      padding: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: it.name,
    onChange: e => setItem(it.id, {
      name: e.target.value
    }),
    placeholder: "Item",
    style: {
      flex: 1,
      background: 'transparent',
      border: 'none',
      outline: 'none',
      color: 'var(--text-primary)',
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--body-size)',
      fontWeight: 600
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      color: 'var(--text-secondary)',
      fontSize: 16
    }
  }, "\u20B9"), /*#__PURE__*/React.createElement("input", {
    value: it.entry,
    onChange: e => setItem(it.id, {
      entry: e.target.value.replace(/[^0-9.]/g, '')
    }),
    inputMode: "decimal",
    placeholder: "0",
    style: {
      width: 72,
      background: 'var(--bg-input)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      outline: 'none',
      color: 'var(--text-primary)',
      fontFamily: 'var(--font-mono)',
      fontSize: 16,
      textAlign: 'right',
      padding: '6px 8px'
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => removeItem(it.id),
    style: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: 4,
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 16,
    color: "var(--text-muted)"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6
    }
  }, inIdx.map(mi => {
    const on = it.who.includes(mi);
    return /*#__PURE__*/React.createElement("button", {
      key: mi,
      onClick: () => toggleAssign(it.id, mi),
      style: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        opacity: on ? 1 : 0.28,
        transform: on ? 'scale(1)' : 'scale(0.9)',
        transition: 'opacity 140ms ease, transform 140ms ease'
      }
    }, /*#__PURE__*/React.createElement(MemberAvatar, {
      name: members[mi].name,
      color: members[mi].color,
      size: 30,
      selected: on
    }));
  }))))), /*#__PURE__*/React.createElement("button", {
    onClick: addItem,
    style: {
      width: '100%',
      background: 'transparent',
      border: '1px dashed var(--border)',
      borderRadius: 'var(--radius-md)',
      color: 'var(--accent)',
      cursor: 'pointer',
      padding: '12px',
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--body-size)',
      fontWeight: 600,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginBottom: 22
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 16,
    color: "var(--accent)"
  }), " Add item"), /*#__PURE__*/React.createElement("div", {
    style: lbl
  }, "Each person pays"), /*#__PURE__*/React.createElement(Card, {
    padded: false,
    style: {
      padding: '4px 16px'
    }
  }, members.filter(m => m.in).map((m, idx, arr) => {
    const mi = members.indexOf(m);
    return /*#__PURE__*/React.createElement("div", {
      key: m.name,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 0',
        borderBottom: idx < arr.length - 1 ? '1px solid var(--border)' : 'none'
      }
    }, /*#__PURE__*/React.createElement(MemberAvatar, {
      name: m.name,
      color: m.color,
      size: 34
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--body-size)',
        color: 'var(--text-primary)'
      }
    }, m.me ? 'You' : m.name), /*#__PURE__*/React.createElement(AmountText, {
      paise: Math.round(shares[mi]),
      size: "sm",
      forceColor: m.me ? 'var(--accent)' : 'var(--text-primary)'
    }));
  })));
}
window.BS_ItemizedFlow = ItemizedFlow;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/budgetsplit/ItemizedFlow.jsx", error: String((e && e.message) || e) }); }

// ui_kits/budgetsplit/Onboarding.jsx
try { (() => {
/* Onboarding hero — the welcome screen. Tapping "Get Started" enters the app. */
function Onboarding({
  onDone
}) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const {
    Button,
    IconCircle
  } = DS;
  const features = [{
    icon: 'pie-chart',
    color: '#20C4B8',
    title: 'See where it goes',
    desc: 'A live picture of every rupee, by category'
  }, {
    icon: 'users',
    color: '#7C6AF7',
    title: 'Split bills fairly',
    desc: 'Itemise and assign \u2014 everyone pays their share'
  }, {
    icon: 'check-circle',
    color: '#3ECF8E',
    title: 'Settle in a tap',
    desc: 'Track who owes whom, clear it instantly'
  }];
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
      position: 'relative',
      width: 96,
      height: 96,
      borderRadius: 26,
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
      boxShadow: 'var(--shadow-lg)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: -1,
      borderRadius: 26,
      boxShadow: '0 0 44px 4px rgba(32,196,184,0.22)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-mark.png",
    alt: "",
    style: {
      width: 62,
      height: 62,
      position: 'relative'
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
  }, "Budget your money and split bills \u2014 all on your phone, nothing in the cloud."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 18,
      marginTop: 34,
      width: '100%',
      maxWidth: 320,
      textAlign: 'left'
    }
  }, features.map(f => /*#__PURE__*/React.createElement("div", {
    key: f.title,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(IconCircle, {
    name: f.icon,
    color: f.color,
    size: 42,
    iconSize: 19
  }), /*#__PURE__*/React.createElement("div", {
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
  }, f.title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--caption-size)',
      color: 'var(--text-secondary)',
      marginTop: 2,
      lineHeight: 1.4
    }
  }, f.desc)))))), /*#__PURE__*/React.createElement(Button, {
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
/* Reports tab — interactive, progressive-disclosure analytics.
   Tap a trend bar: it lifts, the rest dim, and a detail panel reveals that
   period's total, budget delta, and the categories behind it. A dashed budget
   overlay sits across the chart. Category list rows drill into CategoryDetail.
   Mirrors the dashboard donut's tap-to-reveal pattern. */
function Reports({
  onOpenCategory
}) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const {
    Card,
    TabPills,
    Badge,
    Icon,
    IconCircle
  } = DS;
  const fmt = window.BS_formatRupeesShort;
  const D = window.BS_DATA;
  const [range, setRange] = React.useState('month');
  const [sel, setSel] = React.useState(null);
  // reset selection when switching range
  React.useEffect(() => {
    setSel(null);
  }, [range]);
  const series = D.reports[range];
  const bars = series.bars;
  const budget = series.budget;
  const total = bars.reduce((s, b) => s + b.paise, 0);
  const periodBudget = budget * bars.length;
  const maxV = Math.max(...bars.map(b => b.paise), budget);
  const avg = Math.round(total / bars.length);
  const periodDelta = total - periodBudget;
  const selected = sel !== null ? bars[sel] : null;

  // map a trend top-category to the dashboard's byCategory entry so drill-in
  // lands on the full month context; fall back to the week's own figures.
  const resolveCat = t => D.byCategory.find(c => c.name === t.name) || {
    name: t.name,
    color: t.color,
    icon: t.icon,
    paise: t.paise
  };
  const lbl = {
    fontFamily: 'var(--font-ui)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--text-secondary)',
    margin: '0 2px 10px'
  };
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
  const CHART_H = 150;
  const budgetY = budget / maxV * CHART_H;
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
    value: range,
    onChange: setRange,
    style: {
      marginBottom: 16
    }
  }), /*#__PURE__*/React.createElement(Card, {
    style: {
      boxShadow: 'var(--shadow-md)',
      marginBottom: 16,
      padding: '20px 18px 18px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      ...label,
      marginBottom: 4
    }
  }, "Total spent \xB7 ", range === 'month' ? 'this month' : 'last 12 mo'), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 34,
      letterSpacing: '-0.8px',
      color: 'var(--text-primary)'
    }
  }, fmt(total))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right',
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontFamily: 'var(--font-ui)',
      fontSize: 12,
      fontWeight: 600,
      color: periodDelta > 0 ? 'var(--expense)' : 'var(--income)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: periodDelta > 0 ? 'arrow-up-right' : 'arrow-down-right',
    size: 13,
    color: periodDelta > 0 ? 'var(--expense)' : 'var(--income)'
  }), fmt(Math.abs(periodDelta))), /*#__PURE__*/React.createElement("div", {
    style: {
      ...cap,
      marginTop: 2
    }
  }, periodDelta > 0 ? 'over' : 'under', " budget"))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      height: CHART_H
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: budgetY,
      borderTop: '1.5px dashed var(--text-muted)',
      opacity: 0.55,
      zIndex: 2,
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      right: 0,
      top: -16,
      fontFamily: 'var(--font-ui)',
      fontSize: 9,
      letterSpacing: '0.3px',
      color: 'var(--text-muted)',
      background: 'var(--bg-card)',
      padding: '0 4px'
    }
  }, "BUDGET ", fmt(budget))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'flex-end',
      gap: range === 'year' ? 5 : 10
    }
  }, bars.map((b, i) => {
    const on = sel === i;
    const dim = sel !== null && !on;
    const over = b.paise > budget;
    const h = b.paise / maxV * CHART_H;
    const baseColor = over ? 'var(--health-amber)' : 'var(--accent)';
    return /*#__PURE__*/React.createElement("div", {
      key: b.label,
      onClick: () => setSel(on ? null : i),
      style: {
        flex: 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: 7,
        cursor: 'pointer'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: '100%',
        height: Math.max(h, 4),
        background: baseColor,
        borderRadius: 6,
        opacity: dim ? 0.3 : on ? 1 : 0.82,
        boxShadow: on ? `0 6px 16px color-mix(in srgb, ${over ? 'var(--health-amber)' : 'var(--accent)'} 45%, transparent)` : 'none',
        transition: 'opacity 200ms ease, box-shadow 200ms ease, height 400ms cubic-bezier(0.22,1,0.36,1)'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        ...cap,
        fontSize: range === 'year' ? 8 : 9,
        color: on ? 'var(--text-primary)' : 'var(--text-muted)',
        whiteSpace: 'nowrap'
      }
    }, b.label));
  })))), selected ? /*#__PURE__*/React.createElement(Card, {
    key: selected.label,
    style: {
      marginBottom: 16,
      animation: 'bsFade 240ms ease'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: cap
  }, range === 'month' ? 'Week of ' : '', selected.label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 24,
      letterSpacing: '-0.5px',
      color: 'var(--text-primary)',
      marginTop: 2
    }
  }, fmt(selected.paise))), /*#__PURE__*/React.createElement(Badge, {
    label: `${fmt(Math.abs(selected.paise - budget))} ${selected.paise > budget ? 'over' : 'under'}`,
    icon: selected.paise > budget ? 'alert-triangle' : 'check',
    tone: selected.paise > budget ? 'amber' : 'income'
  })), selected.top ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      ...cap,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginBottom: 8
    }
  }, "Top categories"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, selected.top.map(t => {
    const tShare = Math.round(t.paise / selected.paise * 100);
    return /*#__PURE__*/React.createElement("div", {
      key: t.name,
      onClick: () => onOpenCategory && onOpenCategory(resolveCat(t)),
      style: {
        cursor: 'pointer'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 6
      }
    }, /*#__PURE__*/React.createElement(IconCircle, {
      name: t.icon,
      color: t.color,
      size: 26,
      iconSize: 13
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--body-size)',
        color: 'var(--text-primary)'
      }
    }, t.name), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 13,
        color: 'var(--text-primary)'
      }
    }, fmt(t.paise)), /*#__PURE__*/React.createElement(Icon, {
      name: "chevron-right",
      size: 15,
      color: "var(--text-muted)"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 5,
        background: 'var(--bg-muted)',
        borderRadius: 999,
        overflow: 'hidden',
        marginLeft: 36
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: `${tShare}%`,
        height: '100%',
        background: t.color,
        borderRadius: 999
      }
    })));
  }))) : /*#__PURE__*/React.createElement("div", {
    style: {
      ...cap,
      lineHeight: 1.5
    }
  }, "Tap a month in the chart to compare against the ", fmt(budget), " monthly budget. Switch to ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--text-secondary)'
    }
  }, "Month"), " for a category breakdown.")) : /*#__PURE__*/React.createElement(Card, {
    style: {
      marginBottom: 16,
      display: 'flex'
    }
  }, [['Avg / ' + (range === 'month' ? 'week' : 'mo'), fmt(avg)], ['Budget', fmt(periodBudget)], [periodDelta > 0 ? 'Over' : 'Under', fmt(Math.abs(periodDelta))]].map(([t, v], i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      borderLeft: i ? '1px solid var(--border)' : 'none'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: cap
  }, t), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 16,
      color: t === 'Over' ? 'var(--expense)' : t === 'Under' ? 'var(--income)' : 'var(--text-primary)'
    }
  }, v)))), /*#__PURE__*/React.createElement("div", {
    style: lbl
  }, "By category \xB7 tap to explore"), /*#__PURE__*/React.createElement(Card, {
    padded: false,
    style: {
      padding: '4px 16px'
    }
  }, [...D.byCategory].sort((a, b) => b.paise - a.paise).map((c, i, arr) => {
    const totalCat = D.byCategory.reduce((s, x) => s + x.paise, 0);
    const share = Math.round(c.paise / totalCat * 100);
    return /*#__PURE__*/React.createElement("div", {
      key: c.name,
      onClick: () => onOpenCategory && onOpenCategory(c),
      style: {
        padding: '13px 0',
        borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
        cursor: 'pointer'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 7
      }
    }, /*#__PURE__*/React.createElement(IconCircle, {
      name: c.icon,
      color: c.color,
      size: 28,
      iconSize: 14
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
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
    }, fmt(c.paise)), /*#__PURE__*/React.createElement("span", {
      style: {
        ...cap,
        minWidth: 30,
        textAlign: 'right'
      }
    }, share, "%"), /*#__PURE__*/React.createElement(Icon, {
      name: "chevron-right",
      size: 15,
      color: "var(--text-muted)"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 5,
        background: 'var(--bg-muted)',
        borderRadius: 999,
        overflow: 'hidden',
        marginLeft: 40
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: `${share}%`,
        height: '100%',
        background: c.color,
        borderRadius: 999
      }
    })));
  })));
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

// ui_kits/budgetsplit/SettleFlow.jsx
try { (() => {
/* Complete "Settle up" flow:
   balances list → pick a person → amount autofills to what's outstanding
   (editable via keypad) → Record payment → balance reduces, settlement logged. */
function SettleFlow({
  onClose,
  onSaved
}) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const {
    Button,
    Icon,
    MemberAvatar,
    AmountText
  } = DS;
  const Keypad = window.BS_Keypad;
  const [state] = window.useBS();
  const [step, setStep] = React.useState('list'); // list | pay
  const [sel, setSel] = React.useState(null); // balance object
  const [entry, setEntry] = React.useState('');
  const youOwe = state.balances.filter(b => b.net < 0).reduce((s, b) => s + -b.net, 0);
  const owed = state.balances.filter(b => b.net > 0).reduce((s, b) => s + b.net, 0);
  function openPay(b) {
    setSel(b);
    setEntry((Math.abs(b.net) / 100).toString());
    setStep('pay');
  }
  function record() {
    const paise = window.BS_entryToPaise(entry);
    if (paise <= 0) return;
    window.BS_STORE.recordSettle(sel.name, paise);
    onSaved && onSaved();
  }
  const lbl = {
    fontFamily: 'var(--font-ui)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--text-secondary)',
    margin: '0 2px 10px'
  };
  if (step === 'pay') {
    const paise = window.BS_entryToPaise(entry);
    const owe = sel.net < 0;
    return /*#__PURE__*/React.createElement(window.BS_FlowShell, {
      title: "Record payment",
      onClose: () => setStep('list'),
      closeIcon: "chevron-left",
      footer: /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }
      }, /*#__PURE__*/React.createElement(Keypad, {
        onKey: k => setEntry(s => window.BS_keyReduce(s, k))
      }), /*#__PURE__*/React.createElement(Button, {
        label: "Record payment",
        variant: "primary",
        fullWidth: true,
        disabled: paise <= 0,
        onClick: record
      }))
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        padding: '14px 0 22px'
      }
    }, /*#__PURE__*/React.createElement(MemberAvatar, {
      name: sel.name,
      color: sel.color,
      size: 56
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--body-size)',
        color: 'var(--text-secondary)'
      }
    }, owe ? 'You pay' : 'You receive from', " ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-primary)',
        fontWeight: 600
      }
    }, sel.name.split(' ')[0])), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 44,
        letterSpacing: '-1px',
        color: 'var(--text-primary)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 28,
        verticalAlign: '6px',
        marginRight: 2
      }
    }, "\u20B9"), window.BS_fmtEntry(entry)), /*#__PURE__*/React.createElement("button", {
      onClick: () => setEntry((Math.abs(sel.net) / 100).toString()),
      style: {
        background: 'var(--bg-muted)',
        border: 'none',
        borderRadius: 'var(--radius-pill)',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        padding: '6px 14px',
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--caption-size)'
      }
    }, "Outstanding \u20B9", (Math.abs(sel.net) / 100).toLocaleString('en-IN'), " \xB7 tap to fill")));
  }
  return /*#__PURE__*/React.createElement(window.BS_FlowShell, {
    title: "Settle up",
    onClose: onClose,
    closeIcon: "x"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      marginBottom: 22
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      background: 'var(--coral-muted)',
      borderRadius: 'var(--radius-lg)',
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--caption-size)',
      color: 'var(--text-secondary)'
    }
  }, "You owe"), /*#__PURE__*/React.createElement(AmountText, {
    paise: youOwe,
    size: "lg",
    forceColor: "var(--expense)"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      background: 'color-mix(in srgb, var(--income) 12%, transparent)',
      borderRadius: 'var(--radius-lg)',
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--caption-size)',
      color: 'var(--text-secondary)'
    }
  }, "You're owed"), /*#__PURE__*/React.createElement(AmountText, {
    paise: owed,
    size: "lg",
    forceColor: "var(--income)"
  }))), /*#__PURE__*/React.createElement("div", {
    style: lbl
  }, "Balances"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, state.balances.map(b => {
    const settled = b.net === 0;
    const owe = b.net < 0;
    return /*#__PURE__*/React.createElement("div", {
      key: b.name,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: 14,
        boxShadow: 'var(--shadow-sm)'
      }
    }, /*#__PURE__*/React.createElement(MemberAvatar, {
      name: b.name,
      color: b.color,
      size: 42
    }), /*#__PURE__*/React.createElement("div", {
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
    }, b.name), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--caption-size)',
        color: settled ? 'var(--income)' : owe ? 'var(--expense)' : 'var(--income)'
      }
    }, settled ? 'All settled' : owe ? `You owe ₹${(Math.abs(b.net) / 100).toLocaleString('en-IN')}` : `Owes you ₹${(b.net / 100).toLocaleString('en-IN')}`)), settled ? /*#__PURE__*/React.createElement(Icon, {
      name: "check-circle",
      size: 22,
      color: "var(--income)"
    }) : /*#__PURE__*/React.createElement(Button, {
      label: "Settle",
      variant: "secondary",
      size: "sm",
      onClick: () => openPay(b)
    }));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      marginTop: 18,
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--caption-size)',
      color: 'var(--text-muted)'
    }
  }, "Payments are recorded here \u2014 BudgetSplit never moves real money."));
}
window.BS_SettleFlow = SettleFlow;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/budgetsplit/SettleFlow.jsx", error: String((e && e.message) || e) }); }

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
    over: 2,
    near: 3
  },
  // Per-category budget lines (paise) — feeds the Budget & Insights screen.
  budgetLines: [{
    name: 'Rent',
    icon: 'home',
    color: '#7C6AF7',
    allocated: 1800000,
    spent: 1800000
  }, {
    name: 'Food Delivery',
    icon: 'shopping-bag',
    color: '#F0A500',
    allocated: 500000,
    spent: 624000
  }, {
    name: 'Eating Out',
    icon: 'coffee',
    color: '#FB923C',
    allocated: 500000,
    spent: 600000
  }, {
    name: 'Groceries',
    icon: 'shopping-cart',
    color: '#3ECF8E',
    allocated: 700000,
    spent: 512000
  }, {
    name: 'Cab & Auto',
    icon: 'navigation',
    color: '#FACC15',
    allocated: 400000,
    spent: 388000
  }, {
    name: 'Subscriptions',
    icon: 'repeat',
    color: '#2DD4BF',
    allocated: 300000,
    spent: 294000
  }, {
    name: 'Health',
    icon: 'heart',
    color: '#F06060',
    allocated: 300000,
    spent: 0
  }, {
    name: 'Fuel',
    icon: 'droplet',
    color: '#F97316',
    allocated: 200000,
    spent: 0
  }, {
    name: 'Other',
    icon: 'more-horizontal',
    color: '#8B8A99',
    allocated: 300000,
    spent: 0
  }],
  // Projection (simple pace estimate) shown on the insights screen.
  projection: {
    projected: 5240000,
    dayOfMonth: 16,
    daysInMonth: 30
  },
  // Spending by category (paise) — feeds the donut
  byCategory: [{
    name: 'Rent',
    paise: 1800000,
    color: '#7C6AF7',
    icon: 'home'
  }, {
    name: 'Food Delivery',
    paise: 624000,
    color: '#F0A500',
    icon: 'shopping-bag'
  }, {
    name: 'Eating Out',
    paise: 600000,
    color: '#FB923C',
    icon: 'coffee'
  }, {
    name: 'Groceries',
    paise: 512000,
    color: '#3ECF8E',
    icon: 'shopping-cart'
  }, {
    name: 'Cab & Auto',
    paise: 388000,
    color: '#FACC15',
    icon: 'navigation'
  }, {
    name: 'Subscriptions',
    paise: 294000,
    color: '#2DD4BF',
    icon: 'repeat'
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
  }],
  // Reports tab — trend series with per-period drill-downs.
  reports: {
    month: {
      budget: 1150000,
      // weekly budget line (₹11,500)
      label: 'This month',
      bars: [{
        label: 'Jun 1',
        paise: 620000,
        top: [{
          name: 'Groceries',
          color: '#3ECF8E',
          icon: 'shopping-cart',
          paise: 220000
        }, {
          name: 'Food Delivery',
          color: '#F0A500',
          icon: 'shopping-bag',
          paise: 180000
        }, {
          name: 'Cab & Auto',
          color: '#FACC15',
          icon: 'navigation',
          paise: 120000
        }]
      }, {
        label: 'Jun 8',
        paise: 980000,
        top: [{
          name: 'Eating Out',
          color: '#FB923C',
          icon: 'coffee',
          paise: 340000
        }, {
          name: 'Food Delivery',
          color: '#F0A500',
          icon: 'shopping-bag',
          paise: 240000
        }, {
          name: 'Subscriptions',
          color: '#2DD4BF',
          icon: 'repeat',
          paise: 159900
        }]
      }, {
        label: 'Jun 15',
        paise: 760000,
        top: [{
          name: 'Groceries',
          color: '#3ECF8E',
          icon: 'shopping-cart',
          paise: 292000
        }, {
          name: 'Eating Out',
          color: '#FB923C',
          icon: 'coffee',
          paise: 160000
        }, {
          name: 'Cab & Auto',
          color: '#FACC15',
          icon: 'navigation',
          paise: 148000
        }]
      }, {
        label: 'Jun 22',
        paise: 1240000,
        top: [{
          name: 'Food Delivery',
          color: '#F0A500',
          icon: 'shopping-bag',
          paise: 320000
        }, {
          name: 'Cab & Auto',
          color: '#FACC15',
          icon: 'navigation',
          paise: 220000
        }, {
          name: 'Eating Out',
          color: '#FB923C',
          icon: 'coffee',
          paise: 180000
        }]
      }, {
        label: 'Jun 29',
        paise: 618000,
        top: [{
          name: 'Groceries',
          color: '#3ECF8E',
          icon: 'shopping-cart',
          paise: 200000
        }, {
          name: 'Subscriptions',
          color: '#2DD4BF',
          icon: 'repeat',
          paise: 134100
        }, {
          name: 'Food Delivery',
          color: '#F0A500',
          icon: 'shopping-bag',
          paise: 124000
        }]
      }]
    },
    year: {
      budget: 5000000,
      // monthly budget line (₹50,000)
      label: 'Last 12 months',
      bars: [{
        label: 'Jul',
        paise: 4120000
      }, {
        label: 'Aug',
        paise: 4380000
      }, {
        label: 'Sep',
        paise: 3990000
      }, {
        label: 'Oct',
        paise: 4710000
      }, {
        label: 'Nov',
        paise: 5240000
      }, {
        label: 'Dec',
        paise: 6180000
      }, {
        label: 'Jan',
        paise: 4050000
      }, {
        label: 'Feb',
        paise: 3870000
      }, {
        label: 'Mar',
        paise: 4460000
      }, {
        label: 'Apr',
        paise: 4230000
      }, {
        label: 'May',
        paise: 4920000
      }, {
        label: 'Jun',
        paise: 4218000
      }]
    }
  },
  // Per-group budget analytics — feeds the group-scoped insights view.
  groupBudget: {
    flat: {
      allocated: 9000000,
      spent: 6840000,
      rollover: 'Unused budget rolls into next month',
      members: [{
        name: 'Aarav Mehta',
        color: '#319795',
        paid: 2840000,
        share: 2280000
      }, {
        name: 'Priya Singh',
        color: '#B83280',
        paid: 2600000,
        share: 2280000
      }, {
        name: 'Rohit Khanna',
        color: '#38A169',
        paid: 1400000,
        share: 2280000
      }],
      lines: [{
        name: 'Rent',
        icon: 'home',
        color: '#7C6AF7',
        allocated: 6000000,
        spent: 6000000
      }, {
        name: 'Utilities',
        icon: 'zap',
        color: '#FACC15',
        allocated: 1200000,
        spent: 1340000
      }, {
        name: 'Groceries',
        icon: 'shopping-cart',
        color: '#3ECF8E',
        allocated: 1200000,
        spent: 980000
      }, {
        name: 'Help & Cleaning',
        icon: 'wind',
        color: '#2DD4BF',
        allocated: 600000,
        spent: 520000
      }]
    },
    goa: {
      allocated: 4000000,
      spent: 4215000,
      rollover: 'One-off trip — no rollover',
      members: [{
        name: 'Aarav Mehta',
        color: '#319795',
        paid: 1420000,
        share: 843000
      }, {
        name: 'Priya Singh',
        color: '#B83280',
        paid: 980000,
        share: 843000
      }, {
        name: 'Rohit Khanna',
        color: '#38A169',
        paid: 650000,
        share: 843000
      }, {
        name: 'Neha Verma',
        color: '#D69E2E',
        paid: 765000,
        share: 843000
      }, {
        name: 'Karan Shah',
        color: '#805AD5',
        paid: 400000,
        share: 843000
      }],
      lines: [{
        name: 'Stay',
        icon: 'home',
        color: '#7C6AF7',
        allocated: 1800000,
        spent: 1920000
      }, {
        name: 'Flights',
        icon: 'send',
        color: '#2DD4BF',
        allocated: 1200000,
        spent: 1180000
      }, {
        name: 'Food & Bar',
        icon: 'coffee',
        color: '#FB923C',
        allocated: 600000,
        spent: 740000
      }, {
        name: 'Activities',
        icon: 'compass',
        color: '#F472B6',
        allocated: 400000,
        spent: 375000
      }]
    },
    off: {
      allocated: 760000,
      spent: 312000,
      rollover: 'Resets weekly',
      members: [{
        name: 'Aarav Mehta',
        color: '#319795',
        paid: 120000,
        share: 52000
      }, {
        name: 'Priya Singh',
        color: '#B83280',
        paid: 80000,
        share: 52000
      }, {
        name: 'Rohit Khanna',
        color: '#38A169',
        paid: 60000,
        share: 52000
      }],
      lines: [{
        name: 'Lunch',
        icon: 'coffee',
        color: '#FB923C',
        allocated: 600000,
        spent: 268000
      }, {
        name: 'Snacks',
        icon: 'box',
        color: '#FBBF24',
        allocated: 160000,
        spent: 44000
      }]
    }
  }
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/budgetsplit/data.js", error: String((e && e.message) || e) }); }

// ui_kits/budgetsplit/store.js
try { (() => {
/* Live in-memory store for the BudgetSplit prototype, so actions (add expense,
   split a bill, settle up) actually change what the dashboard & ledger show.
   Seeded from BS_DATA. Plain pub/sub + a React hook (window.useBS). */
(function () {
  const seed = window.BS_DATA;
  let state = {
    txns: seed.recent.map((t, i) => ({
      id: 'seed-' + i,
      ...t
    })),
    // What you owe each member (negative = you owe them, positive = they owe you), in paise.
    balances: [{
      name: 'Priya Singh',
      color: '#B83280',
      net: -90000
    }, {
      name: 'Rohit Khanna',
      color: '#38A169',
      net: 46000
    }, {
      name: 'Neha Kapoor',
      color: '#3182CE',
      net: -32500
    }]
  };
  const subs = new Set();
  function emit() {
    subs.forEach(f => f());
  }
  window.BS_STORE = {
    get: () => state,
    addTxn(t) {
      const txn = {
        id: 't-' + Date.now(),
        when: 'Today',
        kind: 'expense',
        ...t
      };
      state = {
        ...state,
        txns: [txn, ...state.txns]
      };
      emit();
      return txn;
    },
    recordSettle(name, paise) {
      // paise is the magnitude settled; reduce the outstanding toward zero.
      state = {
        ...state,
        balances: state.balances.map(b => {
          if (b.name !== name) return b;
          const dir = b.net < 0 ? 1 : -1;
          return {
            ...b,
            net: b.net + dir * Math.min(Math.abs(b.net), paise)
          };
        }),
        txns: [{
          id: 't-' + Date.now(),
          when: 'Today',
          kind: 'settlement',
          category: 'Settle with ' + name.split(' ')[0],
          note: 'Recorded payment',
          icon: 'check-circle',
          color: '#8B7CF8',
          paise: -paise
        }, ...state.txns]
      };
      emit();
    },
    subscribe(f) {
      subs.add(f);
      return () => subs.delete(f);
    }
  };
  window.useBS = function () {
    const [, force] = React.useReducer(x => x + 1, 0);
    React.useEffect(() => window.BS_STORE.subscribe(force), []);
    return [window.BS_STORE.get(), window.BS_STORE];
  };

  // Curated category grid for the add-expense flow (from the master catalog).
  window.BS_CATS = [{
    name: 'Food Delivery',
    icon: 'shopping-bag',
    color: '#F0A500'
  }, {
    name: 'Groceries',
    icon: 'shopping-cart',
    color: '#3ECF8E'
  }, {
    name: 'Eating Out',
    icon: 'coffee',
    color: '#FB923C'
  }, {
    name: 'Cab & Auto',
    icon: 'navigation',
    color: '#FACC15'
  }, {
    name: 'Rent',
    icon: 'home',
    color: '#7C6AF7'
  }, {
    name: 'Electricity',
    icon: 'zap',
    color: '#60A5FA'
  }, {
    name: 'Subscriptions',
    icon: 'repeat',
    color: '#2DD4BF'
  }, {
    name: 'Shopping',
    icon: 'shopping-bag',
    color: '#A78BFA'
  }, {
    name: 'Health',
    icon: 'heart',
    color: '#F06060'
  }, {
    name: 'Fuel',
    icon: 'droplet',
    color: '#F97316'
  }, {
    name: 'Entertainment',
    icon: 'film',
    color: '#F87171'
  }, {
    name: 'Other',
    icon: 'more-horizontal',
    color: '#8B8A99'
  }];
  window.BS_INCOME_CATS = [{
    name: 'Salary',
    icon: 'briefcase',
    color: '#3ECF8E'
  }, {
    name: 'Freelance',
    icon: 'edit-3',
    color: '#34D399'
  }, {
    name: 'Business',
    icon: 'trending-up',
    color: '#10B981'
  }, {
    name: 'Bonus',
    icon: 'award',
    color: '#22C55E'
  }, {
    name: 'Cashback',
    icon: 'corner-up-left',
    color: '#2BD49B'
  }, {
    name: 'Interest',
    icon: 'percent',
    color: '#4ADE80'
  }, {
    name: 'Refund',
    icon: 'rotate-ccw',
    color: '#3ECF8E'
  }, {
    name: 'Other',
    icon: 'more-horizontal',
    color: '#8B8A99'
  }];

  // --- amount entry helpers (entry is a rupee string; money is integer paise) ---
  window.BS_keyReduce = function (str, key) {
    if (key === 'del') return str.length <= 1 ? '' : str.slice(0, -1);
    if (key === '.') {
      if (str.includes('.') || str === '') return str === '' ? '0.' : str;
      return str + '.';
    }
    // digit
    if (str === '0') return key; // replace leading zero
    const dot = str.indexOf('.');
    if (dot >= 0 && str.length - dot > 2) return str; // max 2 decimals
    if (str.replace('.', '').length >= 9) return str; // sane cap
    return str + key;
  };
  window.BS_entryToPaise = function (str) {
    if (!str) return 0;
    return Math.round(parseFloat(str) * 100);
  };
  window.BS_fmtEntry = function (str) {
    if (!str) return '0';
    const [intp, dec] = str.split('.');
    const grouped = parseInt(intp || '0', 10).toLocaleString('en-IN');
    return dec !== undefined ? grouped + '.' + dec : grouped;
  };
  // paise → display rupees
  window.BS_formatRupees = paise => '₹' + (paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  window.BS_formatRupeesShort = paise => '₹' + Math.round(paise / 100).toLocaleString('en-IN');
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/budgetsplit/store.js", error: String((e && e.message) || e) }); }

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
