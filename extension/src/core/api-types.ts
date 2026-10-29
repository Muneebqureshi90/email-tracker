/** JSON shapes of the MailPulse private API (PLAN §6). Times are ISO-8601 strings. */

export type SendMode = 'PRESYNC' | 'CANCEL_RESEND';

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
}

export interface MarksResponse {
  marks: Record<string, Mark>;
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
  alertType: 'FOLLOW_UP' | 'OPEN_SPIKE' | 'REVIVAL' | null;
  alertText: string | null;
}

export interface ActivityPage {
  items: ActivityItem[];
  lastId: number;
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
