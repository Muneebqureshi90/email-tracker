import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Status } from '../core/messages';
import { Options } from '../options/Options';
import { Popup } from '../popup/Popup';
import { checkedText } from './parts';
import { problemsOf } from './problems';

const BASE_STATUS: Status = {
  backendUrl: 'http://127.0.0.1:8090',
  hasToken: true,
  connection: 'ok',
  message: null,
  checkedAt: '2026-10-30T06:40:24Z',
  paused: false,
  notificationsEnabled: true,
  publicCheck: 'up',
  publicCheckedAt: null,
  config: null,
  queued: 0,
  extensionOrigin: 'chrome-extension://pdinoocioohoejhjbeepjdadkkjldgeo',
  appIdSet: true,
};

describe('problems and how to fix them', () => {
  it('explain each broken state with steps', () => {
    expect(problemsOf(BASE_STATUS)).toEqual([]);
    expect(problemsOf({ ...BASE_STATUS, connection: 'offline' })[0]).toMatchObject({ id: 'offline', title: 'MailPulse is not running', action: 'retry' });
    expect(problemsOf({ ...BASE_STATUS, connection: 'unauthorized' })[0]).toMatchObject({ id: 'token', title: 'API token invalid', action: 'settings' });
    expect(problemsOf({ ...BASE_STATUS, publicCheck: 'down' })[0]).toMatchObject({ id: 'public', title: 'Public address down' });
    expect(problemsOf({ ...BASE_STATUS, connection: 'origin-rejected' })[0]!.fix[0]).toContain(BASE_STATUS.extensionOrigin);
    expect(problemsOf({ ...BASE_STATUS, connection: 'unconfigured' })[0]!.id).toBe('setup');
    expect(problemsOf({ ...BASE_STATUS, paused: true, appIdSet: false }).map((problem) => problem.id)).toEqual(['paused', 'appId']);
  });

  it('say when the connection was last checked', () => {
    const now = Date.parse('2026-10-30T06:42:24Z');
    expect(checkedText(null, now)).toBe('Not checked yet');
    expect(checkedText('2026-10-30T06:40:24Z', now)).toContain('(2 min ago)');
    expect(checkedText('2026-10-30T06:42:20Z', now)).toContain('(just now)');
  });
});

/** A stand-in for the extension APIs the pages use: messages to the worker and storage events. */
function fakeChrome(answer: (request: Request) => unknown) {
  const listeners = new Set<() => void>();
  const requests: Request[] = [];
  const chromeApi = {
    runtime: {
      sendMessage: (request: Request) => {
        requests.push(request);
        return Promise.resolve(answer(request));
      },
      openOptionsPage: vi.fn(),
    },
    storage: { onChanged: { addListener: (listener: () => void) => listeners.add(listener), removeListener: (listener: () => void) => listeners.delete(listener) } },
    tabs: { create: vi.fn() },
  };
  vi.stubGlobal('chrome', chromeApi);
  return { requests, changeStorage: () => listeners.forEach((listener) => listener()) };
}

let root: Root | null = null;

async function render(element: ReactElement): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(element);
    await Promise.resolve();
  });
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('options page', () => {
  it('Test connection re-checks now, shows a busy state and the result, and updates Last checked', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let checkedAt = '2026-10-30T06:40:24Z';
    let release: () => void = () => undefined;
    const { requests } = fakeChrome((request) => {
      if (request.type === 'mp:testConnection') {
        return new Promise((resolve) => {
          release = () => {
            checkedAt = '2026-10-30T07:46:00Z';
            resolve({ ...BASE_STATUS, checkedAt });
          };
        });
      }
      return { ...BASE_STATUS, checkedAt };
    });
    const page = await render(<Options />);
    const before = page.querySelector('[data-testid="checked"]')!.textContent;
    const button = Array.from(page.querySelectorAll('button')).find((candidate) => candidate.textContent === 'Test connection')!;
    await act(async () => {
      button.click();
      await Promise.resolve();
    });
    expect(button.textContent).toBe('Testing…');
    expect(button.disabled).toBe(true);
    await act(async () => {
      release();
      await Promise.resolve();
    });
    expect(requests.some((request) => request.type === 'mp:testConnection')).toBe(true);
    expect(page.querySelector('.result')?.textContent).toContain('Connected');
    expect(page.querySelector('[data-testid="checked"]')!.textContent).not.toBe(before);
    expect(button.textContent).toBe('Test connection');
  });

  it('refreshes Last checked when a background check writes to storage', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let checkedAt = '2026-10-30T06:40:24Z';
    const chromeFake = fakeChrome(() => ({ ...BASE_STATUS, checkedAt }));
    const page = await render(<Options />);
    const before = page.querySelector('[data-testid="checked"]')!.textContent;
    checkedAt = '2026-10-30T06:41:30Z';
    await act(async () => {
      chromeFake.changeStorage();
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    expect(page.querySelector('[data-testid="checked"]')!.textContent).not.toBe(before);
  });
});

describe('popup', () => {
  it('shows the problem with How to fix, quick toggles and recent activity', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    fakeChrome((request) => (request.type === 'mp:status' ? { ...BASE_STATUS, publicCheck: 'down' } : []));
    const page = await render(<Popup />);
    expect(page.querySelector('.problem h2')?.textContent).toBe('Public address down');
    expect(page.querySelector('summary')?.textContent).toBe('How to fix');
    expect(Array.from(page.querySelectorAll('[role="switch"]'))).toHaveLength(2);
    expect(page.textContent).toContain('Recent activity');
  });
});
