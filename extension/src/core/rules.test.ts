import { describe, expect, it } from 'vitest';
import type { ActivityItem, EmailCard, Mark } from './api-types';
import { buildDnrRules, proxyPixelRegex, RULE_IDS } from './dnr';
import { cardContent, countHtml, markHtml, markView } from './marks';
import { dashboardPath, gmailThreadUrl, notificationsFor } from './notify';
import { backoffMs, dueCalls, enqueue, MAX_AGE_MS, pruneExpired, settle } from './queue';
import { isSelfOnly } from './recipients';
import { formatDuration, formatWhen, inQuietHours, ordinal, relativeTime, shortDuration } from './time';

const NOW = Date.parse('2026-10-29T12:00:00Z');
const EMAIL_ID = '7b0f3c52-1d9e-4f1a-9c41-2b9d6f0a1e11';
const OTHER_ID = '9c41ab52-1d9e-4f1a-9c41-2b9d6f0a1e22';

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
    alertType: null,
    alertText: null,
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
    expect(rules.map((rule) => rule.id)).toEqual([RULE_IDS.inboxSdkApi, RULE_IDS.inboxSdkEvents, RULE_IDS.selfClick, RULE_IDS.selfDocument]);
  });

  it('match only Gmail proxy URLs that carry our pixel in the fragment', () => {
    const regex = new RegExp(proxyPixelRegex('pc.tail1234.ts.net'));
    expect(regex.test('https://ci3.googleusercontent.com/meips/abc=s0#https://pc.tail1234.ts.net/t/AbCdEfGhIjKlMnOpQrStUvWx.gif')).toBe(true);
    expect(regex.test('https://ci3.googleusercontent.com/meips/abc=s0#https://pcXtail1234.ts.net/t/x.gif')).toBe(false);
    expect(regex.test('https://evil.example/x#https://pc.tail1234.ts.net/t/x.gif')).toBe(false);
  });

  it('mark document views by the owner: the page, its fetches and beacons', () => {
    const rules = buildDnrRules({ ...base, publicBaseUrl: 'https://pc.tail1234.ts.net', dnrBlocking: true });
    const rule = rules.find((candidate) => candidate.id === RULE_IDS.selfDocument);
    expect(rule?.condition).toEqual({
      urlFilter: '||pc.tail1234.ts.net/d/',
      resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'ping', 'other'],
    });
    expect(rule?.action).toEqual({ type: 'modifyHeaders', requestHeaders: [{ header: 'X-MailPulse-Self', operation: 'set', value: 'abc123' }] });
  });
});

