// Service worker. InboxSDK's background part injects its page-world script into Gmail (scripting permission).
import '@inboxsdk/core/background.js';
import type { Broadcast } from '../core/messages';
import { isRequest } from '../core/messages';
import { emailIdOfNotification, MUTE_BUTTON, type NotificationSpec } from '../core/notify';
import { ApiClient } from './api';
import { applyDnrRules } from './dnr';
import { createHandlers, dispatch, testConnection, type HandlerDeps } from './handlers';
import { pollActivity, processQueue } from './poller';
import { chromeStateStore, createExclusive } from './storage';

const POLL_ALARM = 'mailpulse-poll';
const CONFIG_MAX_AGE_MS = 5 * 60 * 1000;
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
  for (const spec of specs) {
    await chrome.notifications.create(spec.id, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: spec.title,
      message: spec.message,
      contextMessage: spec.contextMessage,
      priority: 0,
      ...(spec.canMute ? { buttons: [{ title: MUTE_BUTTON }] } : {}),
    });
  }
}

const deps: HandlerDeps = {
  api,
  store,
  now: () => Date.now(),
  newId: () => crypto.randomUUID(),
  exclusive: createExclusive(),
  applyDnr: applyDnrRules,
  broadcast,
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

async function tick(): Promise<void> {
  const state = await store.read();
  if (state.apiToken === null) return;
  if (state.config === null || Date.now() - state.configAt > CONFIG_MAX_AGE_MS || state.connection !== 'ok') {
    await testConnection(deps);
  }
  await deps.exclusive(() => processQueue({ api, store, now: () => Date.now() }));
  await pollActivity({ api, store, notify, broadcast });
}

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
    const { backendUrl } = await store.read();
    const emailId = emailIdOfNotification(notificationId);
    await chrome.tabs.create({ url: emailId ? `${backendUrl}/emails/${emailId}` : `${backendUrl}/activity` });
    await chrome.notifications.clear(notificationId);
  })();
});

/** "Mute this email": no more notifications for it; opens and alerts are still recorded. */
chrome.notifications.onButtonClicked.addListener((notificationId) => {
  const emailId = emailIdOfNotification(notificationId);
  if (!emailId) return;
  void (async () => {
    const muted = await handlers['mp:preferences']({ type: 'mp:preferences', emailId, preferences: { notifications: false } });
    await chrome.notifications.clear(notificationId);
    await chrome.notifications.create(`mp:muted:${emailId}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: muted ? 'Muted' : 'Could not mute',
      message: muted
        ? 'No more notifications for this email. Unmute it in the dashboard.'
        : 'MailPulse is not reachable. Try again later.',
      priority: 0,
    });
  })();
});

start().catch(() => undefined);
