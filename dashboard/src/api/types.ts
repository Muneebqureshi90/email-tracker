/** JSON shapes of the MailPulse private API (PLAN §6). Times are ISO-8601 strings in UTC. */

export interface AuthStatus {
  setupRequired: boolean;
  authenticated: boolean;
}

export type EmailStatus = 'DRAFT' | 'SENT' | 'SCHEDULED' | 'CANCELLED';
export type RecipientKind = 'TO' | 'CC' | 'BCC';

export interface Recipient {
  email: string;
  name: string | null;
  kind: RecipientKind;
}

export interface EmailSummary {
  id: string;
  account: string;
  subject: string | null;
  status: EmailStatus;
  createdAt: string;
  sentAt: string | null;
  recipients: Recipient[];
  openCount: number;
  clickCount: number;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  lastClickedAt: string | null;
  openStatusUnreliable: boolean;
}

export interface LinkView {
  id: string;
  url: string;
  used: boolean;
  clickCount: number;
  firstClickedAt: string | null;
  lastClickedAt: string | null;
}

export interface EventView {
  id: number;
  type: 'OPEN' | 'CLICK';
  receivedAt: string;
  verdict: 'PENDING' | 'COUNTED' | 'IGNORED';
  reason: string | null;
  source: string;
  linkId: string | null;
  userAgent: string | null;
  ipPrefix: string | null;
}

export interface EmailDetail {
  summary: EmailSummary;
  trackOpens: boolean;
  trackLinks: boolean;
  trackingEnabled: boolean;
  notifications: boolean;
  followUpHours: number | null;
  gmailMessageId: string | null;
  gmailThreadId: string | null;
  cancelledAt: string | null;
  links: LinkView[];
  events: EventView[];
}

export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
}

export type ActivityKind = 'OPEN' | 'CLICK' | 'ALERT';

export interface ActivityItem {
  id: number;
  kind: ActivityKind;
  emailId: string;
  subject: string | null;
  recipients: string;
  occurredAt: string;
  source: string | null;
  linkUrl: string | null;
  shouldNotify: boolean;
}

export interface ActivityPage {
  items: ActivityItem[];
  lastId: number;
}

export interface ContactSummary {
  email: string;
  name: string | null;
  emails: number;
  openedEmails: number;
  opens: number;
  clicks: number;
  firstSeenAt: string;
  lastEmailedAt: string | null;
  lastOpenedAt: string | null;
}

export interface ContactDetail {
  summary: ContactSummary;
  emails: EmailSummary[];
}

export interface Bucket {
  label: string;
  opens: number;
  clicks: number;
}

export interface Report {
  period: 'DAY' | 'WEEK';
  start: string;
  end: string;
  timeZone: string;
  sent: number;
  openedEmails: number;
  openRate: number;
  opens: number;
  clicks: number;
  buckets: Bucket[];
  topEmails: { id: string; subject: string | null; recipients: string; opens: number; clicks: number }[];
  topContacts: { email: string; name: string | null; opens: number }[];
}

export type SendMode = 'PRESYNC' | 'CANCEL_RESEND';

export interface Settings {
  trackingDefault: boolean;
  linkTrackingDefault: boolean;
  sendGraceSeconds: number;
  selfViewWindowSeconds: number;
  dedupeWindowSeconds: number;
  followUpHours: number;
  spikeOpens: number;
  spikeWindowMinutes: number;
  revivalDays: number;
  retentionDays: number;
  ipMode: 'TRUNCATED' | 'OFF';
  countApplePrefetch: boolean;
  notifyOpens: boolean;
  notifyClicks: boolean;
  notifyAlerts: boolean;
  timeZone: string;
  sendMode: SendMode;
  dnrBlocking: boolean;
  trackConfidential: boolean;
}

export interface ApiToken {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface CreatedToken {
  id: string;
  name: string;
  prefix: string;
  token: string;
  createdAt: string;
}

export interface Preferences {
  notifications?: boolean;
  followUpHours?: number;
  trackingEnabled?: boolean;
}
