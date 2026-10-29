import type { ComposeButtonDescriptor, ComposeView } from '@inboxsdk/core';
import type { ClientConfig, Recipient, RecipientKind } from '../core/api-types';
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
}

type Contact = { emailAddress: string; name?: string | null };

function validGmailId(id: string | null): string | undefined {
  return id && GMAIL_ID.test(id) ? id : undefined;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

/**
 * One compose window (PLAN §4.1). Registers the email while the owner writes, inserts the pixel
 * synchronously at send, and reports the send. Every handler fails open: MailPulse never stops,
 * delays or changes a send because of its own problems.
 */
export class ComposeSession {
  private tracking = false;
  private draft: TrackedDraft | null = null;
  private registration: Promise<TrackedDraft | null> | null = null;
  private resending = false;
  private scheduleMenuOpen = false;
  private pending: PendingSend | null = null;
  private reportedSent = false;
  private statusText: HTMLElement | null = null;
  private readonly clientRef: string;
  private readonly button: Live<ComposeButtonDescriptor>;

  constructor(
    private readonly view: ComposeView,
    private readonly env: GmailEnv,
    private readonly ask: Ask,
    newClientRef: () => string = () => crypto.randomUUID(),
  ) {
    this.clientRef = newClientRef();
    this.button = new Live(this.buttonDescriptor());
  }

  start(): void {
    const config = this.env.config;
    if (!config || !this.env.active) return;
    this.tracking = config.trackingDefault;
    this.view.addButton(this.button.stream);
    const bar = this.view.addStatusBar({ height: 24, orderHint: 200 });
    this.statusText = bar.el.ownerDocument.createElement('span');
    this.statusText.className = 'mailpulse-status';
    this.statusText.style.cssText = 'font: 12px/24px Roboto, Arial, sans-serif; color: #5f6368; padding: 0 12px;';
    bar.el.append(this.statusText);

    this.view.on('presending', (event) => this.onPresending(event, config));
    this.view.on('sent', (event) => void this.onSent(event));
    this.view.on('sendCanceled', () => void this.onSendCanceled());
    this.view.on('scheduleSendMenuOpening', () => this.onScheduleMenuOpening(config));
    this.view.on('scheduleSendMenuOpenCanceled', () => {
      this.scheduleMenuOpen = false;
    });
    this.view.on('destroy', () => void this.onDestroy());
    this.render();
    void this.inspectBody(config.publicBaseUrl);
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
      this.registration = this.ask({
        type: 'mp:register',
        account: this.env.account,
        clientRef: this.clientRef,
        trackLinks: false,
      }).then((response) => {
        if (response) this.draft = { id: response.id, pixelUrl: response.pixelUrl };
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
    const result = preparePixel(this.view.getBodyElement(), { publicBaseUrl, pixelUrl: draft?.pixelUrl ?? null });
    this.pending =
      draft && result.present
        ? {
            emailId: draft.id,
            subject: this.view.getSubject().slice(0, MAX_SUBJECT),
            recipients: this.recipients(),
            sentAt: new Date().toISOString(),
          }
        : null;
  }

  /** Fallback flow (D-011): cancel, register within 2 s, edit the body, send again. */
  private async cancelAndResend(publicBaseUrl: string): Promise<void> {
    const draft = await withTimeout(this.ensureRegistered(), REGISTER_WAIT_MS).catch(() => null);
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
