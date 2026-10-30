// Service worker. InboxSDK's background part injects its page-world script into Gmail (scripting permission).
import '@inboxsdk/core/background.js';
import type { Broadcast } from '../core/messages';
import { isRequest } from '../core/messages';
import { BUTTON_TITLES, dashboardPath, gmailThreadUrl, type NotificationSpec, type NotificationTarget } from '../core/notify';
import { ApiClient } from './api';
import { applyDnrRules } from './dnr';
import { createHandlers, dispatch, testConnection, type HandlerDeps } from './handlers';
import { pollActivity, processQueue } from './poller';
import { chromeStateStore, createExclusive } from './storage';

const POLL_ALARM = 'mailpulse-poll';
const CONFIG_MAX_AGE_MS = 5 * 60 * 1000;
/** Visible Gmail tabs ask every 5 s; checks closer together than this are skipped. */
const MIN_POLL_GAP_MS = 4000;
const MAX_NOTIFICATION_TARGETS = 50;
const PLACEHOLDER_APP_ID = 'sdk_mailpulse_unregistered';

const store = chromeStateStore;
const api = new ApiClient(async () => {
  const state = await store.read();
  return { backendUrl: state.backendUrl, apiToken: state.apiToken };
});

async function broadcast(message: Broadcast): Promise<void> {
  const tabs = await chrome.tabs.query({ url: 'https://mail.google.com/*' });
  await Promise.all(
    tabs.map((tab) => (tab.id === undefined ? Promise.resolve() : chrome.tabs.sendMessage(tab.id, message).catch(() => undefined))),
  );
}

async function notify(specs: NotificationSpec[]): Promise<void> {
  if (specs.length === 0) return;
  const { notificationTargets } = await store.read();
  const targets = { ...notificationTargets };
  for (const spec of specs) {
    await chrome.notifications.create(spec.id, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL(`icons/n-${spec.icon}.png`),
      title: spec.title,
      message: spec.message,
      contextMessage: spec.contextMessage,
      priority: 0,
      ...(spec.buttons.length > 0 ? { buttons: spec.buttons.map((button) => ({ title: BUTTON_TITLES[button] })) } : {}),
    });
    targets[spec.id] = { target: spec.target, buttons: spec.buttons };
  }
  const ids = Object.keys(targets);
  for (const id of ids.slice(0, Math.max(0, ids.length - MAX_NOTIFICATION_TARGETS))) delete targets[id];
  await store.write({ notificationTargets: targets });
}

/** Never waits longer than `ms`: a hanging network call must not stall the checks behind it. */
function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

async function probePublic(url: string): Promise<boolean> {
  const check = async () => {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
      });
      return response.type === 'opaqueredirect' || (response.status >= 200 && response.status < 500);
    } catch {
      return false;
    }
  };
  return within(check(), 6000, false);
}

let polling: Promise<void> | null = null;
let pollingSince = 0;
let lastAttemptAt = 0;
let lastConfigAttemptAt = 0;

/** One check: config when stale or changed, queued send updates, then the activity feed. */
function tick(): Promise<void> {
  // A check stuck for over a minute (a call that never settled) must not block every later check.
  if (polling && Date.now() - pollingSince > 60_000) polling = null;
  if (!polling) pollingSince = Date.now();
  polling ??= (async () => {
    try {
      const state = await store.read();
      const now = Date.now();
      if (state.apiToken === null || now - Math.max(state.lastPollAt, lastAttemptAt) < MIN_POLL_GAP_MS) return;
      lastAttemptAt = now;
      const stale = state.config === null || now - state.configAt > CONFIG_MAX_AGE_MS || state.connection !== 'ok';
      // While the backend is down, ask for the config at most every 30 s (the alarm's pace).
      if (stale && now - lastConfigAttemptAt >= 30_000) {
        lastConfigAttemptAt = now;
        await testConnection(deps);
      }
      await deps.exclusive(() => processQueue({ api, store, now: () => Date.now() }));
      await pollActivity({
        api,
        store,
        now: () => Date.now(),
        notify,
        broadcast,
        refreshConfig: async () => {
          await testConnection(deps);
        },
      });
    } finally {
      polling = null;
    }
  })();
  return polling;
}

