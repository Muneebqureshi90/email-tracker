import type { ComposeButtonDescriptor, ComposeView } from '@inboxsdk/core';
import type { Observable } from 'kefir';
import { describe, expect, it } from 'vitest';
import type { ClientConfig } from '../core/api-types';
import type { Request, Status } from '../core/messages';
import { findPixels } from '../core/pixel';
import type { Ask } from './bridge';
import { ComposeSession } from './compose';
import { GmailEnv } from './env';

const BASE = 'https://pc.tail1234.ts.net';
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWx';
const EMAIL_ID = '7b0f3c52-1d9e-4f1a-9c41-2b9d6f0a1e11';
const CONFIG: ClientConfig = {
  publicBaseUrl: BASE,
  selfHeaderName: 'X-MailPulse-Self',
  selfHeaderValue: 'secret',
  trackingDefault: true,
  linkTrackingDefault: false,
  sendMode: 'PRESYNC',
  dnrBlocking: true,
  trackConfidential: true,
  selfViewWindowSeconds: 30,
  followUpHours: 48,
};

type Handler = (data?: unknown) => void;

/** The parts of InboxSDK's ComposeView that ComposeSession uses. */
class FakeCompose {
  readonly body = document.createElement('div');
  readonly handlers = new Map<string, Handler>();
  button: ComposeButtonDescriptor | null = null;
  statusBar = document.createElement('div');
  to = [{ emailAddress: 'jane@example.com', name: 'Jane' }];
  sends = 0;

  constructor(html = '<div>Hello Jane</div>') {
    this.body.append(...Array.from(new DOMParser().parseFromString(html, 'text/html').body.childNodes));
    document.body.append(this.body);
  }
  getBodyElement = () => this.body;
  getSubject = () => 'Quarterly plan';
  getToRecipients = () => this.to;
  getCcRecipients = () => [];
  getBccRecipients = () => [];
  addButton = (descriptor: Observable<ComposeButtonDescriptor, never>) => {
    descriptor.onValue((value) => (this.button = value));
  };
  addStatusBar = () => ({ el: this.statusBar });
  status = () => this.statusBar.querySelector('span')?.textContent ?? '';
  on = (event: string, handler: Handler) => {
    this.handlers.set(event, handler);
  };
  send = () => {
    this.sends++;
    this.presend();
  };
  presend(): { cancelled: boolean } {
    const event = { cancelled: false, cancel: () => (event.cancelled = true) };
    this.handlers.get('presending')!(event);
    return event;
  }
  fire(event: string, data?: unknown) {
    this.handlers.get(event)!(data);
  }
  sentEvent() {
    this.fire('sent', { getMessageID: () => Promise.resolve('18a1b2c3d4e5f607'), getThreadID: () => Promise.resolve('18a1b2c3d4e5f600') });
  }
}

function status(config: ClientConfig = CONFIG): Status {
  return {
    backendUrl: 'http://127.0.0.1:8080',
    hasToken: true,
    connection: 'ok',
    message: null,
    checkedAt: null,
    paused: false,
    config,
    queued: 0,
    extensionOrigin: 'chrome-extension://test',
    appIdSet: true,
  };
}

/** A fake service worker: answers requests and records them. `register` decides when registration finishes. */
function fakeWorker(options: { config?: ClientConfig; register?: () => Promise<unknown>; lookup?: unknown } = {}) {
  // Test-only stand-in for the service worker.
  const requests: Request[] = [];
  const answer = (request: Request): Promise<unknown> => {
    requests.push(request);
    switch (request.type) {
      case 'mp:status':
        return Promise.resolve(status(options.config));
      case 'mp:register':
        return options.register?.() ?? Promise.resolve({ id: EMAIL_ID, pixelUrl: `${BASE}/t/${TOKEN}.gif` });
      case 'mp:lookupToken':
        return Promise.resolve(options.lookup ?? null);
      case 'mp:update':
        return Promise.resolve({ delivered: true, queued: false });
      case 'mp:registerLinks':
        return Promise.resolve({
          links: request.urls.map((url, index) => ({ linkId: `link-${index}`, originalUrl: url, trackedUrl: `${BASE}/c/LinkToken${index}xxxxxxxxxxxxxxx` })),
          rejected: [],
        });
      default:
        return Promise.resolve(true);
    }
  };
  return { ask: answer as unknown as Ask, requests };
}

