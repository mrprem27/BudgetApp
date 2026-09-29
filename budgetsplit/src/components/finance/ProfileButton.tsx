import React from 'react';
import { useRouter } from 'expo-router';
import { useStore } from '../../store';
import { colors } from '../tokens';
import { MemberAvatar } from './MemberAvatar';

/**
 * Your avatar, top-right of every tab. Settings opens from here rather than from a tab of its own,
 * so the bar holds the four places you go every day and the one you rarely need is still one tap away.
 */
export function ProfileButton() {
  const router = useRouter();
  const me = useStore(s => s.me);
  return (
    <MemberAvatar
      name={me?.name ?? ''}
      color={me?.avatar_color ?? colors.accent}
      imageUri={me?.image_uri}
      size={32}
      onPress={() => router.push('/settings')}
    />
  );
}