describe('notifications', () => {
  const options = { now: NOW, timeZone: 'Asia/Karachi' };

  it('title opens and repeat opens, with who, which open and the source', () => {
    const specs = notificationsFor(
      [item(1, { account: 'me@gmail.com', gmailThreadId: '18a1b2c3d4e5f600' }), item(2, { emailId: OTHER_ID, openNumber: 3 })],
      options,
    );
    expect(specs).toHaveLength(2);
    expect(specs[0]).toMatchObject({
      id: 'mp:item:1',
      title: 'Opened: Quarterly plan',
      message: 'Jane Doe · 1st open · via Gmail',
      contextMessage: 'today 16:59',
      icon: 'open',
      target: { emailId: EMAIL_ID, account: 'me@gmail.com', threadId: '18a1b2c3d4e5f600', documentId: null },
      buttons: ['gmail', 'mute'],
    });
    expect(specs[1]).toMatchObject({ title: 'Opened again (3×): Quarterly plan', message: 'Jane Doe · 3rd open · via Gmail', buttons: ['mute'] });
  });

  it('group a burst of opens of one email and skip muted items', () => {
    const specs = notificationsFor(
      [
        item(1, { openNumber: 2, occurredAt: '2026-10-29T11:50:00Z' }),
        item(2, { shouldNotify: false }),
        item(3, { openNumber: 3, occurredAt: '2026-10-29T11:52:00Z' }),
        item(4, { openNumber: 4, occurredAt: '2026-10-29T11:55:00Z' }),
      ],
      options,
    );
    expect(specs).toHaveLength(1);
    expect(specs[0]).toMatchObject({ id: 'mp:item:4', title: 'Opened 3 times in 5 min: Quarterly plan', message: 'Jane Doe · via Gmail' });
    expect(notificationsFor([item(1, { shouldNotify: false })], options)).toEqual([]);
  });

  it('word clicks, documents and alerts, each with its own icon', () => {
    const doc = { documentId: 'doc-1', documentName: 'Resume.pdf' };
    const specs = notificationsFor(
      [
        item(1, { kind: 'CLICK', linkUrl: 'https://docs.example/a' }),
        item(2, { kind: 'DOC_READ', ...doc, readSeconds: 134, pagesViewed: 3, pageCount: 3 }),
        item(3, { kind: 'DOC_DOWNLOAD', ...doc, emailId: null, recipients: '', linkLabel: 'LinkedIn', subject: null }),
      ],
      options,
    );
    expect(specs.map((spec) => [spec.title, spec.message, spec.icon])).toEqual([
      ['Link clicked: Quarterly plan', 'Jane Doe · docs.example', 'click'],
      ['Resume read (2 min)', 'Jane Doe · 2 min 14 s · 3/3 pages', 'doc-read'],
      ['Resume downloaded', 'Link "LinkedIn"', 'doc-download'],
    ]);
    expect(specs[2]).toMatchObject({ target: { emailId: null, documentId: 'doc-1' }, buttons: [] });
    const [view] = notificationsFor([item(4, { kind: 'DOC_VIEW', ...doc })], options);
    expect(view).toMatchObject({ title: 'Resume opened', message: 'Jane Doe · Quarterly plan', icon: 'doc-view' });
    const [followUp] = notificationsFor([item(5, { kind: 'ALERT', alertType: 'FOLLOW_UP', alertText: 'Not opened 48 hours after sending' })], options);
    expect(followUp).toMatchObject({ title: 'Follow-up: Quarterly plan', message: 'Not opened 48 hours after sending', icon: 'follow-up' });
    const [spike] = notificationsFor([item(6, { kind: 'ALERT', alertType: 'OPEN_SPIKE', alertText: 'Opened 3 times within 60 minutes' })], options);
    expect(spike).toMatchObject({ title: 'Hot: Quarterly plan', icon: 'alert' });
  });

  it('show the weekly summary as one notification that opens Reports', () => {
    const text = 'Last week: 12 sent, 8 opened, 3 replied, 1 interview';
    const weekly = item(7, { kind: 'ALERT', alertType: 'WEEKLY', alertText: text, emailId: null, documentId: null, subject: null, recipients: '', source: null });
    const specs = notificationsFor([weekly], options);
    expect(specs).toHaveLength(1);
    expect(specs[0]).toMatchObject({ id: 'mp:item:7', title: 'MailPulse weekly summary', message: text, icon: 'alert', buttons: [] });
    expect(specs[0]!.target).toEqual({ emailId: null, account: null, threadId: null, documentId: null, page: 'reports' });
    expect(dashboardPath(specs[0]!.target)).toBe('/reports');
    const [bare] = notificationsFor([{ ...weekly, alertText: null }], options);
    expect(bare).toMatchObject({ title: 'MailPulse weekly summary', message: '', buttons: [] });
  });

  it('turn more than three into one summary without buttons', () => {
    const grouped = notificationsFor(
      [item(1), item(2, { emailId: OTHER_ID }), item(3, { kind: 'CLICK' }), item(4, { kind: 'ALERT', alertType: 'REVIVAL' }), item(5, { kind: 'CLICK', subject: null })],
      options,
    );
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({ id: 'mp:group:5', title: '5 new MailPulse updates', icon: 'group', buttons: [] });
    expect(grouped[0]!.message.split('\n')).toEqual(['Link clicked: Quarterly plan', 'Revived: Quarterly plan', 'Link clicked: (no subject)']);
  });

  it('lead to the Gmail thread in the right account, or to the MailPulse page', () => {
    expect(gmailThreadUrl('me@gmail.com', '18a1b2c3d4e5f600')).toBe('https://mail.google.com/mail/?authuser=me%40gmail.com#all/18a1b2c3d4e5f600');
    expect(dashboardPath({ emailId: EMAIL_ID, account: null, threadId: null, documentId: null })).toBe(`/emails/${EMAIL_ID}`);
    expect(dashboardPath({ emailId: null, account: null, threadId: null, documentId: 'doc-1' })).toBe('/documents/doc-1');
    expect(dashboardPath({ emailId: null, account: null, threadId: null, documentId: null })).toBe('/activity');
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

describe('marks', () => {
  const mark: Mark = {
    emailId: EMAIL_ID,
    state: 'OPENED',
    openCount: 3,
    clickCount: 0,
    lastOpenedAt: '2026-10-29T11:00:00Z',
    lastClickedAt: null,
    openStatusUnreliable: false,
  };
  const unopened: Mark = { ...mark, state: 'SENT', openCount: 0, lastOpenedAt: null };

  it('follow the display rule: sent, opened with a count from 2, clicked, unreliable', () => {
    expect(markView(unopened)).toEqual({ status: 'sent', count: null, label: 'Sent, not opened yet' });
    expect(markView({ ...mark, openCount: 1 })).toEqual({ status: 'opened', count: null, label: 'Opened once' });
    expect(markView(mark)).toEqual({ status: 'opened', count: 3, label: 'Opened 3 times' });
    expect(markView({ ...mark, clickCount: 2 })).toMatchObject({ status: 'clicked', label: 'Opened 3 times · 2 clicks' });
    expect(markView({ ...mark, openCount: 250 }).count).toBe(99);
    expect(markView({ ...unopened, openStatusUnreliable: true })).toEqual({
      status: 'unreliable',
      count: null,
      label: 'Sent, not opened yet · open status may be unreliable',
    });
  });

  it('show delivered as a grey double tick until the first open or click', () => {
    const delivered: Mark = { ...unopened, deliveredAt: '2026-10-29T10:00:00Z' };
    expect(markView(delivered)).toEqual({ status: 'delivered', count: null, label: 'Delivered' });
    expect(markView({ ...unopened, deliveredAt: null }).status).toBe('sent');
    expect(markView(unopened).status).toBe('sent'); // no deliveredAt field: an older backend
    expect(markView({ ...delivered, openCount: 1 }).status).toBe('opened');
    expect(markView({ ...delivered, clickCount: 1 }).status).toBe('clicked');
    // A recipient-side fetch proves delivery, so it wins over "open status may be unreliable" (as on the dashboard).
    expect(markView({ ...delivered, openStatusUnreliable: true }).status).toBe('delivered');
    const html = markHtml(delivered, true);
    expect(html).toContain('class="mp-mark mp-grey"');
    expect(html).toContain('aria-label="MailPulse: Delivered"');
    expect(html).toContain('<path d="M1 8.6l3 3L10.6 5M7 11.6L13.6 5"/>');
    expect(countHtml(delivered)).toBeNull();
  });

  it('render inline SVG markup from constants, a checked id and numbers only', () => {
    const html = markHtml(mark, true);
    expect(html).toContain(`data-mp-email="${EMAIL_ID}"`);
    expect(html).toContain('class="mp-mark mp-green"');
    expect(html).toContain('<span class="mp-count">3</span>');
    expect(html).toContain('width="16" height="16"');
    expect(markHtml(unopened, true)).toContain('class="mp-mark mp-grey"');
    expect(markHtml({ ...mark, emailId: '"><img src=x onerror=alert(1)>' }, false)).toContain('data-mp-email=""');
    expect(countHtml(mark)).toContain('>3</span>');
    expect(countHtml({ ...mark, openCount: 1 })).toBeNull();
  });

  it('describe the hover card in the settings time zone', () => {
    const card: EmailCard = {
      subject: 'Quarterly plan',
      recipients: [{ email: 'jane@example.com', kind: 'TO' }],
      account: 'me@gmail.com',
      gmailThreadId: null,
      openCount: 3,
      firstOpenedAt: '2026-10-29T06:43:00Z',
      lastOpenedAt: '2026-10-29T11:48:00Z',
      recentOpens: ['2026-10-29T11:48:00Z', '2026-10-29T08:00:00Z', '2026-10-29T06:43:00Z'],
      clickCount: 1,
      lastClickedAt: '2026-10-29T11:55:00Z',
      alerts: [{ type: 'OPEN_SPIKE', text: 'Opened 3 times within 60 minutes' }],
      documents: [{ name: 'Resume.pdf', views: 2, reads: 1, downloads: 0 }],
    };
    expect(cardContent(card, NOW, 'Asia/Karachi')).toEqual({
      status: 'clicked',
      headline: 'Opened 3 times',
      summary: 'first today 11:43 · last 12 minutes ago',
      opens: ['today 16:48', 'today 13:00', 'today 11:43'],
      clicks: '1 click · last 5 minutes ago',
      alerts: ['Opened 3 times within 60 minutes'],
      documents: ['Resume.pdf: 2 views · 1 read · 0 downloads'],
    });
  });
});

describe('text helpers', () => {
  it('format relative times', () => {
    expect(relativeTime('2026-10-29T11:59:30Z', NOW)).toBe('just now');
    expect(relativeTime('2026-10-29T11:55:00Z', NOW)).toBe('5 minutes ago');
    expect(relativeTime('2026-10-28T12:00:00Z', NOW)).toBe('1 day ago');
    expect(relativeTime('not a date', NOW)).toBe('');
  });

  it('format times in a time zone: today, yesterday, weekday, date', () => {
    expect(formatWhen('2026-10-29T06:43:00Z', NOW, 'Asia/Karachi')).toBe('today 11:43');
    expect(formatWhen('2026-10-28T13:02:00Z', NOW, 'Asia/Karachi')).toBe('yesterday 18:02');
    expect(formatWhen('2026-10-26T04:15:00Z', NOW, 'Asia/Karachi')).toBe('Mon 09:15');
    expect(formatWhen('2026-10-12T04:15:00Z', NOW, 'Asia/Karachi')).toBe('12 Oct 09:15');
    expect(formatWhen('2025-10-12T04:15:00Z', NOW, 'Asia/Karachi')).toBe('12 Oct 2025 09:15');
    expect(formatWhen('2026-10-29T06:43:00Z', NOW, 'Not/AZone')).toBe('today 06:43');
  });

  it('format ordinals and durations', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 102, 111].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '102nd', '111th']);
    expect([45, 120, 134, 3600, 3900].map(formatDuration)).toEqual(['45 s', '2 min', '2 min 14 s', '1 h', '1 h 5 min']);
    expect([45, 134, 3900].map(shortDuration)).toEqual(['45 s', '2 min', '1 h']);
  });

  it('tell quiet hours in the settings time zone, also across midnight', () => {
    // NOW is 17:00 in Karachi.
    expect(inQuietHours(NOW, '22:00', '07:00', 'Asia/Karachi')).toBe(false);
    expect(inQuietHours(NOW, '16:30', '17:30', 'Asia/Karachi')).toBe(true);
    expect(inQuietHours(NOW, '16:00', '07:00', 'Asia/Karachi')).toBe(true);
    expect(inQuietHours(NOW, '17:00', '17:00', 'Asia/Karachi')).toBe(false);
    expect(inQuietHours(NOW, '25:00', '07:00', 'Asia/Karachi')).toBe(false);
    expect(inQuietHours(NOW, '11:30', '12:30', 'UTC')).toBe(true);
  });

  it('detect emails sent only to yourself', () => {
    expect(isSelfOnly(['Me@Gmail.com'], 'me@gmail.com')).toBe(true);
    expect(isSelfOnly(['me@gmail.com', 'jane@example.com'], 'me@gmail.com')).toBe(false);
    expect(isSelfOnly([], 'me@gmail.com')).toBe(false);
  });
});
