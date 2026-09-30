import { View, Text, Image, StyleSheet } from 'react-native';
import { colors } from '../../tokens';
import { alpha } from '../../../theme';
import { monogramFor, type UpiAppSpec } from '../../../lib/upiIntent';
import { UPI_APP_LOGOS } from './upiAppLogos';

/**
 * An app's identity in the picker — its own icon (`upiAppLogos`), and a two-letter monogram for any
 * app without one. Icons are drawn as rounded squares, the way they look on a home screen; the
 * monogram keeps its circle so a missing logo still reads as a placeholder.
 */
export function UpiAppIcon({ app, size = 40 }: { app: UpiAppSpec; size?: number }) {
  const logo = app.logo ?? UPI_APP_LOGOS[app.key];
  if (logo) {
    return <Image source={logo} style={{ width: size, height: size, borderRadius: size * 0.22 }} resizeMode="cover" accessibilityIgnoresInvertColors />;
  }
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{monogramFor(app.label)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(colors.accent, 13) },
  initials: { fontFamily: 'Inter_600SemiBold', color: colors.accent },
});
