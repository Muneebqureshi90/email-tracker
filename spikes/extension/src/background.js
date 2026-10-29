// Throwaway MailPulse Step 1 spike: service worker. Not product code.
// Forwards content-script logs to the local logger, manages test DNR rules, records what the
// browser exposes about Gmail proxy URLs, and checks the worker can reach 127.0.0.1.
import '@inboxsdk/core/background.js';

const LOG_BASE = __LOG_BASE__;
const PUBLIC_BASE = __PUBLIC_BASE__;
const HOST = new URL(PUBLIC_BASE).host;
const DEFAULT_SETTINGS = { insertPixel: true, sendMode: 'presync', dnrMode: 'observe', stripQuoted: true };

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PROXY_REGEX = `^https://[a-z0-9-]+\\.googleusercontent\\.com/.*#https?://${escapeRegex(HOST)}/t/`;

const status = { loggerOk: null, loggerError: null, dnrMatches: 0, telemetryBlocked: 0, regexSupported: null };
const saveStatus = () => chrome.storage.local.set({ status: { ...status, updatedAt: Date.now() } });

async function post(entry) {
  try {
    const response = await fetch(`${LOG_BASE}/ext-log`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...entry, swAtMs: Date.now() }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (status.loggerOk !== true) {
      status.loggerOk = true;
      status.loggerError = null;
      saveStatus();
    }
  } catch (err) {
    status.loggerOk = false;
    status.loggerError = String(err?.message ?? err);
    saveStatus();
  }
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'spike-log') post({ ...message.entry, tabId: sender.tab?.id ?? null });
  // No return value: InboxSDK's own listener answers its page-world injection message.
});

async function applyDnr(mode) {
  const rules = [
    { id: 1, priority: 1, action: { type: 'block' }, condition: { requestDomains: ['api.inboxsdk.com'] } },
    { id: 2, priority: 1, action: { type: 'block' }, condition: { urlFilter: '||pubsub.googleapis.com/v1/projects/mailfoogae/' } },
  ];
  if (mode === 'observe' || mode === 'block') {
    const action = { type: mode === 'block' ? 'block' : 'allow' };
    rules.push(
      { id: 10, priority: 2, action, condition: { regexFilter: PROXY_REGEX, resourceTypes: ['image'] } },
      { id: 11, priority: 2, action, condition: { urlFilter: `||${HOST}/t/`, resourceTypes: ['image'] } },
    );
  }
  const old = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: old.map((r) => r.id), addRules: rules });
  post({ ev: 'dnr.applied', mode, ruleIds: rules.map((r) => r.id), proxyRegex: PROXY_REGEX });
}

async function init() {
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings) await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  await applyDnr((settings ?? DEFAULT_SETTINGS).dnrMode);
  chrome.declarativeNetRequest.isRegexSupported({ regex: PROXY_REGEX }, (result) => {
    status.regexSupported = result;
    saveStatus();
    post({ ev: 'dnr.regexSupported', ...result });
  });
  try {
    const response = await fetch(`${LOG_BASE}/health`);
    status.loggerOk = response.ok;
    status.loggerError = response.ok ? null : `HTTP ${response.status}`;
  } catch (err) {
    status.loggerOk = false;
    status.loggerError = String(err?.message ?? err);
  }
  saveStatus();
  post({ ev: 'lna.health', ok: status.loggerOk, error: status.loggerError });
}

chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onStartup.addListener(init);
chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings?.newValue) applyDnr(changes.settings.newValue.dnrMode);
});

chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
  const ruleId = info.rule.ruleId;
  if (ruleId <= 2) status.telemetryBlocked += 1;
  else status.dnrMatches += 1;
  saveStatus();
  post({
    ev: 'dnr.match',
    ruleId,
    url: info.request.url,
    urlHasFragment: info.request.url.includes('#'),
    type: info.request.type,
    method: info.request.method,
    initiator: info.request.initiator ?? null,
  });
});

// Observation only: does webRequest see the #fragment of Gmail proxy image URLs?
const WATCHED = ['https://*.googleusercontent.com/*', 'https://api.inboxsdk.com/*', 'https://pubsub.googleapis.com/*', `https://${HOST}/*`];
let proxyWithoutFragment = 0;
let lastProxyReport = 0;
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.url.includes('googleusercontent.com')) {
      if (details.url.includes('#') && details.url.includes(HOST)) {
        post({ ev: 'webRequest.proxyImage', url: details.url, type: details.type, initiator: details.initiator ?? null });
      } else if (details.type === 'image' && /\/(meips|proxy)\//.test(details.url)) {
        proxyWithoutFragment += 1;
        if (Date.now() - lastProxyReport > 10_000) {
          lastProxyReport = Date.now();
          post({ ev: 'webRequest.proxyWithoutFragment', count: proxyWithoutFragment });
        }
      }
      return;
    }
    post({ ev: 'webRequest.before', url: details.url, type: details.type, method: details.method, initiator: details.initiator ?? null });
  },
  { urls: WATCHED },
);
chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.url.includes('googleusercontent.com')) return;
    post({ ev: 'webRequest.completed', url: details.url, statusCode: details.statusCode, fromCache: details.fromCache });
  },
  { urls: WATCHED },
);
chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    if (details.url.includes('googleusercontent.com') && !details.url.includes(HOST)) return;
    post({ ev: 'webRequest.error', url: details.url, error: details.error });
  },
  { urls: WATCHED },
);
