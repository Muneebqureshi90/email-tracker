import { describe, expect, it } from 'vitest';
import { describeDevice } from '../lib/device';

const cases: [string, string, ReturnType<typeof describeDevice>][] = [
  [
    'Chrome on Windows',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    { kind: 'Desktop', system: 'Windows 10 or 11', app: 'Chrome 140' },
  ],
  [
    'Edge on Windows',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.3485.54',
    { kind: 'Desktop', system: 'Windows 10 or 11', app: 'Edge 140' },
  ],
  [
    'Chrome on Android, reduced user agent',
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
    { kind: 'Mobile', system: 'Android', app: 'Chrome 140' },
  ],
  [
    'Samsung Internet on a phone',
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36',
    { kind: 'Mobile', system: 'Android 14', app: 'Samsung Internet 27' },
  ],
  [
    'an Android app web view',
    'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36',
    { kind: 'Mobile', system: 'Android 13', app: 'Android app' },
  ],
  [
    'an Android tablet',
    'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    { kind: 'Tablet', system: 'Android 13', app: 'Chrome 140' },
  ],
  [
    'Safari on an iPhone',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
    { kind: 'Mobile', system: 'iOS 18.1', app: 'Safari 18' },
  ],
  [
    'Chrome on an iPhone',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1',
    { kind: 'Mobile', system: 'iOS 17.5', app: 'Chrome 140' },
  ],
  [
    'Apple Mail on an iPhone',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    { kind: 'Mobile', system: 'iOS 17.5', app: 'Apple Mail' },
  ],
  [
    'Safari on an iPad',
    'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    { kind: 'Tablet', system: 'iPadOS 17.5', app: 'Safari 17' },
  ],
  [
    'Apple Mail on a Mac',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)',
    { kind: 'Desktop', system: 'macOS', app: 'Apple Mail' },
  ],
  [
    'Firefox on Linux',
    'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
    { kind: 'Desktop', system: 'Linux', app: 'Firefox 131' },
  ],
  [
    'Outlook on Windows',
    'Microsoft Office/16.0 (Windows NT 10.0; Microsoft Outlook 16.0.17928; Pro)',
    { kind: 'Desktop', system: 'Windows 10 or 11', app: 'Outlook' },
  ],
  [
    'Thunderbird on Windows',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Thunderbird/128.3.0',
    { kind: 'Desktop', system: 'Windows 10 or 11', app: 'Thunderbird 128' },
  ],
  [
    'Chrome on ChromeOS',
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    { kind: 'Desktop', system: 'ChromeOS', app: 'Chrome 140' },
  ],
  [
    'old Edge (a user agent Google also sends)',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36 Edge/12.246',
    { kind: 'Desktop', system: 'Windows 10 or 11', app: 'Edge 12' },
  ],
  ['Windows 7', 'Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0', { kind: 'Desktop', system: 'Windows 7', app: 'Firefox 115' }],
  ['an unknown client', 'curl/8.9.1', null],
];

describe('device from the user agent', () => {
  it.each(cases)('reads %s', (_name, userAgent, expected) => {
    expect(describeDevice(userAgent)).toEqual(expected);
  });

  it('says nothing without a user agent', () => {
    expect(describeDevice(null)).toBeNull();
    expect(describeDevice('')).toBeNull();
  });
});