async function session(compose: FakeCompose, worker: ReturnType<typeof fakeWorker>) {
  const env = new GmailEnv('Me@Gmail.com', worker.ask);
  await env.refresh();
  new ComposeSession(compose as unknown as ComposeView, env, worker.ask, {
    newClientRef: () => '0b8f2c1a-3d4e-4f5a-8b6c-7d8e9f0a1b2c',
    linkScanDelayMs: 0,
  }).start();
  await flush();
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const pixels = (compose: FakeCompose) => findPixels(compose.body, BASE);

describe('ComposeSession', () => {
  it('registers while composing, inserts the pixel at send and reports the send', async () => {
    const compose = new FakeCompose();
    const worker = fakeWorker();
    await session(compose, worker);
    expect(worker.requests.find((r) => r.type === 'mp:register')).toMatchObject({ account: 'me@gmail.com' });
    expect(compose.status()).toBe('MailPulse: tracking on');

    expect(compose.presend().cancelled).toBe(false);
    expect(pixels(compose).map((p) => p.token)).toEqual([TOKEN]);
    compose.sentEvent();
    await flush();
    expect(worker.requests.find((r) => r.type === 'mp:update')).toMatchObject({
      emailId: EMAIL_ID,
      update: {
        status: 'SENT',
        gmailMessageId: '18a1b2c3d4e5f607',
        gmailThreadId: '18a1b2c3d4e5f600',
        subject: 'Quarterly plan',
        recipients: [{ email: 'jane@example.com', name: 'Jane', kind: 'TO' }],
      },
    });
  });

  it('sends untracked when registration has not finished (fail open, no waiting)', async () => {
    const compose = new FakeCompose();
    await session(compose, fakeWorker({ register: () => new Promise(() => undefined) }));
    expect(compose.status()).toBe('MailPulse: connecting…');
    expect(compose.presend().cancelled).toBe(false);
    expect(pixels(compose)).toHaveLength(0);
  });

  it('says so when the backend cannot be reached', async () => {
    const compose = new FakeCompose();
    await session(compose, fakeWorker({ register: () => Promise.resolve(null) }));
    expect(compose.status()).toContain('not reachable');
    compose.presend();
    expect(pixels(compose)).toHaveLength(0);
  });

  it('does not track emails to yourself, or when switched off, but still strips quoted pixels', async () => {
    const self = new FakeCompose();
    self.to = [{ emailAddress: 'me@gmail.com', name: 'Me' }];
    await session(self, fakeWorker());
    self.presend();
    expect(pixels(self)).toHaveLength(0);

    const quoted = new FakeCompose(`<div>Reply</div><div class="gmail_quote"><img src="${BASE}/t/Zz9_-Zz9_-Zz9_-Zz9_-Zz9_.gif"></div>`);
    const worker = fakeWorker();
    await session(quoted, worker);
    expect(worker.requests.find((r) => r.type === 'mp:selfView')).toMatchObject({ context: 'COMPOSE' });
    quoted.button!.onClick({} as never);
    expect(quoted.status()).toBe('MailPulse: this email will not be tracked');
    quoted.presend();
    expect(pixels(quoted)).toHaveLength(0);
  });

  it('skips confidential-mode emails when that setting is off', async () => {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('role', 'dialog');
    const compose = new FakeCompose();
    wrapper.append(compose.body, 'Content expires Nov 5, 2026');
    document.body.append(wrapper);
    await session(compose, fakeWorker({ config: { ...CONFIG, trackConfidential: false } }));
    compose.presend();
    expect(pixels(compose)).toHaveLength(0);
  });

  it('adopts its own pixel after Undo Send instead of registering a new email', async () => {
    const compose = new FakeCompose(`<div><img src="${BASE}/t/${TOKEN}.gif">Hello</div>`);
    const worker = fakeWorker({ lookup: { id: EMAIL_ID, status: 'CANCELLED' } });
    await session(compose, worker);
    expect(worker.requests.some((r) => r.type === 'mp:register')).toBe(false);
    compose.presend();
    expect(pixels(compose).map((p) => p.token)).toEqual([TOKEN]);
  });

  it('reports CANCELLED when Undo Send follows the send', async () => {
    const compose = new FakeCompose();
    const worker = fakeWorker();
    await session(compose, worker);
    compose.presend();
    compose.sentEvent();
    await flush();
    compose.fire('sendCanceled');
    await flush();
    const updates = worker.requests.filter((r) => r.type === 'mp:update');
    expect(updates.at(-1)).toMatchObject({ update: { status: 'CANCELLED' } });
  });

  it('cancel-and-resend mode cancels, adds the pixel, then sends once more', async () => {
    const compose = new FakeCompose();
    await session(compose, fakeWorker({ config: { ...CONFIG, sendMode: 'CANCEL_RESEND' } }));
    expect(compose.presend().cancelled).toBe(true);
    await flush();
    expect(compose.sends).toBe(1);
    expect(pixels(compose)).toHaveLength(1);
  });

  it('marks scheduled sends as SCHEDULED', async () => {
    const compose = new FakeCompose();
    const worker = fakeWorker();
    await session(compose, worker);
    compose.fire('scheduleSendMenuOpening', { cancel: () => undefined });
    expect(pixels(compose)).toHaveLength(1);
    compose.fire('destroy', { messageID: null, closedByInboxSDK: false });
    await flush();
    expect(worker.requests.find((r) => r.type === 'mp:update')).toMatchObject({ update: { status: 'SCHEDULED' } });
  });
});

describe('ComposeSession extras (Phase 5)', () => {
  const html =
    '<div>See <a href="https://example.com/doc">the doc</a> and <a href="https://example.com/raw">https://example.com/raw</a></div>' +
    '<div class="gmail_quote"><a href="https://example.com/old">old</a></div>';

  it('tracks links of the new text only and reports the ones used', async () => {
    const compose = new FakeCompose(html);
    const worker = fakeWorker({ config: { ...CONFIG, linkTrackingDefault: true } });
    await session(compose, worker);
    compose.fire('bodyChanged');
    await flush();
    await flush();
    expect(worker.requests.find((r) => r.type === 'mp:registerLinks')).toMatchObject({ emailId: EMAIL_ID, urls: ['https://example.com/doc'] });

    compose.presend();
    const hrefs = Array.from(compose.body.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual([`${BASE}/c/LinkToken0xxxxxxxxxxxxxxx`, 'https://example.com/raw', 'https://example.com/old']);
    compose.sentEvent();
    await flush();
    expect(worker.requests.find((r) => r.type === 'mp:update')).toMatchObject({ update: { usedLinkIds: ['link-0'] } });
  });

  it('leaves links alone while link tracking is off (the default)', async () => {
    const compose = new FakeCompose(html);
    const worker = fakeWorker();
    await session(compose, worker);
    compose.fire('bodyChanged');
    await flush();
    compose.presend();
    expect(worker.requests.some((r) => r.type === 'mp:registerLinks')).toBe(false);
    expect(compose.body.querySelector('a')?.getAttribute('href')).toBe('https://example.com/doc');
  });

  it('saves the follow-up time chosen in the compose window', async () => {
    const compose = new FakeCompose();
    const worker = fakeWorker();
    await session(compose, worker);
    const select = compose.statusBar.querySelector('select')!;
    expect(select.options[0]!.textContent).toBe('default (48 h)');
    select.value = '72';
    select.dispatchEvent(new Event('change'));
    await flush();
    expect(worker.requests.find((r) => r.type === 'mp:preferences')).toMatchObject({ emailId: EMAIL_ID, preferences: { followUpHours: 72 } });
  });
});
