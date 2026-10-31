/** JSON shapes of the MailPulse private API (PLAN §6). Times are ISO-8601 strings in UTC. */

export interface AuthStatus {
  setupRequired: boolean;
  authenticated: boolean;
  /** Set by the dashboard (not the API) when a request answered 401 during a session. */
  expired?: boolean;
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
  /** v2: the latest counted open came at least 60 minutes after the one before. */
  openedAgain?: boolean;
  /** v2: up to 5 latest counted open times, newest first. */
  recentOpens?: string[];
  /** When the extension first saw a reply in the email's Gmail thread; null: no reply seen. */
  repliedAt?: string | null;
  /** When the email reached the recipient's mailbox; null (or missing): not known to be delivered. */
  deliveredAt?: string | null;
}

export interface OpenView {
  eventId: number;
  at: string;
  source: string;
}

export interface EmailCounts {
  all: number;
  opened: number;
  notOpened: number;
  clicked: number;
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
  /** The latest 100; the full list is paged at /api/emails/{id}/events. */
  events: EventView[];
  /** v2: every counted open, oldest first. */
  opens?: OpenView[];
}

export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
}

export type ActivityKind = 'OPEN' | 'CLICK' | 'ALERT' | 'DOC_VIEW' | 'DOC_READ' | 'DOC_DOWNLOAD';

export interface ActivityItem {
  id: number;
  kind: ActivityKind;
  /** Null for a document event from a share link that belongs to no email. */
  emailId: string | null;
  subject: string | null;
  recipients: string;
  occurredAt: string;
  source: string | null;
  linkUrl: string | null;
  shouldNotify: boolean;
  alertType: AlertType | null;
  alertText: string | null;
  openNumber?: number | null;
  account?: string | null;
  gmailThreadId?: string | null;
  documentId?: string | null;
  documentName?: string | null;
  linkLabel?: string | null;
  readSeconds?: number | null;
  pagesViewed?: number | null;
  pageCount?: number | null;
}

export interface NotificationPage {
  items: ActivityItem[];
  unread: number;
  lastReadId: number;
}

export type AlertType = 'FOLLOW_UP' | 'OPEN_SPIKE' | 'REVIVAL' | 'DOC_VIEWS' | 'NO_REPLY' | 'WEEKLY';
export type AlertStatus = 'NEW' | 'SEEN' | 'DISMISSED' | 'SNOOZED';

export interface AlertView {
  id: string;
  type: AlertType;
  text: string;
  status: AlertStatus;
  createdAt: string;
  snoozedUntil: string | null;
  /** Null for alerts about a document link or the WEEKLY summary. */
  emailId: string | null;
  subject: string | null;
  recipients: string;
}

export interface AlertPage extends Page<AlertView> {
  newCount: number;
}

export interface ActivityPage {
  /** Oldest first. */
  items: ActivityItem[];
  lastId: number;
  hasMore?: boolean;
  configVersion?: string;
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
  /** v2: the period of the same length just before. */
  previous?: ReportTotals;
}

export interface ReportTotals {
  sent: number;
  openedEmails: number;
  openRate: number;
  opens: number;
  clicks: number;
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
  /** v2 contract: DEFAULT until the dashboard saves the browser zone (AUTO) or the owner picks one (USER). */
  timeZoneSource: 'DEFAULT' | 'AUTO' | 'USER';
  notifyOn: 'FIRST' | 'EVERY' | 'EVERY_AFTER_GAP';
  notifyDocuments: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  docReadSeconds: number;
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
  /** 0 = use the default from Settings. */
  followUpHours?: 0 | 24 | 48 | 72;
  trackingEnabled?: boolean;
  trackLinks?: boolean;
}

export interface DocumentSummary {
  id: string;
  name: string;
  sizeBytes: number;
  pageCount: number | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  views: number;
  reads: number;
  downloads: number;
  lastActivityAt: string | null;
}

export interface DocLinkView {
  id: string;
  url: string;
  label: string | null;
  emailId: string | null;
  emailSubject: string | null;
  recipients: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  allowDownload: boolean;
  views: number;
  reads: number;
  downloads: number;
  lastActivityAt: string | null;
}

export type DocEventType = 'DOC_VIEW' | 'DOC_READ' | 'DOC_DOWNLOAD';

export interface DocEventView {
  id: number;
  linkId: string;
  type: DocEventType;
  at: string;
  verdict: 'PENDING' | 'COUNTED' | 'IGNORED';
  reason: string | null;
  source: string;
  userAgent: string | null;
  ipPrefix: string | null;
  readSeconds: number | null;
  pagesViewed: number | null;
}

export interface DocumentDetail {
  summary: DocumentSummary;
  links: DocLinkView[];
  events: DocEventView[];
}

export interface SearchResults {
  emails: EmailSummary[];
  contacts: ContactSummary[];
  documents: DocumentSummary[];
}
