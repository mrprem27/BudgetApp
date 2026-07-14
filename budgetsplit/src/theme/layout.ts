import { colors } from './colors';

export const space = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
};

export const radius = {
  sm:  8,
  md:  12,
  lg:  16,
  pill: 999,
};

export const layout = {
  screenPaddingH: 16,
  cardPadding:    16,
  tabBarHeight:   64,
  headerHeight:   56,
};

/**
 * Elevation presets tuned for the dark theme. On dark backgrounds a pure-black
 * shadow reads as a soft halo around the card rather than a hard drop shadow,
 * which is the current iOS look. `elevation` keeps Android in parity.
 */
export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 5,
  },
  lg: {
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 22,
    elevation: 12,
  },
  // The FAB glows in its own coral light (design token --shadow-fab).
  fab: {
    shadowColor: colors.coral,
    shadowOpacity: 0.45,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 8,
  },
} as const;
