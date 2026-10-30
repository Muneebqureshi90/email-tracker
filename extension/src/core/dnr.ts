/**
 * declarativeNetRequest rules (PLAN §4.3 and §7). Plain data, so they are unit-tested; the service
 * worker hands them to Chrome.
 */

export type DnrResourceType = 'image' | 'main_frame' | 'sub_frame' | 'xmlhttprequest' | 'ping' | 'other';

export interface DnrRule {
  id: number;
  priority: number;
  action:
    | { type: 'block' }
    | { type: 'modifyHeaders'; requestHeaders: { header: string; operation: 'set'; value: string }[] };
  condition: {
    requestDomains?: string[];
    urlFilter?: string;
    regexFilter?: string;
    resourceTypes?: DnrResourceType[];
  };
}

export const RULE_IDS = {
  inboxSdkApi: 1,
  inboxSdkEvents: 2,
  directPixel: 10,
  proxyPixel: 11,
  selfClick: 12,
  selfDocument: 13,
} as const;

export interface DnrInput {
  publicBaseUrl: string | null;
  dnrBlocking: boolean;
  selfHeaderName: string | null;
  selfHeaderValue: string | null;
  regexSupported: boolean;
}

export function trackingHost(publicBaseUrl: string | null): string | null {
  if (!publicBaseUrl) return null;
  try {
    const url = new URL(publicBaseUrl);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.host.toLowerCase() : null;
  } catch {
    return null;
  }
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Gmail shows images as `https://…googleusercontent.com/…#<original URL>`; this matches ours (layer L1c). */
export function proxyPixelRegex(host: string): string {
  return `^https://[a-z0-9-]+\\.googleusercontent\\.com/.*#https?://${escapeRegex(host)}/t/`;
}

export function buildDnrRules(input: DnrInput): DnrRule[] {
  // DECISIONS D-010: InboxSDK telemetry is blocked whatever the settings say.
  const rules: DnrRule[] = [
    { id: RULE_IDS.inboxSdkApi, priority: 1, action: { type: 'block' }, condition: { requestDomains: ['api.inboxsdk.com'] } },
    {
      id: RULE_IDS.inboxSdkEvents,
      priority: 1,
      action: { type: 'block' },
      condition: { urlFilter: '||pubsub.googleapis.com/v1/projects/mailfoogae/' },
    },
  ];
  const host = trackingHost(input.publicBaseUrl);
  if (!host) return rules;
  if (input.dnrBlocking) {
    // L1: the owner's browser never loads our pixel directly (compose editor, non-proxied views).
    rules.push({
      id: RULE_IDS.directPixel,
      priority: 2,
      action: { type: 'block' },
      condition: { urlFilter: `||${host}/t/`, resourceTypes: ['image'] },
    });
    // L1c: Gmail's proxy copy of our pixel, matched by its #fragment (Spike 3 confirms Chrome sees it).
    if (input.regexSupported) {
      rules.push({
        id: RULE_IDS.proxyPixel,
        priority: 2,
        action: { type: 'block' },
        condition: { regexFilter: proxyPixelRegex(host), resourceTypes: ['image'] },
      });
    }
  }
  // L1b: the owner's own clicks on tracked links still work but are marked as self.
  if (input.selfHeaderName && input.selfHeaderValue) {
    rules.push({
      id: RULE_IDS.selfClick,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [{ header: input.selfHeaderName, operation: 'set', value: input.selfHeaderValue }],
      },
      condition: { urlFilter: `||${host}/c/`, resourceTypes: ['main_frame', 'sub_frame'] },
    });
    // The owner's own document views (viewer page, its fetches and beacons, the download) never count.
    rules.push({
      id: RULE_IDS.selfDocument,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [{ header: input.selfHeaderName, operation: 'set', value: input.selfHeaderValue }],
      },
      condition: { urlFilter: `||${host}/d/`, resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'ping', 'other'] },
    });
  }
  return rules;
}
