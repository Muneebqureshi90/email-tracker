import type { ComposeButtonDescriptor, ComposeView } from '@inboxsdk/core';
import type { ClientConfig, Preferences, Recipient, RecipientKind } from '../core/api-types';
import { extractLinks, rewriteLinks, type TrackedLink } from '../core/links';
import { ICON_TRACK_OFF, ICON_TRACK_ON } from '../core/marks';
import { findPixels, isInQuote, preparePixel, uniqueTokens } from '../core/pixel';
import { isSelfOnly } from '../core/recipients';
import type { Ask } from './bridge';
import { looksConfidential } from './dom';
import type { GmailEnv } from './env';
import { Live } from './live';

const GMAIL_ID = /^[A-Za-z0-9:_-]{1,64}$/;
const SIMPLE_ADDRESS = /^[^\s@]+@[^\s@]+$/;
const REGISTER_WAIT_MS = 2000;
const MAX_SUBJECT = 998;
const FOLLOW_UP_CHOICES = [24, 48, 72] as const;

type FollowUp = 0 | (typeof FOLLOW_UP_CHOICES)[number];

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
  private statusText: HTMLElement | null = null;
  private controls: HTMLInputElement[] = [];
  private followUpSelect: HTMLSelectElement | null = null;
  private linkTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly links = new Map<string, TrackedLink>();
  private readonly clientRef: string;
  private readonly linkScanDelayMs: number;
  private readonly button: Live<ComposeButtonDescriptor>;

  constructor(
    private readonly view: ComposeView,
    private readonly env: GmailEnv,
    private readonly ask: Ask,
    options: ComposeOptions = {},
  ) {
    this.clientRef = (options.newClientRef ?? (() => crypto.randomUUID()))();
    this.linkScanDelayMs = options.linkScanDelayMs ?? 1000;
    this.button = new Live(this.buttonDescriptor());
  }

  start(): void {
    const config = this.env.config;
    if (!config || !this.env.active) return;
    this.tracking = config.trackingDefault;
    this.trackLinks = config.linkTrackingDefault;
    this.view.addButton(this.button.stream);
    this.buildStatusBar(this.view.addStatusBar({ height: 28, orderHint: 200 }).el, config);

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
      void this.onDestroy();
    });
    this.render();
    void this.inspectBody(config.publicBaseUrl);
  }

  /** Status line plus the per-email extras: link tracking and the follow-up time (Q8). DOM only, no HTML strings. */
  private buildStatusBar(bar: HTMLElement, config: ClientConfig): void {
    const doc = bar.ownerDocument;
    const row = doc.createElement('div');
    row.style.cssText =
      'display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:0 12px;font:12px/28px Roboto,Arial,sans-serif;color:#5f6368;';
    this.statusText = doc.createElement('span');

    const linksLabel = doc.createElement('label');
    linksLabel.style.cssText = 'display:inline-flex;align-items:center;gap:4px;cursor:pointer;';
    const linksBox = doc.createElement('input');
    linksBox.type = 'checkbox';
    linksBox.checked = this.trackLinks;
    linksBox.title = 'Tracked links only work while your PC and MailPulse are running';
    linksBox.addEventListener('change', () => this.setTrackLinks(linksBox.checked, config.publicBaseUrl));
    linksLabel.append(linksBox, doc.createTextNode('Track links'));

    const followLabel = doc.createElement('label');
    followLabel.style.cssText = 'display:inline-flex;align-items:center;gap:4px;';
    const select = doc.createElement('select');
    select.style.cssText = 'font:inherit;color:inherit;border:1px solid #dadce0;border-radius:4px;background:transparent;';
    for (const value of [0, ...FOLLOW_UP_CHOICES]) {
      const option = doc.createElement('option');
      option.value = String(value);
      option.textContent = value === 0 ? `default (${config.followUpHours} h)` : `${value} h`;
      select.append(option);
    }
    select.addEventListener('change', () => this.setFollowUp(Number(select.value) as FollowUp));
    followLabel.append(doc.createTextNode('Remind me if unopened after'), select);
    this.followUpSelect = select;
    this.controls = [linksBox];

    row.append(this.statusText, linksLabel, followLabel);
    bar.append(row);
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

  private toggle(): void {
    this.tracking = !this.tracking;
    if (this.tracking) void this.ensureRegistered();
    this.render();
  }

  private setTrackLinks(on: boolean, publicBaseUrl: string): void {
    this.trackLinks = on;
    if (this.draft) this.savePreferences({ trackLinks: on });
    if (on) void this.scanLinks(publicBaseUrl);
  }

  private setFollowUp(hours: FollowUp): void {
    this.followUp = hours;
    if (this.draft) this.savePreferences({ followUpHours: hours });
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
    this.button.set(this.buttonDescriptor());
    if (this.statusText) this.statusText.textContent = this.statusLine();
    for (const control of this.controls) control.disabled = !this.tracking;
    if (this.followUpSelect) this.followUpSelect.disabled = !this.tracking;
  }

  private statusLine(): string {
    if (!this.tracking) return 'MailPulse: this email will not be tracked';
    if (this.draft) return 'MailPulse: tracking on';
    if (this.registration) return 'MailPulse: connecting…';
    return 'MailPulse is not reachable: this email will be sent without tracking';
  }

  private buttonDescriptor(): ComposeButtonDescriptor {
    return {
      title: this.tracking ? 'MailPulse tracking is on (click to turn off)' : 'MailPulse tracking is off (click to turn on)',
      iconUrl: this.tracking ? ICON_TRACK_ON : ICON_TRACK_OFF,
      type: 'MODIFIER',
      orderHint: 900,
      onClick: () => this.toggle(),
    };
  }
}
