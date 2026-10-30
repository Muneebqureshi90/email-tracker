/** YYYY-MM-DD for a local calendar day, and back (calendar math at noon avoids DST edges). */
export function toDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function fromDay(day: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
}

/** "Fri, 30 Oct 2026" for a YYYY-MM-DD day. */
export function dayLabel(day: string): string {
  const date = fromDay(day);
  return date ? date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

/** The day after a YYYY-MM-DD day, as YYYY-MM-DD. */
export function nextDay(day: string): string {
  const date = fromDay(day);
  if (!date) return day;
  date.setDate(date.getDate() + 1);
  return toDay(date);
}
