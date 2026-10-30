// Preview page (dist/preview.html): every Gmail state MailPulse draws, on Gmail-like light or dark
// surroundings (?theme=dark), for screenshots and review outside Gmail. Sample data only; it never
// runs inside Gmail and talks to nothing.
import type { DocumentSummary, EmailCard, Mark } from '../core/api-types';
import { documentLinkText } from '../core/format';
import { cardParts, element } from '../gmail/card';
import { ComposeChip, type ChipState } from '../gmail/chip';
import { messageIcon } from '../gmail/message-views';
import { countIcon, tickIcon, type RowIcon } from '../gmail/rows';
import { DARK_CLASS } from '../gmail/theme';

const NOW = Date.now();
const MINUTE = 60_000;
const ID = '7b0f3c52-1d9e-4f1a-9c41-2b9d6f0a1e11';
const dark = new URLSearchParams(location.search).get('theme') === 'dark';
document.documentElement.classList.toggle(DARK_CLASS, dark);

function mark(overrides: Partial<Mark>): Mark {
  return {
    emailId: ID,
    state: 'SENT',
    openCount: 0,
    clickCount: 0,
    lastOpenedAt: null,
    lastClickedAt: null,
    openStatusUnreliable: false,
    ...overrides,
  };
}

/** Our own constant icon markup (core/marks.ts), parsed instead of innerHTML. */
function slot(icon: RowIcon | null): HTMLElement | null {
  if (!icon) return null;
  const wrapper = element(document, 'div', `inboxsdk__thread_row_attachment_iconWrapper ${icon.iconClass}`);
  const parsed = new DOMParser().parseFromString(icon.iconHtml, 'text/html').body.firstElementChild;
  if (parsed) wrapper.append(document.importNode(parsed, true));
  return wrapper;
}

function section(title: string, ...children: HTMLElement[]): HTMLElement {
  const box = element(document, 'section');
  box.append(element(document, 'h2', 'g-title', title), ...children);
  return box;
}

const ROWS: { who: string; subject: string; snippet: string; mark: Mark | null; density?: string }[] = [
  { who: 'To: Jane Doe', subject: 'Quarterly plan', snippet: ' - Hi Jane, here is the plan for Q4', mark: mark({}) },
  { who: 'To: Omar Khan', subject: 'Interview follow-up', snippet: ' - Thanks for your time today', mark: mark({ state: 'OPENED', openCount: 1 }) },
  { who: 'To: Sara Ali', subject: 'Proposal v2', snippet: ' - Updated numbers attached', mark: mark({ state: 'OPENED', openCount: 3 }) },
  { who: 'To: Lee Chen', subject: 'Pricing page', snippet: ' - The link to the new page', mark: mark({ state: 'OPENED', openCount: 2, clickCount: 1 }) },
  { who: 'To: team@example.com', subject: 'Status update', snippet: ' - All recipients block images', mark: mark({ openStatusUnreliable: true }) },
  { who: 'To: Mom', subject: 'Sunday lunch', snippet: ' - Not tracked', mark: null },
];

function rows(density: 'compact' | 'default' | 'comfortable'): HTMLElement {
  const panel = element(document, 'div', 'g-panel');
  ROWS.forEach((row, index) => {
    const line = element(document, 'div', `g-row ${density === 'default' ? '' : density}`);
    const subject = element(document, 'div', 'g-subject');
    subject.append(element(document, 'span', null, row.subject), element(document, 'span', 'g-snippet', row.snippet));
    const attach = element(document, 'div', 'g-attach');
    for (const node of [slot(tickIcon(row.mark)), slot(countIcon(row.mark))]) if (node) attach.append(node);
    line.append(element(document, 'div', 'g-who', row.who), subject, attach, element(document, 'div', 'g-date', `${11 - index}:4${index} AM`));
    panel.append(line);
  });
  return panel;
}

function message(): HTMLElement {
  const panel = element(document, 'div', 'g-panel g-message');
  const head = element(document, 'div', 'g-msg-head');
  const who = element(document, 'div', 'g-msg-who', 'Me');
  who.append(element(document, 'small', null, 'to Sara Ali'));
  const date = element(document, 'div', 'g-msg-date', '11:43 AM (12 minutes ago)');
  const icon = messageIcon(mark({ state: 'OPENED', openCount: 3 }));
  const node = slot({ iconHtml: icon.iconHtml ?? '', iconClass: icon.iconClass ?? 'mp-slot' });
  if (node) date.append(node);
  head.append(element(document, 'span', 'g-avatar', 'M'), who, date);
  panel.append(head);
  return panel;
}

