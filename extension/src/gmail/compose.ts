import type { ComposeView } from '@inboxsdk/core';
import type { ClientConfig, DocumentSummary, Preferences, Recipient, RecipientKind } from '../core/api-types';
import { documentLinkText } from '../core/format';
import { extractLinks, rewriteLinks, type TrackedLink } from '../core/links';
import { findPixels, isInQuote, preparePixel, uniqueTokens } from '../core/pixel';
import { isSelfOnly } from '../core/recipients';
import type { Ask } from './bridge';
import { ComposeChip, sendGroupOf, type ChipState, type FollowUp } from './chip';
import { looksConfidential } from './dom';
import type { GmailEnv } from './env';

const GMAIL_ID = /^[A-Za-z0-9:_-]{1,64}$/;
const SIMPLE_ADDRESS = /^[^\s@]+@[^\s@]+$/;
const REGISTER_WAIT_MS = 2000;
const MAX_SUBJECT = 998;
/** Narrower compose windows show only "✓✓ ▾" (the label stays in aria-label). */
const COMPACT_BELOW_PX = 520;
/** Gmail sometimes rebuilds the compose toolbar; the chip is put back this often if it went missing. */
const REATTACH_MS = 2000;
const PLACE_RETRIES_MS = [0, 300, 1000];

interface TrackedDraft {
  id: string;
  pixelUrl: string;
}

/** What was sent with the pixel, captured at `presending` and reported on `sent`. */
interface PendingSend {
  emailId: string;
  subject: string;
  recipients: Recipient[];
  sentAt: string;
  usedLinkIds: string[] | undefined;
}

export interface ComposeOptions {
  newClientRef?: () => string;
  /** Wait after the last edit before registering new links (PLAN §4.1 step 2). */
  linkScanDelayMs?: number;
}

type Contact = { emailAddress: string; name?: string | null };

