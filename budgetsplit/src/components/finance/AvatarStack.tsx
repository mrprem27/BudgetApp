import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, type } from '../tokens';
import { MemberAvatar } from './MemberAvatar';

type StackPerson = { id: string; name: string; avatar_color: string; image_uri?: string | null };

type Props = {
  people: StackPerson[];
  /** Avatar diameter. */
  size?: number;
  /** Max avatars before a "+N" overflow chip. */
  max?: number;
  /** Ring colour separating overlapping avatars — set to the surface behind them. */
  ringColor?: string;
};

/** Overlapping stacked member avatars with an optional "+N" overflow. */
export function AvatarStack({ people, size = 22, max = 4, ringColor = colors.bgCard }: Props) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <View style={styles.row}>
      {shown.map((m, i) => (
        <View
          key={m.id}
          style={[{ borderRadius: size / 2 + 2, borderWidth: 1.5, borderColor: ringColor }, i > 0 && { marginLeft: -Math.round(size * 0.26) }]}
        >
          <MemberAvatar name={m.name} color={m.avatar_color} size={size} imageUri={m.image_uri} />
        </View>
      ))}
      {extra > 0 && <Text style={styles.more}>+{extra}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  more: { ...type.caption, color: colors.textMuted, marginLeft: 4 },
});
