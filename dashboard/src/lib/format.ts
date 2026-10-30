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
