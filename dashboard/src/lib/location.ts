import type { IpLocation } from '../api/types';

/** Sources that fetch images for the reader, so their address belongs to the mail service (D-034). */
export const MAIL_PROXY_SOURCES: ReadonlySet<string> = new Set(['GMAIL_PROXY', 'OUTLOOK_PROXY', 'YAHOO_PROXY', 'APPLE_MPP']);

/** Network owners that run mail and cloud servers: a request from them is rarely the reader's own connection. */
const SERVER_NETWORKS = /\b(google|microsoft|yahoo|apple|amazon)\b/i;

/** "Lahore, Punjab, Pakistan": city, region and country, skipping missing parts and repeats. */
export function placeName(location: IpLocation): string | null {
  const parts: string[] = [];
  for (const part of [location.city, location.region, location.country]) {
    if (part && !parts.includes(part)) parts.push(part);
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

/** Latitude or longitude with 4 decimals (about 11 m, finer than the data really is), or a dash. */
export function formatCoordinate(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toFixed(4);
}

export function isServerNetwork(owner: string | null): boolean {
  return owner !== null && SERVER_NETWORKS.test(owner);
}