function validGmailId(id: string | null): string | undefined {
  return id && GMAIL_ID.test(id) ? id : undefined;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

/**
 * One compose window (PLAN §4.1). Registers the email while the owner writes, registers link URLs
 * as they appear, inserts the pixel and tracked links synchronously at send, and reports the send.
 * Every handler fails open: MailPulse never stops, delays or changes a send because of its own problems.
 */
export class ComposeSession {
  private tracking = false;
  private trackLinks = false;
  private followUp: FollowUp = 0;
  private draft: TrackedDraft | null = null;
  private registration: Promise<TrackedDraft | null> | null = null;
  private resending = false;
  private scheduleMenuOpen = false;
  private pending: PendingSend | null = null;
  private reportedSent = false;
  private linkTimer: ReturnType<typeof setTimeout> | undefined;
  private reattachTimer: ReturnType<typeof setInterval> | undefined;
  private chip: ComposeChip | null = null;
  private fallbackBar: HTMLElement | null = null;
  private readonly links = new Map<string, TrackedLink>();
  /** Document id to this email's link URL ("one link per email"). */
  private readonly documentLinks = new Map<string, string>();
  private readonly clientRef: string;
  private readonly linkScanDelayMs: number;

  constructor(
    private readonly view: ComposeView,
    private readonly env: GmailEnv,
    private readonly ask: Ask,
    options: ComposeOptions = {},
  ) {
    this.clientRef = (options.newClientRef ?? (() => crypto.randomUUID()))();
    this.linkScanDelayMs = options.linkScanDelayMs ?? 1000;
  }

  start(): void {
    const config = this.env.config;
    if (!config || !this.env.active) return;
    this.tracking = config.trackingDefault;
    this.trackLinks = config.linkTrackingDefault;
    this.mountChip(config);

    this.view.on('presending', (event) => this.onPresending(event, config));
    this.view.on('sent', (event) => void this.onSent(event));
    this.view.on('sendCanceled', () => void this.onSendCanceled());
    this.view.on('scheduleSendMenuOpening', () => this.onScheduleMenuOpening(config));
    this.view.on('scheduleSendMenuOpenCanceled', () => {
      this.scheduleMenuOpen = false;
    });
    this.view.on('bodyChanged', () => this.scheduleLinkScan(config.publicBaseUrl));
    this.view.on('destroy', () => {
      clearTimeout(this.linkTimer);
      clearInterval(this.reattachTimer);
      this.chip?.destroy();
      void this.onDestroy();
    });
    this.render();
    void this.inspectBody(config.publicBaseUrl);
  }

  /**
   * The "✓✓ Tracking on ▾" chip next to Send (brief Part C). It goes right after Gmail's Send button
   * group, found the way InboxSDK finds it; when that markup is missing it sits in an InboxSDK status
   * bar instead, so tracking controls are always there (fail open).
   */
  private mountChip(config: ClientConfig): void {
    const chip = new ComposeChip(document, this.chipState(config), {
      setTracking: (on) => this.setTracking(on),
      setTrackLinks: (on) => this.setTrackLinks(on, config.publicBaseUrl),
      setFollowUp: (hours) => this.setFollowUp(hours),
      listDocuments: () => this.ask({ type: 'mp:documents' }),
      insertDocument: (document) => this.insertDocument(document, config.publicBaseUrl),
    });
    this.chip = chip;
    const root = typeof this.view.getElement === 'function' ? this.view.getElement() : null;
    const place = (fallback: boolean): void => {
      if (chip.element.isConnected) return;
      const group = root ? sendGroupOf(root) : null;
      if (group) {
        group.after(chip.element);
      } else if (fallback) {
        this.fallbackBar ??= this.view.addStatusBar({ height: 44, orderHint: 200 }).el;
        this.fallbackBar.classList.add('mp-chip-bar');
        this.fallbackBar.append(chip.element);
      }
    };
    if (!root) {
      place(true);
      return;
    }
    PLACE_RETRIES_MS.forEach((delay, index) => {
      setTimeout(() => {
        if (!chip.element.isConnected) place(index === PLACE_RETRIES_MS.length - 1);
      }, delay);
    });
    this.reattachTimer = setInterval(() => {
      if (!chip.element.isConnected && !this.fallbackBar) place(false);
    }, REATTACH_MS);
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => chip.setCompact(root.clientWidth > 0 && root.clientWidth < COMPACT_BELOW_PX)).observe(root);
    }
  }

  /** Creates this email's link for the document (once) and inserts "Resume.pdf · PDF · 180 KB" at the cursor. */
  private async insertDocument(document: DocumentSummary, publicBaseUrl: string): Promise<boolean> {
    if (!this.tracking) this.setTracking(true);
    const draft = await this.ensureRegistered();
    if (!draft) return false;
    let url = this.documentLinks.get(document.id);
    if (!url) {
      const link = await this.ask({ type: 'mp:documentLink', documentId: document.id, emailId: draft.id });
      // Only our own public document links go into the email.
      if (!link || !link.url.startsWith(`${publicBaseUrl}/d/`)) return false;
      url = link.url;
      this.documentLinks.set(document.id, url);
    }
    try {
      this.view.insertLinkIntoBodyAtCursor(documentLinkText(document.name, document.sizeBytes), url);
      return true;
    } catch {
      return false;
    }
  }

  /** Pixels already in the body: quoted ones are self-views; our own one means Undo Send or a reopened draft. */
  private async inspectBody(publicBaseUrl: string): Promise<void> {
    const pixels = findPixels(this.view.getBodyElement(), publicBaseUrl);
    if (pixels.length > 0) {
      void this.ask({ type: 'mp:selfView', account: this.env.account, tokens: uniqueTokens(pixels), context: 'COMPOSE' });
    }
    const own = pixels.find((pixel) => !isInQuote(pixel.el));
    if (own) {
      const found = await this.ask({ type: 'mp:lookupToken', token: own.token });
      if (found) {
        this.draft = { id: found.id, pixelUrl: `${publicBaseUrl}/t/${own.token}.gif` };
        this.tracking = true;
        this.render();
        return;
      }
    }
    if (this.tracking) void this.ensureRegistered();
  }

  private ensureRegistered(): Promise<TrackedDraft | null> {
    if (this.draft) return Promise.resolve(this.draft);
    if (!this.registration) {
      const trackLinks = this.trackLinks;
      this.registration = this.ask({
        type: 'mp:register',
        account: this.env.account,
        clientRef: this.clientRef,
        trackLinks,
      }).then((response) => {
        if (response) {
          this.draft = { id: response.id, pixelUrl: response.pixelUrl };
          // Choices made while the registration was on its way.
          const changes: Preferences = {};
          if (this.followUp !== 0) changes.followUpHours = this.followUp;
          if (this.trackLinks !== trackLinks) changes.trackLinks = this.trackLinks;
          if (Object.keys(changes).length > 0) this.savePreferences(changes);
        }
        this.registration = null;
        this.render();
        return this.draft;
      });
      this.render();
    }
    return this.registration;
  }

  private setTracking(on: boolean): void {
    this.tracking = on;
    if (this.tracking) void this.ensureRegistered();
    this.render();
  }

  private setTrackLinks(on: boolean, publicBaseUrl: string): void {
    this.trackLinks = on;
    if (this.draft) this.savePreferences({ trackLinks: on });
    if (on) void this.scanLinks(publicBaseUrl);
    this.render();
  }

  private setFollowUp(hours: FollowUp): void {
    this.followUp = hours;
    if (this.draft) this.savePreferences({ followUpHours: hours });
    this.render();
  }

  private savePreferences(preferences: Preferences): void {
    if (this.draft) void this.ask({ type: 'mp:preferences', emailId: this.draft.id, preferences });
  }

  private scheduleLinkScan(publicBaseUrl: string): void {
    if (!this.trackLinks) return;
    clearTimeout(this.linkTimer);
    this.linkTimer = setTimeout(() => void this.scanLinks(publicBaseUrl), this.linkScanDelayMs);
  }

  /** Registers link URLs of the new text that have no tracked version yet. Only URLs are sent, never text. */
  private async scanLinks(publicBaseUrl: string): Promise<void> {
    if (!this.tracking || !this.trackLinks || !this.draft) return;
    const urls = extractLinks(this.view.getBodyElement(), publicBaseUrl, isInQuote).filter((url) => !this.links.has(url));
    if (urls.length === 0) return;
    const response = await this.ask({ type: 'mp:registerLinks', emailId: this.draft.id, urls });
    for (const link of response?.links ?? []) this.links.set(link.originalUrl, link);
  }

  private onPresending(event: { cancel(): void }, config: ClientConfig): void {
    try {
      if (this.resending) {
        this.resending = false;
        return;
      }
      const track = this.shouldTrack(config);
      if (track && config.sendMode === 'CANCEL_RESEND') {
        event.cancel();
        void this.cancelAndResend(config.publicBaseUrl);
        return;
      }
      this.prepareBody(config.publicBaseUrl, track ? this.draft : null);
    } catch {
      this.pending = null;
    }
  }

  private shouldTrack(config: ClientConfig): boolean {
    if (!this.tracking || this.env.paused) return false;
    if (isSelfOnly(this.recipients().map((recipient) => recipient.email), this.env.account)) return false;
    if (!config.trackConfidential && looksConfidential(this.view.getBodyElement())) return false;
    // PRESYNC never waits for the network: no registration yet means this email goes out untracked.
    return config.sendMode === 'CANCEL_RESEND' || this.draft !== null;
  }

  private prepareBody(publicBaseUrl: string, draft: TrackedDraft | null): void {
    const body = this.view.getBodyElement();
    const result = preparePixel(body, { publicBaseUrl, pixelUrl: draft?.pixelUrl ?? null });
    if (!draft || !result.present) {
      this.pending = null;
      return;
    }
    // Links without a tracked version yet (typed in the last second) stay as they are.
    const usedLinkIds = this.trackLinks ? rewriteLinks(body, this.links, publicBaseUrl, isInQuote) : undefined;
    this.pending = {
      emailId: draft.id,
      subject: this.view.getSubject().slice(0, MAX_SUBJECT),
      recipients: this.recipients(),
      sentAt: new Date().toISOString(),
      usedLinkIds,
    };
  }

  /** Fallback flow (D-011): cancel, register within 2 s, edit the body, send again. */
  private async cancelAndResend(publicBaseUrl: string): Promise<void> {
    const draft = await withTimeout(this.ensureRegistered(), REGISTER_WAIT_MS).catch(() => null);
    if (draft && this.trackLinks) await withTimeout(this.scanLinks(publicBaseUrl), REGISTER_WAIT_MS).catch(() => null);
    try {
      this.prepareBody(publicBaseUrl, draft);
    } catch {
      this.pending = null;
    }
    this.resending = true;
    this.view.send();
  }

  private async onSent(event: { getMessageID(): Promise<string>; getThreadID(): Promise<string> }): Promise<void> {
    const pending = this.pending;
    if (!pending) return;
    const [messageId, threadId] = await Promise.all([
      event.getMessageID().catch(() => null),
      event.getThreadID().catch(() => null),
    ]);
    this.reportedSent = true;
    await this.ask({
      type: 'mp:update',
      emailId: pending.emailId,
      update: {
        status: this.scheduleMenuOpen ? 'SCHEDULED' : 'SENT',
        gmailMessageId: validGmailId(messageId),
        gmailThreadId: validGmailId(threadId),
        sentAt: pending.sentAt,
        subject: pending.subject,
        recipients: pending.recipients,
        ...(pending.usedLinkIds ? { usedLinkIds: pending.usedLinkIds } : {}),
      },
    });
  }

  /** Undo Send. The reopened compose still holds the pixel and adopts this email again. */
  private async onSendCanceled(): Promise<void> {
    const pending = this.pending;
    if (!pending || !this.reportedSent) return;
    this.reportedSent = false;
    await this.ask({ type: 'mp:update', emailId: pending.emailId, update: { status: 'CANCELLED' } });
  }

  /** `presending` may not fire for scheduled sends (Spike 1), so the pixel goes in when the menu opens. */
  private onScheduleMenuOpening(config: ClientConfig): void {
    this.scheduleMenuOpen = true;
    try {
      if (this.shouldTrack(config) && this.draft) this.prepareBody(config.publicBaseUrl, this.draft);
    } catch {
      this.pending = null;
    }
  }

  /** A scheduled send that never fired `sent` must not be deleted as an abandoned draft after 24 h. */
  private async onDestroy(): Promise<void> {
    const pending = this.pending;
    if (!this.scheduleMenuOpen || !pending || this.reportedSent) return;
    await this.ask({
      type: 'mp:update',
      emailId: pending.emailId,
      update: { status: 'SCHEDULED', subject: pending.subject, recipients: pending.recipients },
    });
  }

  private recipients(): Recipient[] {
    const convert = (kind: RecipientKind, contacts: readonly Contact[]): Recipient[] =>
      contacts
        .map((contact) => ({ email: contact.emailAddress.trim().toLowerCase(), name: contact.name?.trim() }))
        .filter((contact) => SIMPLE_ADDRESS.test(contact.email) && contact.email.length <= 254)
        .map((contact) => ({ email: contact.email, kind, ...(contact.name ? { name: contact.name.slice(0, 200) } : {}) }));
    return [
      ...convert('TO', this.view.getToRecipients()),
      ...convert('CC', this.view.getCcRecipients()),
      ...convert('BCC', this.view.getBccRecipients()),
    ].slice(0, 100);
  }

  private render(): void {
    const config = this.env.config;
    if (this.chip && config) this.chip.update(this.chipState(config));
  }

  private chipState(config: ClientConfig): ChipState {
    const phase = !this.tracking ? 'off' : this.draft ? 'on' : this.registration ? 'connecting' : 'offline';
    return {
      phase,
      tracking: this.tracking,
      trackLinks: this.trackLinks,
      followUp: this.followUp,
      defaultFollowUpHours: config.followUpHours,
    };
  }
}
