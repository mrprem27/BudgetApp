import { Switch, type SwitchProps } from 'react-native';
import { colors } from '../tokens';

/**
 * The app's one switch: the platform control in the app's colours. Seven screens configured
 * `trackColor` and `thumbColor` by hand, and they had drifted (one thumb was `onAccent`, the
 * rest `textPrimary`). `tint` is the "on" colour, for a switch inside a tinted section.
 */
export function AppSwitch({ tint = colors.accent, ...props }: Omit<SwitchProps, 'trackColor' | 'thumbColor'> & { tint?: string }) {
  return <Switch trackColor={{ true: tint, false: colors.bgMuted }} thumbColor={colors.textPrimary} {...props} />;
}
