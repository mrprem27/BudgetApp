export type TimeValue = { hour: number; minute: number };

/**
 * A time held to the wheel's minute step — `7:07` on a 5-minute wheel is `7:05`. Without it the
 * wheel showed the nearest row while Save wrote the raw minute, so the sheet said one time and
 * saved another. Rounds across the hour and midnight.
 */
export function snapTime(value: TimeValue, step: number): TimeValue {
  const total = Math.round((value.hour * 60 + value.minute) / step) * step;
  const wrapped = ((total % 1440) + 1440) % 1440;
  return { hour: Math.floor(wrapped / 60), minute: wrapped % 60 };
}
