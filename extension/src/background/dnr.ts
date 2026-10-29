import type { ClientConfig } from '../core/api-types';
import { buildDnrRules, proxyPixelRegex, trackingHost } from '../core/dnr';

/** Replaces all dynamic rules with the ones the current backend config asks for. */
export async function applyDnrRules(config: ClientConfig | null): Promise<void> {
  const host = trackingHost(config?.publicBaseUrl ?? null);
  let regexSupported = false;
  if (host) {
    const result = await chrome.declarativeNetRequest.isRegexSupported({ regex: proxyPixelRegex(host) });
    regexSupported = result.isSupported;
  }
  const rules = buildDnrRules({
    publicBaseUrl: config?.publicBaseUrl ?? null,
    dnrBlocking: config?.dnrBlocking ?? true,
    selfHeaderName: config?.selfHeaderName ?? null,
    selfHeaderValue: config?.selfHeaderValue ?? null,
    regexSupported,
  });
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((rule) => rule.id),
    addRules: rules,
  });
}
