export const TZ = 'Asia/Jakarta';

const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Calendar date in Jakarta as UTC-midnight ms, so days can be subtracted. */
function jakartaDay(d: Date) {
  return Date.parse(dayKey.format(d)); // en-CA gives YYYY-MM-DD
}

/**
 * Calendar days between `d` and `now` in Jakarta time. A scan at 23:00
 * yesterday is 1 day ago at 08:00 today, not 0 (unlike elapsed / 24h).
 */
export function calendarDaysAgo(d: Date | string, now = new Date()) {
  return Math.max(0, Math.round((jakartaDay(now) - jakartaDay(new Date(d))) / 86_400_000));
}

export function daysAgoLabel(days: number) {
  if (days === 0) return 'hari ini';
  if (days === 1) return 'kemarin';
  return `${days} hari lalu`;
}
