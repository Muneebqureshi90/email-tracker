/**
 * What a request's user agent says about the reader's device (D-134). Approximate: browsers shorten and
 * freeze parts of it (Windows 11 reports Windows 10, Chrome on Android hides the version, iPads can
 * look like Macs). Mail proxies send their own fixed user agent, so the page hides it for them (D-034).
 */
export interface DeviceInfo {
  kind: 'Mobile' | 'Tablet' | 'Desktop' | null;
  /** "Android 14", "iOS 18.1", "Windows 10 or 11", "macOS"… */
  system: string | null;
  /** Browser or mail app with its major version: "Chrome 140", "Apple Mail", "Outlook"… */
  app: string | null;
}

const IOS = /\b(iPhone|iPad|iPod)\b[^)]*? OS (\d+)(?:_(\d+))?/;
const WINDOWS = /\bWindows NT (\d+\.\d+)/;
const WINDOWS_NAMES: Record<string, string> = {
  '10.0': 'Windows 10 or 11',
  '6.3': 'Windows 8.1',
  '6.2': 'Windows 8',
  '6.1': 'Windows 7',
  '6.0': 'Windows Vista',
  '5.1': 'Windows XP',
};

/** First match wins, so specific apps come before the engines they are built on. */
const APPS: readonly (readonly [RegExp, string])[] = [
  [/\bMicrosoft Outlook\b|\bms-office\b|\bMSOffice\b/, 'Outlook'],
  [/\bThunderbird\/(\d+)/, 'Thunderbird'],
  [/\bEdg(?:e|A|iOS)?\/(\d+)/, 'Edge'],
  [/\bOPR\/(\d+)/, 'Opera'],
  [/\bSamsungBrowser\/(\d+)/, 'Samsung Internet'],
  [/\bYaBrowser\/(\d+)/, 'Yandex Browser'],
  [/\bCriOS\/(\d+)/, 'Chrome'],
  [/\bFxiOS\/(\d+)/, 'Firefox'],
  [/\bFirefox\/(\d+)/, 'Firefox'],
  // A web view inside an Android app (a mail app, for example), not a browser.
  [/; wv\)/, 'Android app'],
  [/\bChrome\/(\d+)/, 'Chrome'],
  [/\bVersion\/(\d+)\S* (?:Mobile\/\S+ )?Safari\//, 'Safari'],
  // Apple Mail (and other WebKit apps) send the engine without any browser name.
  [/\bAppleWebKit\/[\d.]+ \(KHTML, like Gecko\)(?: Mobile\/\S+)?$/, 'Apple Mail'],
];

export function describeDevice(userAgent: string | null): DeviceInfo | null {
  if (!userAgent) return null;
  const system = systemOf(userAgent);
  const device: DeviceInfo = { kind: kindOf(userAgent, system), system, app: appOf(userAgent) };
  return device.kind || device.system || device.app ? device : null;
}

function systemOf(ua: string): string | null {
  const ios = IOS.exec(ua);
  if (ios) return `${ios[1] === 'iPad' ? 'iPadOS' : 'iOS'} ${ios[2] ?? ''}${ios[3] ? `.${ios[3]}` : ''}`.trim();
  if (/\bAndroid\b/.test(ua)) {
    // Chrome's reduced user agent always says "Android 10; K", whatever the real version is.
    const version = /\bAndroid (\d+(?:\.\d+)?)/.exec(ua)?.[1];
    return version && !/\bAndroid 10; K\)/.test(ua) ? `Android ${version}` : 'Android';
  }
  const windows = WINDOWS.exec(ua);
  if (windows) return WINDOWS_NAMES[windows[1] ?? ''] ?? 'Windows';
  if (/\bWindows\b/.test(ua)) return 'Windows';
  if (/\bCrOS\b/.test(ua)) return 'ChromeOS';
  if (/\bMacintosh\b|\bMac OS X\b/.test(ua)) return 'macOS';
  if (/\bLinux\b/.test(ua)) return 'Linux';
  return null;
}

function kindOf(ua: string, system: string | null): DeviceInfo['kind'] {
  if (/\biPad\b|\bTablet\b/.test(ua)) return 'Tablet';
  if (/\b(?:iPhone|iPod|Mobile|Mobi)\b/.test(ua)) return 'Mobile';
  if (/\bAndroid\b/.test(ua)) return 'Tablet';
  if (system && /^(?:Windows|macOS|ChromeOS|Linux)/.test(system)) return 'Desktop';
  return null;
}

function appOf(ua: string): string | null {
  for (const [pattern, name] of APPS) {
    const match = pattern.exec(ua);
    if (match) return match[1] ? `${name} ${match[1]}` : name;
  }
  return null;
}
