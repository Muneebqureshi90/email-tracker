// The popup with sample data, for the preview page (dist/popup-preview.html). A stand-in `chrome`
// answers the popup's messages; nothing leaves the page.
import { createRoot } from 'react-dom/client';
import type { ActivityItem } from '../core/api-types';
import type { Request, Status } from '../core/messages';
import { Popup } from '../popup/Popup';

const NOW = Date.now();
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

const STATUS: Status = {
  backendUrl: 'http://127.0.0.1:8090',
  hasToken: true,
  connection: 'ok',
  message: null,
  checkedAt: ago(0.2),
  paused: false,
  notificationsEnabled: true,
  publicCheck: 'up',
  publicCheckedAt: ago(1),
  config: null,
  queued: 0,
  extensionOrigin: 'chrome-extension://pdinoocioohoejhjbeepjdadkkjldgeo',
  appIdSet: true,
};

function item(id: number, overrides: Partial<ActivityItem>): ActivityItem {
  return {
    id,
    kind: 'OPEN',
    emailId: '7b0f3c52-1d9e-4f1a-9c41-2b9d6f0a1e11',
    subject: 'Proposal v2',
    recipients: 'sara@example.com',
    occurredAt: ago(30),
    source: 'GMAIL_PROXY',
    linkUrl: null,
    shouldNotify: true,
    alertType: null,
    alertText: null,
    ...overrides,
  };
}

const ITEMS: ActivityItem[] = [
  item(1, { kind: 'ALERT', alertType: 'OPEN_SPIKE', alertText: 'Opened 3 times within 60 minutes', occurredAt: ago(50) }),
  item(2, { kind: 'CLICK', subject: 'Pricing page', recipients: 'lee@example.com', linkUrl: 'https://example.com/pricing', occurredAt: ago(35) }),
  item(3, { kind: 'DOC_READ', documentName: 'Resume.pdf', recipients: 'hr@example.com', occurredAt: ago(20) }),
  item(4, { kind: 'DOC_DOWNLOAD', documentName: 'Resume.pdf', recipients: '', linkLabel: 'LinkedIn', occurredAt: ago(8) }),
  item(5, { openNumber: 3, occurredAt: ago(2) }),
];

const fake = {
  runtime: {
    sendMessage: (request: Request) => Promise.resolve(request.type === 'mp:activity' ? ITEMS : STATUS),
    openOptionsPage: () => undefined,
  },
  storage: { onChanged: { addListener: () => undefined, removeListener: () => undefined } },
  tabs: { create: () => undefined },
};
Object.defineProperty(globalThis, 'chrome', { value: fake, configurable: true, writable: true });

const root = document.getElementById('root');
if (root) createRoot(root).render(<Popup />);
