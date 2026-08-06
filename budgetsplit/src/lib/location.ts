import * as Location from 'expo-location';

export type CapturedPlace = { lat: number; lng: number; label: string | null };

/**
 * Captures the current location and reverse-geocodes it to a human place name
 * (e.g. "Cyber Hub, Gurgaon"). Returns null if permission is denied or anything
 * fails — capture is always optional and best-effort.
 */
export async function getCurrentPlace(): Promise<CapturedPlace | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    return await readPlace();
  } catch {
    return null;
  }
}

/**
 * The same capture, but **never prompts** — if permission hasn't already been granted,
 * this returns null silently.
 *
 * For Scan & Pay. A permission dialog in the middle of paying a shopkeeper hijacks the one
 * flow whose entire purpose is speed, to obtain something that is a bonus rather than the
 * feature. The user grants location in Add Transaction or in Settings, deliberately, and
 * scanning then benefits from it; declining costs them nothing here.
 */
export async function getCurrentPlaceIfPermitted(): Promise<CapturedPlace | null> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    return await readPlace();
  } catch {
    return null;
  }
}

/** Position + reverse-geocode. Assumes permission is already granted. */
async function readPlace(): Promise<CapturedPlace | null> {
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const { latitude, longitude } = pos.coords;

    let label: string | null = null;
    try {
      const results = await Location.reverseGeocodeAsync({ latitude, longitude });
      const g = results[0];
      if (g) {
        // Prefer a named place + city; fall back to whatever is available.
        const parts = [g.name, g.city ?? g.subregion, g.region].filter(Boolean) as string[];
        // De-dupe (name is sometimes the same as city) and keep it short.
        const seen = new Set<string>();
        label = parts.filter(p => (seen.has(p) ? false : (seen.add(p), true))).slice(0, 2).join(', ') || null;
      }
    } catch {
      // Reverse-geocode failed — keep coordinates only.
    }

    return { lat: latitude, lng: longitude, label };
  } catch {
    return null;
  }
}
