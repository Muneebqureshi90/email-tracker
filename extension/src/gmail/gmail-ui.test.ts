import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClientConfig, EmailCard, Mark } from '../core/api-types';
import type { Request, Status } from '../core/messages';
import type { Ask } from './bridge';
import { HoverCard } from './card';
import { GmailEnv } from './env';
import { messageIcon } from './message-views';
import { countIcon, tickIcon } from './rows';
import { DARK_CLASS, luminance, watchGmailTheme } from './theme';

const EMAIL_ID = '7b0f3c52-1d9e-4f1a-9c41-2b9d6f0a1e11';
const MARK: Mark = {
  emailId: EMAIL_ID,
  state: 'OPENED',
  openCount: 3,
  clickCount: 0,
  lastOpenedAt: '2026-10-29T11:48:00Z',
  lastClickedAt: null,
  openStatusUnreliable: false,
};
const CARD: EmailCard = {
  subject: '<b>Quarterly plan</b>',
  recipients: [{ email: 'jane@example.com', name: 'Jane', kind: 'TO' }],
  account: 'me@gmail.com',
  gmailThreadId: null,
  openCount: 3,
  firstOpenedAt: '2026-10-29T06:43:00Z',
  lastOpenedAt: '2026-10-29T11:48:00Z',
  recentOpens: ['2026-10-29T11:48:00Z', '2026-10-29T08:00:00Z', '2026-10-29T06:43:00Z'],
  clickCount: 0,
  lastClickedAt: null,
  alerts: [],
  documents: [],
};

function env(): GmailEnv {
  const status = {
    backendUrl: 'http://127.0.0.1:8090',
    hasToken: true,
    connection: 'ok',
    paused: false,
    config: { timeZone: 'Asia/Karachi' } as ClientConfig,
  } as Status;
  const gmail = new GmailEnv('me@gmail.com', (() => Promise.resolve(status)) as unknown as Ask);
  return gmail;
}

let uninstall: (() => void) | null = null;

afterEach(() => {
  uninstall?.();
  uninstall = null;
  vi.useRealTimers();
  document.body.replaceChildren();
  document.documentElement.classList.remove(DARK_CLASS);
});

describe('Gmail marks', () => {
  it('put ticks and the count in their own 16 px slots next to the date', () => {
    expect(tickIcon(MARK)).toMatchObject({ iconClass: 'mp-slot' });
    expect(tickIcon(MARK)!.iconHtml).toContain('mp-green');
    expect(countIcon(MARK)!.iconHtml).toContain('>3</span>');
    expect(countIcon({ ...MARK, openCount: 1 })).toBeNull();
    expect(tickIcon(null)).toBeNull();
  });

  it('show the same ✓✓ with the count in the open-email view (A6)', () => {
    const icon = messageIcon(MARK);
    expect(icon.iconHtml).toContain('M1 8.6l3 3L10.6 5M7 11.6L13.6 5');
    expect(icon.iconHtml).toContain('<span class="mp-count">3</span>');
    expect(icon.tooltip).toBeUndefined();
  });
});

describe('Gmail theme', () => {
  it('reads light text as a dark or image theme', () => {
    expect(luminance('rgb(32, 33, 36)')).toBeLessThan(0.1);
    expect(luminance('rgba(232, 234, 237, 1)')).toBeGreaterThan(0.7);
    expect(luminance('transparent')).toBeNull();
    const main = document.createElement('div');
    main.setAttribute('role', 'main');
    main.style.color = 'rgb(232, 234, 237)';
    document.body.append(main);
    const stop = watchGmailTheme(document, 60_000);
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
    stop();
  });
});

describe('hover card', () => {
  function setup(card: EmailCard | null = CARD) {
    vi.useFakeTimers({ now: Date.parse('2026-10-29T12:00:00Z') });
    const requests: Request[] = [];
    const ask = ((request: Request) => {
      requests.push(request);
      return Promise.resolve(request.type === 'mp:card' ? card : null);
    }) as unknown as Ask;
    const mark = document.createElement('span');
    mark.className = 'mp-mark';
    mark.dataset.mpEmail = EMAIL_ID;
    mark.tabIndex = 0;
    document.body.append(mark);
    const gmail = env();
    return { gmail, ask, mark, requests };
  }

  it('appears after 300 ms of hover with opens, times and Open in MailPulse, as plain text', async () => {
    const { gmail, ask, mark, requests } = setup();
    await gmail.refresh();
    uninstall = new HoverCard(gmail, ask).install();
    mark.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(200);
    expect(document.querySelector('.mp-card')).toBeNull();
    await vi.advanceTimersByTimeAsync(150);
    const card = document.querySelector<HTMLElement>('.mp-card')!;
    expect(card.getAttribute('role')).toBe('tooltip');
    expect(card.textContent).toContain('Opened 3 times');
    expect(card.textContent).toContain('first today 11:43 · last 12 minutes ago');
    expect(card.textContent).toContain('Latest opens');
    expect(card.querySelector('.mp-card-subject')?.textContent).toBe('<b>Quarterly plan</b>');
    expect(card.querySelector('b')).toBeNull();
    expect(card.querySelector('a')?.getAttribute('href')).toBe(`http://127.0.0.1:8090/emails/${EMAIL_ID}`);
    expect(mark.getAttribute('aria-describedby')).toBe('mp-hover-card');
    expect(requests.filter((request) => request.type === 'mp:card')).toHaveLength(1);

    mark.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(250);
    expect(document.querySelector('.mp-card')).toBeNull();
  });

  it('opens at once on keyboard focus and closes with Escape', async () => {
    const { gmail, ask, mark } = setup(null);
    await gmail.refresh();
    uninstall = new HoverCard(gmail, ask).install();
    mark.focus();
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector('.mp-card')?.textContent).toContain('not reachable');
    mark.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.mp-card')).toBeNull();
  });
});
