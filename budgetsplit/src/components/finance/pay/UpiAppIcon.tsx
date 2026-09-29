import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { colors } from '../../tokens';
import { alpha } from '../../../theme';
import { monogramFor, type UpiAppSpec } from '../../../lib/upiIntent';

/**
 * An app's identity in the picker — its own artwork when we have it, and a
 * two-letter monogram when we don't.
 *
 * U1 shipped without real logo artwork: every Indian UPI app's icon is a trademarked
 * asset, and neither downloading one from an unverified source nor fabricating a
 * brand color to stand in for it belongs in this codebase. `UpiAppSpec.logo` is the
 * seam — set one and this component switches to it automatically, no changes here.
 * Until then every app gets the same neutral monogram treatment, which is honest
 * about what we actually have.
 */
export function UpiAppIcon({ app, size = 40 }: { app: UpiAppSpec; size?: number }) {
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      {app.logo ? (
        <Image
          source={app.logo}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="cover"
        />
      ) : (
        <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{monogramFor(app.label)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(colors.accent, 13) },
  initials: { fontFamily: 'Inter_600SemiBold', color: colors.accent },
});
