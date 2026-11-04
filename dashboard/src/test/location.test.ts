import { describe, expect, it } from 'vitest';
import { formatDateTimeSeconds, setDisplayTimeZone } from '../lib/format';
import { MAIL_PROXY_SOURCES, formatCoordinate, isServerNetwork, placeName } from '../lib/location';

const place = { city: null, region: null, country: null, countryCode: null, latitude: null, longitude: null, networkOwner: null };

describe('request location', () => {
  it('names the place without missing parts or repeats', () => {
    expect(placeName({ ...place, city: 'Lahore', region: 'Punjab', country: 'Pakistan' })).toBe('Lahore, Punjab, Pakistan');
    expect(placeName({ ...place, city: 'Singapore', region: 'Singapore', country: 'Singapore' })).toBe('Singapore');
    expect(placeName({ ...place, country: 'Germany' })).toBe('Germany');
    expect(placeName({ ...place, networkOwner: 'Example Telecom' })).toBeNull();
  });

  it('shows coordinates with four decimals', () => {
    expect(formatCoordinate(31.54972)).toBe('31.5497');
    expect(formatCoordinate(-122.0775)).toBe('-122.0775');
    expect(formatCoordinate(0)).toBe('0.0000');
    expect(formatCoordinate(null)).toBe('—');
    expect(formatCoordinate(undefined)).toBe('—');
  });

  it('flags mail and cloud networks and mail proxies', () => {
    expect(isServerNetwork('Google LLC')).toBe(true);
    expect(isServerNetwork('Microsoft Corporation')).toBe(true);
    expect(isServerNetwork('Pakistan Telecommunication Company Limited')).toBe(false);
    expect(isServerNetwork(null)).toBe(false);
    expect([...MAIL_PROXY_SOURCES].sort()).toEqual(['APPLE_MPP', 'GMAIL_PROXY', 'OUTLOOK_PROXY', 'YAHOO_PROXY']);
    expect(MAIL_PROXY_SOURCES.has('DIRECT')).toBe(false);
  });

  it('formats request times to the second in the display time zone', () => {
    setDisplayTimeZone('Asia/Karachi');
    expect(formatDateTimeSeconds('2026-11-04T10:45:07Z')).toMatch(/3:45:07/);
    setDisplayTimeZone('UTC');
    expect(formatDateTimeSeconds('2026-11-04T10:45:07Z')).toMatch(/10:45:07/);
    expect(formatDateTimeSeconds(null)).toBe('—');
  });
});
