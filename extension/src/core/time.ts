const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
}

/** "just now", "5 minutes ago", "1 hour ago", "3 days ago", or a date for anything older than 30 days. */
export function relativeTime(iso: string, now: number): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '';
  const elapsed = Math.max(0, now - at);
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return plural(Math.floor(elapsed / MINUTE), 'minute');
  if (elapsed < DAY) return plural(Math.floor(elapsed / HOUR), 'hour');
  if (elapsed < 30 * DAY) return plural(Math.floor(elapsed / DAY), 'day');
  return new Date(at).toLocaleDateString();
}

/** A time zone Intl accepts; the settings zone can be missing or unknown on an older backend. */
export function safeTimeZone(zone: string | null | undefined): string {
  if (!zone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone });
    return zone;
  } catch {
    return 'UTC';
  }
}

interface ZonedParts {
  day: string;
  weekday: string;
  dayMonth: string;
  year: string;
  time: string;
  minutes: number;
}

function zoned(at: number, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(at));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  const hour = Number(part('hour')) % 24;
  const minute = Number(part('minute'));
  return {
    day: `${part('year')}-${part('month')}-${part('day')}`,
    weekday: part('weekday'),
    dayMonth: `${part('day')} ${part('month')}`,
    year: part('year'),
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    minutes: hour * 60 + minute,
  };
}

/** "today 11:43", "yesterday 18:02", "Mon 09:15" within a week, else "12 Oct 09:15" (with the year if not this year). */
export function formatWhen(iso: string, now: number, timeZone: string | undefined): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '';
  const zone = safeTimeZone(timeZone);
  const then = zoned(at, zone);
  const today = zoned(now, zone);
  if (then.day === today.day) return `today ${then.time}`;
  if (then.day === zoned(now - DAY, zone).day) return `yesterday ${then.time}`;
  if (at <= now && now - at < 6 * DAY) return `${then.weekday} ${then.time}`;
  const year = then.year === today.year ? '' : ` ${then.year}`;
  return `${then.dayMonth}${year} ${then.time}`;
}

/** 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st, ... */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/** "45 s", "2 min 14 s", "1 h 5 min". */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total} s`;
  if (total < 3600) {
    const rest = total % 60;
    return rest === 0 ? `${Math.floor(total / 60)} min` : `${Math.floor(total / 60)} min ${rest} s`;
  }
  const minutes = Math.floor((total % 3600) / 60);
  return minutes === 0 ? `${Math.floor(total / 3600)} h` : `${Math.floor(total / 3600)} h ${minutes} min`;
}

/** "45 s", "2 min", "1 h": the short form for notification titles. */
export function shortDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total} s`;
  if (total < 3600) return `${Math.floor(total / 60)} min`;
  return `${Math.floor(total / 3600)} h`;
}

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function minutesOf(value: string | undefined): number | null {
  const match = value ? HH_MM.exec(value) : null;
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** True inside [start, end) in the settings time zone; the range may wrap midnight (22:00 to 07:00). */
export function inQuietHours(now: number, start: string | undefined, end: string | undefined, timeZone: string | undefined): boolean {
  const from = minutesOf(start);
  const to = minutesOf(end);
  if (from === null || to === null || from === to) return false;
  const current = zoned(now, safeTimeZone(timeZone)).minutes;
  return from < to ? current >= from && current < to : current >= from || current < to;
}
