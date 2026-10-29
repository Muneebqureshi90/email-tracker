import { describe, expect, it } from 'vitest';
import type { ActivityItem, Mark } from './api-types';
import { buildDnrRules, proxyPixelRegex, RULE_IDS } from './dnr';
import { markIcon, markTooltip, ICON_OPENED, ICON_SENT } from './marks';
import { emailIdOfNotification, notificationsFor } from './notify';
import { backoffMs, dueCalls, enqueue, MAX_AGE_MS, pruneExpired, settle } from './queue';
import { isSelfOnly } from './recipients';
import { relativeTime } from './time';

const NOW = Date.parse('2026-10-29T12:00:00Z');
const EMAIL_ID = '7b0f3c52-1d9e-4f1a-9c41-2b9d6f0a1e11';

function item(id: number, overrides: Partial<ActivityItem> = {}): ActivityItem {
  return {
    id,
    kind: 'OPEN',
    emailId: EMAIL_ID,
    subject: 'Quarterly plan',
    recipients: 'Jane Doe',
    occurredAt: '2026-10-29T11:59:00Z',
    source: 'GMAIL_PROXY',
    linkUrl: null,
    shouldNotify: true,
    ...overrides,
  };
}

describe('DNR rules', () => {
  const base = { selfHeaderName: 'X-MailPulse-Self', selfHeaderValue: 'abc123', regexSupported: true };

  it('always block InboxSDK telemetry, even without a backend', () => {
    const rules = buildDnrRules({ ...base, publicBaseUrl: null, dnrBlocking: true });
    expect(rules.map((rule) => rule.id)).toEqual([RULE_IDS.inboxSdkApi, RULE_IDS.inboxSdkEvents]);
  });

  it('block direct and proxied self-loads of our pixel and mark own clicks', () => {
    const rules = buildDnrRules({ ...base, publicBaseUrl: 'https://pc.tail1234.ts.net', dnrBlocking: true });
    const byId = new Map(rules.map((rule) => [rule.id, rule]));
    expect(byId.get(RULE_IDS.directPixel)?.condition.urlFilter).toBe('||pc.tail1234.ts.net/t/');
    expect(byId.get(RULE_IDS.proxyPixel)?.condition.regexFilter).toBe(proxyPixelRegex('pc.tail1234.ts.net'));
    expect(byId.get(RULE_IDS.selfClick)?.action).toEqual({
      type: 'modifyHeaders',
      requestHeaders: [{ header: 'X-MailPulse-Self', operation: 'set', value: 'abc123' }],
    });
  });

  it('switch the blocking rules off with the dnrBlocking setting', () => {
    const rules = buildDnrRules({ ...base, publicBaseUrl: 'https://pc.tail1234.ts.net', dnrBlocking: false });
    expect(rules.map((rule) => rule.id)).toEqual([RULE_IDS.inboxSdkApi, RULE_IDS.inboxSdkEvents, RULE_IDS.selfClick]);
  });

  it('match only Gmail proxy URLs that carry our pixel in the fragment', () => {
    const regex = new RegExp(proxyPixelRegex('pc.tail1234.ts.net'));
    expect(regex.test('https://ci3.googleusercontent.com/meips/abc=s0#https://pc.tail1234.ts.net/t/AbCdEfGhIjKlMnOpQrStUvWx.gif')).toBe(true);
    expect(regex.test('https://ci3.googleusercontent.com/meips/abc=s0#https://pcXtail1234.ts.net/t/x.gif')).toBe(false);
    expect(regex.test('https://evil.example/x#https://pc.tail1234.ts.net/t/x.gif')).toBe(false);
  });
});