const CARD: EmailCard = {
  subject: 'Proposal v2',
  recipients: [{ email: 'sara@example.com', name: 'Sara Ali', kind: 'TO' }],
  account: 'me@example.com',
  gmailThreadId: null,
  openCount: 3,
  firstOpenedAt: new Date(NOW - 75 * MINUTE).toISOString(),
  lastOpenedAt: new Date(NOW - 12 * MINUTE).toISOString(),
  recentOpens: [12, 40, 75].map((minutes) => new Date(NOW - minutes * MINUTE).toISOString()),
  clickCount: 1,
  lastClickedAt: new Date(NOW - 10 * MINUTE).toISOString(),
  alerts: [{ type: 'OPEN_SPIKE', text: 'Opened 3 times within 60 minutes' }],
  documents: [{ name: 'Resume.pdf', views: 2, reads: 1, downloads: 1 }],
};

function card(content: EmailCard | null): HTMLElement {
  const box = element(document, 'div', 'mp-card mp-card-static');
  box.append(...cardParts(document, ID, content, { now: NOW, timeZone: undefined, backendUrl: 'http://127.0.0.1:8090' }));
  return box;
}

const DOCUMENTS: DocumentSummary[] = [
  { id: 'doc-1', name: 'Resume.pdf', sizeBytes: 184_320, pageCount: 2 },
  { id: 'doc-2', name: 'Portfolio.pdf', sizeBytes: 2_516_582, pageCount: 9 },
];

function compose(state: ChipState, options: { open?: boolean; documents?: boolean; compact?: boolean; body?: string } = {}): { box: HTMLElement; chip: ComposeChip } {
  const box = element(document, 'div', 'g-compose');
  const body = element(document, 'div', 'g-compose-body', options.body ?? 'Hi Sara, the updated proposal is attached as a link.');
  if (options.documents) {
    const link = element(document, 'a', null, documentLinkText(DOCUMENTS[0]!.name, DOCUMENTS[0]!.sizeBytes));
    link.href = '#';
    body.append(element(document, 'br'), link);
  }
  const toolbar = element(document, 'div', 'g-toolbar');
  const group = element(document, 'div', 'g-send-group');
  group.append(element(document, 'span', 'g-send', 'Send'), element(document, 'span', 'g-send-more'));
  const chip = new ComposeChip(document, state, {
    setTracking: () => undefined,
    setTrackLinks: () => undefined,
    setFollowUp: () => undefined,
    listDocuments: () => Promise.resolve(DOCUMENTS),
    insertDocument: () => Promise.resolve(true),
  });
  chip.setCompact(options.compact ?? false);
  toolbar.append(group, chip.element, element(document, 'span', 'g-tools', 'A 📎 🔗 ☺ ⋮'));
  box.append(element(document, 'div', 'g-compose-head', 'New Message'), body, toolbar);
  return { box, chip };
}

const on: ChipState = { phase: 'on', tracking: true, trackLinks: false, followUp: 0, defaultFollowUpHours: 48 };
const left = element(document, 'div', 'g-col');
const right = element(document, 'div', 'g-col');
const plain = compose(on);
const offline = compose({ ...on, phase: 'offline' }, { compact: false, body: 'MailPulse is not reachable: sent without tracking.' });
const narrow = compose({ ...on, phase: 'off', tracking: false }, { compact: true, body: 'Narrow window: compact chip.' });
const withMenu = compose({ ...on, trackLinks: true, followUp: 72 }, { documents: true });

left.append(
  section('Sent list, default density', rows('default')),
  section('Compact and comfortable density', rows('compact'), rows('comfortable')),
  section('Open email', message()),
  section('Compose: chip next to Send', plain.box, offline.box, narrow.box),
  section('Compose: menu with Insert tracked file', withMenu.box),
);
const cards = element(document, 'div', 'g-cards');
cards.append(card(CARD), card(null));
const popup = element(document, 'iframe', 'g-popup');
popup.src = 'popup-preview.html';
popup.title = 'MailPulse popup';
right.append(section('Hover card', cards), section('Popup', popup));
document.getElementById('root')?.append(left, right);

// Open the last compose menu with its document list, as the owner would see it.
requestAnimationFrame(() => {
  withMenu.chip.element.click();
  const insert = Array.from(document.querySelectorAll<HTMLButtonElement>('.mp-menu .mp-item')).find((item) => item.textContent === 'Insert tracked file…');
  insert?.click();
});
