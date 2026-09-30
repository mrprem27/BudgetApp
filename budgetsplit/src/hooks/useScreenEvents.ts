import { useEffect } from 'react';
import { useSegments } from 'expo-router';
import { track, routeOf } from '../lib/usageEvents';

/** One `Screen` event per route change, by the route's shape (`/group/[id]`), never its ids. */
export function useScreenEvents(): void {
  const segments = useSegments();
  const route = routeOf(segments);
  useEffect(() => { track('Screen', { route }); }, [route]);
}