describe('notifications', () => {
  it('one per item up to three, plain text with the source', () => {
    const specs = notificationsFor([item(1), item(2, { kind: 'CLICK', linkUrl: 'https://docs.example/a', shouldNotify: true })]);
    expect(specs).toHaveLength(2);
    expect(specs[0]).toMatchObject({ title: 'Opened: Quarterly plan', message: 'Jane Doe', contextMessage: 'via Gmail', emailId: EMAIL_ID });
    expect(specs[1]).toMatchObject({ title: 'Clicked: Quarterly plan', contextMessage: 'Link to docs.example' });
    expect(emailIdOfNotification(specs[0]!.id)).toBe(EMAIL_ID);
  });

  it('skip muted items and group more than three', () => {
    expect(notificationsFor([item(1, { shouldNotify: false })])).toEqual([]);
    const grouped = notificationsFor([item(1), item(2), item(3), item(4), item(5, { subject: null })]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({ title: '5 new opens and clicks', emailId: null });
    expect(grouped[0]!.message.split('\n')).toEqual(['Opened: Quarterly plan', 'Opened: Quarterly plan', 'Opened: (no subject)']);
    expect(emailIdOfNotification(grouped[0]!.id)).toBeNull();
  });
});

describe('retry queue', () => {
  it('keeps only the latest update per email and retries with backoff', () => {
    let queue = enqueue([], { method: 'PATCH', path: '/api/emails/a', body: { status: 'SENT' } }, NOW, 'q1');
    queue = enqueue(queue, { method: 'PATCH', path: '/api/emails/a', body: { status: 'CANCELLED' } }, NOW, 'q2');
    expect(queue).toHaveLength(1);
    expect(queue[0]!.body).toEqual({ status: 'CANCELLED' });
    expect(dueCalls(queue, NOW)).toHaveLength(0);
    expect(dueCalls(queue, NOW + 30_000)).toHaveLength(1);

    queue = settle(queue, 'q2', 'retry', NOW + 30_000);
    expect(queue[0]!.nextAt).toBe(NOW + 30_000 + backoffMs(1));
    expect(backoffMs(20)).toBe(60 * 60 * 1000);
    expect(settle(queue, 'q2', 'done', NOW)).toHaveLength(0);
  });

  it('drops calls older than seven days', () => {
    const queue = enqueue([], { method: 'PATCH', path: '/api/emails/b', body: {} }, NOW, 'q1');
    expect(pruneExpired(queue, NOW + MAX_AGE_MS + 1)).toHaveLength(0);
  });
});

describe('text helpers', () => {
  const mark: Mark = {
    emailId: EMAIL_ID,
    state: 'OPENED',
    openCount: 3,
    clickCount: 2,
    lastOpenedAt: '2026-10-29T11:00:00Z',
    lastClickedAt: null,
    openStatusUnreliable: false,
  };

  it('describe marks as in PLAN §4.5', () => {
    expect(markTooltip(mark, NOW)).toBe('MailPulse: Opened 3 times, last 1 hour ago · 2 clicks');
    expect(markIcon(mark)).toBe(ICON_OPENED);
    const unopened = { ...mark, state: 'SENT' as const, openCount: 0, clickCount: 0, lastOpenedAt: null };
    expect(markTooltip(unopened, NOW)).toBe('MailPulse: Sent, not opened yet');
    expect(markIcon(unopened)).toBe(ICON_SENT);
  });

  it('format relative times', () => {
    expect(relativeTime('2026-10-29T11:59:30Z', NOW)).toBe('just now');
    expect(relativeTime('2026-10-29T11:55:00Z', NOW)).toBe('5 minutes ago');
    expect(relativeTime('2026-10-28T12:00:00Z', NOW)).toBe('1 day ago');
    expect(relativeTime('not a date', NOW)).toBe('');
  });

  it('detect emails sent only to yourself', () => {
    expect(isSelfOnly(['Me@Gmail.com'], 'me@gmail.com')).toBe(true);
    expect(isSelfOnly(['me@gmail.com', 'jane@example.com'], 'me@gmail.com')).toBe(false);
    expect(isSelfOnly([], 'me@gmail.com')).toBe(false);
  });
});