const deps: HandlerDeps = {
  api,
  store,
  now: () => Date.now(),
  newId: () => crypto.randomUUID(),
  exclusive: createExclusive(),
  applyDnr: applyDnrRules,
  broadcast,
  probePublic,
  poll: () => tick().catch(() => undefined),
  extensionOrigin: `chrome-extension://${chrome.runtime.id}`,
  appIdSet: __APP_ID__ !== PLACEHOLDER_APP_ID,
};
const handlers = createHandlers(deps);

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  // Only our own pages and content scripts; InboxSDK's listener answers its own messages.
  if (sender.id !== chrome.runtime.id || !isRequest(message)) return false;
  dispatch(handlers, message).then(sendResponse, () => sendResponse(null));
  return true;
});

async function start(): Promise<void> {
  // Content scripts get everything through messages; only extension pages may read the token.
  await chrome.storage.local.setAccessLevel({ accessLevel: chrome.storage.AccessLevel.TRUSTED_CONTEXTS });
  if (!(await chrome.alarms.get(POLL_ALARM))) {
    await chrome.alarms.create(POLL_ALARM, { periodInMinutes: 0.5 });
  }
  const state = await store.read();
  await applyDnrRules(state.config);
  if (state.apiToken !== null) await testConnection(deps);
}

async function targetOf(notificationId: string): Promise<{ target: NotificationTarget; buttons: string[] } | null> {
  const { notificationTargets } = await store.read();
  return notificationTargets[notificationId] ?? null;
}

async function forget(notificationId: string): Promise<void> {
  const { notificationTargets } = await store.read();
  if (!(notificationId in notificationTargets)) return;
  const targets = { ...notificationTargets };
  delete targets[notificationId];
  await store.write({ notificationTargets: targets });
}

/** The Gmail thread in the right account, or the MailPulse page when there is no thread. */
async function openTarget(target: NotificationTarget | null, preferGmail: boolean): Promise<void> {
  if (preferGmail && target?.threadId && target.account) {
    await chrome.tabs.create({ url: gmailThreadUrl(target.account, target.threadId) });
    return;
  }
  const { backendUrl } = await store.read();
  await chrome.tabs.create({
    url: `${backendUrl}${dashboardPath(target ?? { emailId: null, account: null, threadId: null, documentId: null })}`,
  });
}

async function mute(emailId: string): Promise<void> {
  const muted = await handlers['mp:preferences']({ type: 'mp:preferences', emailId, preferences: { notifications: false } });
  await chrome.notifications.create(`mp:muted:${emailId}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: muted ? 'Muted' : 'Could not mute',
    message: muted ? 'No more notifications for this email. Unmute it in the dashboard.' : 'MailPulse is not reachable. Try again later.',
    priority: 0,
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) tick().catch(() => undefined);
});
chrome.runtime.onInstalled.addListener(() => {
  start().catch(() => undefined);
});
chrome.runtime.onStartup.addListener(() => {
  start().catch(() => undefined);
});
chrome.notifications.onClicked.addListener((notificationId) => {
  void (async () => {
    const entry = await targetOf(notificationId);
    await openTarget(entry?.target ?? null, true);
    await chrome.notifications.clear(notificationId);
    await forget(notificationId);
  })();
});
/** "Open in Gmail" and "Mute this email" (mute: no more notifications; opens and alerts are still recorded). */
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  void (async () => {
    const entry = await targetOf(notificationId);
    const button = entry?.buttons[buttonIndex];
    await chrome.notifications.clear(notificationId);
    await forget(notificationId);
    if (button === 'gmail') await openTarget(entry?.target ?? null, true);
    if (button === 'mute' && entry?.target.emailId) await mute(entry.target.emailId);
  })();
});
chrome.notifications.onClosed.addListener((notificationId) => {
  void forget(notificationId);
});

start().catch(() => undefined);
