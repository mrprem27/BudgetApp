import { useEffect } from 'react';
import { useSegments } from 'expo-router';
import { screenChanged, routeOf } from '../lib/usageEvents';

/**
 * One `Screen` event per route change, by the route's shape (`/group/[id]`), never its ids. It
 * also tells the analytics module which screen is up, so every other event says where it happened.
 */
export function useScreenEvents(): void {
  const segments = useSegments();
  const route = routeOf(segments);
  useEffect(() => { screenChanged(route); }, [route]);
}
