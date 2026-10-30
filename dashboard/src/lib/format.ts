const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The browser's own zone, used until the settings have loaded. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return zone.trim().length > 0;
  } catch {
    return false;
  }
}

/*
 * Every date and time in the dashboard is shown in settings.timeZone (D-091). The shell sets the
 * zone once the settings have loaded and remounts the pages when it changes, so formatters stay
 * plain functions.
 */
let displayZone = browserTimeZone();

export function setDisplayTimeZone(zone: string): void {
  displayZone = isValidTimeZone(zone) ? zone : browserTimeZone();
}

export function displayTimeZone(): string {
  return displayZone;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: displayZone });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: displayZone });
}

/** A calendar date (YYYY-MM-DD, already in the owner's zone) such as "Thu, 29 Oct". */
export function formatDate(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** "Mon" for a YYYY-MM-DD calendar date. */
export function weekdayOf(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
}

/** Today's calendar date in the display zone, as YYYY-MM-DD. */
export function todayInZone(now: number = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: displayZone }).format(now);
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", then the date. */
export function relativeTime(iso: string | null, now: number): string {
  if (!iso) return '—';
  const elapsed = Math.max(0, now - Date.parse(iso));
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} h ago`;
  if (elapsed < 30 * DAY) {
    const days = Math.floor(elapsed / DAY);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  return new Date(iso).toLocaleDateString(undefined, { timeZone: displayZone });
}

/** A shorter date and time for tables: "Oct 30, 1:00 PM" this year, "Oct 30, 2025, 1:00 PM" before. */
export function formatShortDateTime(iso: string | null, now: number = Date.now()): string {
  if (!iso) return '—';
  const sameYear = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: displayZone }).format(Date.parse(iso)) === new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: displayZone }).format(now);
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
    timeZone: displayZone,
  });
}

/** The calendar day (YYYY-MM-DD) of an instant in the display zone. */
export function dayInZone(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: displayZone }).format(Date.parse(iso));
}

/** "Today", "Yesterday" or "Wed, 28 Oct" (with the year when it is not this year) for a day group. */
export function dayHeading(day: string, now: number): string {
  const today = todayInZone(now);
  if (day === today) return 'Today';
  if (day === todayInZone(now - DAY)) return 'Yesterday';
  const label = formatDate(day);
  return day.slice(0, 4) === today.slice(0, 4) ? label : `${label} ${day.slice(0, 4)}`;
}

/** Splits items (already newest first) into day groups in the display zone, keeping the order. */
export function groupByDay<T>(items: T[], at: (item: T) => string): { day: string; items: T[] }[] {
  const groups: { day: string; items: T[] }[] = [];
  for (const item of items) {
    const day = dayInZone(at(item));
    const last = groups.at(-1);
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}

/** The UTC instant at the last second of a calendar day in the display zone (for "expires on"). */
export function endOfDayInZone(day: string, zone: string = displayZone): string {
  const [year = 1970, month = 1, date = 1] = day.split('-').map(Number);
  const wall = Date.UTC(year, month - 1, date, 23, 59, 59);
  const offsetAt = (instant: number) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(instant);
    const part = (type: string) => Number(parts.find((item) => item.type === type)?.value ?? 0);
    return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second')) - instant;
  };
  let instant = wall - offsetAt(wall);
  const second = wall - offsetAt(instant);
  if (second !== instant) instant = second;
  return new Date(instant).toISOString();
}

/** "1st", "2nd", "3rd", "11th", "22nd". */
export function ordinal(value: number): string {
  const tens = value % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][value % 10] ?? 'th');
  return `${value}${suffix}`;
}

/** "45 s", "2 min 14 s", "1 h 5 min". */
export function duration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  if (whole < 60) return `${whole} s`;
  if (whole < 3600) return `${Math.floor(whole / 60)} min${whole % 60 ? ` ${whole % 60} s` : ''}`;
  return `${Math.floor(whole / 3600)} h${Math.floor((whole % 3600) / 60) ? ` ${Math.floor((whole % 3600) / 60)} min` : ''}`;
}

/** "180 KB", "7.0 MB". */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "1 open", "3 opens". */
export function count(value: number, word: string): string {
  return `${value} ${word}${value === 1 ? '' : 's'}`;
}

export function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** Why an event did not count, in plain words (backend enum Reason). */
export const REASONS: Record<string, string> = {
  SELF: 'Your own request (marked by the extension)',
  SELF_VIEW: 'You were looking at this email in Gmail at that moment',
  SEND_GRACE: 'Within seconds of sending: Gmail showing your sent copy',
  BEFORE_SEND: 'Before the email was sent',
  DUPLICATE: 'Repeat from the same reader within the duplicate window',
  BOT_HEAD: 'HEAD request: a link checker, not a person',
  BOT_UA: 'A known bot or security scanner',
  BOT_TIMING: 'Clicked within seconds of sending: a security scanner',
  BOT_BURST: 'Several links clicked at once: a security scanner',
  PREFETCH: 'Apple Mail privacy prefetch, not a real open',
  TRACKING_OFF: 'Tracking was switched off for this email',
  OWNER: 'You marked this as your own view',
};

export const SOURCES: Record<string, string> = {
  GMAIL_PROXY: 'Gmail',
  OUTLOOK_PROXY: 'Outlook',
  YAHOO_PROXY: 'Yahoo Mail',
  APPLE_MPP: 'Apple Mail privacy',
  SCANNER: 'Scanner',
  DIRECT: 'Browser or mail app',
  UNKNOWN: 'Unknown',
};

export function recipientsText(recipients: { email: string; name: string | null }[]): string {
  if (recipients.length === 0) return 'No recipients';
  const first = recipients[0]!;
  const label = first.name || first.email;
  return recipients.length === 1 ? label : `${label} +${recipients.length - 1}`;
}
