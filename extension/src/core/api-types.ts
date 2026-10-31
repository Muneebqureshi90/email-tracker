/** JSON shapes of the MailPulse private API (PLAN §6, docs/v2-contract.md). Times are ISO-8601 strings. */

export type SendMode = 'PRESYNC' | 'CANCEL_RESEND';
export type NotifyOn = 'FIRST' | 'EVERY' | 'EVERY_AFTER_GAP';

/**
 * GET /api/config. The v2 fields are optional so an extension that is newer than the backend keeps
 * working (fail open) until the backend is updated too.
 */
export interface ClientConfig {
  publicBaseUrl: string;
  selfHeaderName: string;
  selfHeaderValue: string | null;
  trackingDefault: boolean;
  linkTrackingDefault: boolean;
  sendMode: SendMode;
  dnrBlocking: boolean;
  trackConfidential: boolean;
  selfViewWindowSeconds: number;
  followUpHours: number;
  /** Changes whenever a setting changes; the activity feed carries it too. */
  configVersion?: string;
  notifyOn?: NotifyOn;
  notifyDocuments?: boolean;
  quietHoursEnabled?: boolean;
  /** "HH:mm" in `timeZone`; the range may wrap midnight. */
  quietHoursStart?: string;
  quietHoursEnd?: string;
  timeZone?: string;
}

export interface RegisterResponse {
  id: string;
  pixelUrl: string;
  trackOpens: boolean;
  trackLinks: boolean;
  created: boolean;
}

export type RecipientKind = 'TO' | 'CC' | 'BCC';

export interface Recipient {
  email: string;
  name?: string;
  kind: RecipientKind;
}

export type EmailStatus = 'DRAFT' | 'SENT' | 'SCHEDULED' | 'CANCELLED';

export interface EmailUpdate {
  status: Exclude<EmailStatus, 'DRAFT'>;
  gmailMessageId?: string;
  gmailThreadId?: string;
  sentAt?: string;
  subject?: string;
  recipients?: Recipient[];
  usedLinkIds?: string[];
}

export interface TokenLookup {
  id: string;
  status: EmailStatus;
}

export interface Mark {
  emailId: string;
  state: 'SENT' | 'OPENED';
  openCount: number;
  clickCount: number;
  lastOpenedAt: string | null;
  lastClickedAt: string | null;
  openStatusUnreliable: boolean;
  firstOpenedAt?: string | null;
  /** Up to 5 latest counted opens, newest first. */
  recentOpens?: string[];
  openedAgain?: boolean;
  documentViews?: number;
}

export interface MarksResponse {
  marks: Record<string, Mark>;
}

export type ActivityKind = 'OPEN' | 'CLICK' | 'ALERT' | 'DOC_VIEW' | 'DOC_READ' | 'DOC_DOWNLOAD';
export type AlertType = 'FOLLOW_UP' | 'OPEN_SPIKE' | 'REVIVAL' | 'DOC_VIEWS' | 'NO_REPLY' | 'WEEKLY';

export interface ActivityItem {
  id: number;
  kind: ActivityKind;
  /** Null for document events from share links that belong to no email. */
  emailId: string | null;
  subject: string | null;
  recipients: string;
  occurredAt: string;
  source: string | null;
  linkUrl: string | null;
  shouldNotify: boolean;
  alertType: AlertType | null;
  alertText: string | null;
  /** OPEN: the n-th counted open of that email (1 = first). */
  openNumber?: number | null;
  account?: string | null;
  gmailThreadId?: string | null;
  documentId?: string | null;
  documentName?: string | null;
  linkLabel?: string | null;
  readSeconds?: number | null;
  /** Number of distinct pages viewed. */
  pagesViewed?: number | null;
  pageCount?: number | null;
}

export interface ActivityPage {
  items: ActivityItem[];
  lastId: number;
  configVersion?: string;
  hasMore?: boolean;
}

export type SelfViewContext = 'THREAD' | 'COMPOSE' | 'OTHER';

export interface RegisterLinksResponse {
  links: { linkId: string; originalUrl: string; trackedUrl: string }[];
  rejected: string[];
}

/** Per-email switches. followUpHours 0 means "use the default". */
export interface Preferences {
  notifications?: boolean;
  followUpHours?: 0 | 24 | 48 | 72;
  trackingEnabled?: boolean;
  trackLinks?: boolean;
}

/** GET /api/emails/{id}/card: what the Gmail hover card shows. */
export interface EmailCard {
  emailId?: string;
  subject: string | null;
  recipients: Recipient[];
  account: string;
  gmailThreadId: string | null;
  openCount: number;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  recentOpens: string[];
  clickCount: number;
  lastClickedAt: string | null;
  alerts: { type: string; text: string }[];
  documents: { name: string; views: number; reads: number; downloads: number }[];
}

/** GET /api/documents (the fields the extension uses). */
export interface DocumentSummary {
  id: string;
  name: string;
  sizeBytes: number;
  pageCount: number | null;
}

/** POST /api/documents/{id}/links (the fields the extension uses). */
export interface DocLinkView {
  id: string;
  url: string;
}
