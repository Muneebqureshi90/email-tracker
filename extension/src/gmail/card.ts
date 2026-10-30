import type { EmailCard } from '../core/api-types';
import { cardContent, markSvg, type MarkStatus } from '../core/marks';
import type { Ask } from './bridge';
import type { GmailEnv } from './env';

const SHOW_DELAY_MS = 300;
const HIDE_DELAY_MS = 200;
const CACHE_MS = 15_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CARD_ID = 'mp-hover-card';

/** Our constant tick SVG as a DOM node (parsed, never innerHTML). */
export function tickElement(doc: Document, status: MarkStatus): Element {
  const parsed = new DOMParser().parseFromString(markSvg(status), 'image/svg+xml').documentElement;
  return doc.importNode(parsed, true);
}

/** A new element with an optional class and plain text (textContent only: subjects are untrusted). */
export function element<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className: string | null = null,
  text: string | null = null,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== null) node.textContent = text;
  return node;
}

function recipientsLine(card: EmailCard): string | null {
  const addresses = card.recipients.map((recipient) => recipient.name || recipient.email).filter((value) => value.length > 0);
  if (addresses.length === 0) return null;
  const shown = addresses.slice(0, 3).join(', ');
  return addresses.length > 3 ? `To ${shown} +${addresses.length - 3}` : `To ${shown}`;
}

/** The hover card's content: status, recipients, opens with times, clicks, alerts, documents, link. */
export function cardParts(
  doc: Document,
  emailId: string,
  card: EmailCard | null,
  options: { now: number; timeZone: string | undefined; backendUrl: string | null },
): HTMLElement[] {
  if (!card) return [element(doc, 'p', 'mp-card-muted', 'MailPulse is not reachable right now.')];
  const content = cardContent(card, options.now, options.timeZone);
  const parts: HTMLElement[] = [];
  const head = element(doc, 'div', 'mp-card-head');
  const icon = element(doc, 'span', `mp-mark ${content.status === 'sent' ? 'mp-grey' : 'mp-green'}`);
  icon.append(tickElement(doc, content.status));
  head.append(icon, element(doc, 'strong', 'mp-card-title', content.headline));
  parts.push(head);
  if (card.subject) parts.push(element(doc, 'p', 'mp-card-subject', card.subject));
  const recipients = recipientsLine(card);
  if (recipients) parts.push(element(doc, 'p', 'mp-card-muted', recipients));
  if (content.summary) parts.push(element(doc, 'p', null, content.summary));
  if (content.opens.length > 0) {
    parts.push(element(doc, 'p', 'mp-card-label', 'Latest opens'));
    const list = element(doc, 'ul', 'mp-card-list');
    for (const open of content.opens) list.append(element(doc, 'li', null, open));
    parts.push(list);
  }
  if (content.clicks) parts.push(element(doc, 'p', null, content.clicks));
  for (const alert of content.alerts) parts.push(element(doc, 'p', 'mp-card-alert', alert));
  for (const line of content.documents) parts.push(element(doc, 'p', 'mp-card-doc', line));
  if (options.backendUrl) {
    const link = element(doc, 'a', 'mp-card-link', 'Open in MailPulse');
    link.href = `${options.backendUrl}/emails/${emailId}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    parts.push(link);
  }
  return parts;
}

/**
 * The hover card on MailPulse marks (brief Part C): custom, not a native title. It appears after
 * 300 ms of hover or at once on keyboard focus, and shows status, opens with times, clicks, alerts,
 * documents and "Open in MailPulse". Enter on a focused mark opens the email in MailPulse.
 */
export class HoverCard {
  private card: HTMLElement | null = null;
  private anchor: HTMLElement | null = null;
  private showTimer: ReturnType<typeof setTimeout> | undefined;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private ticket = 0;
  private readonly cache = new Map<string, { card: EmailCard | null; at: number }>();

  constructor(
    private readonly env: GmailEnv,
    private readonly ask: Ask,
    private readonly doc: Document = document,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Listens on the whole document (marks come and go with Gmail's rows); returns the undo. */
  install(): () => void {
    const listeners: [string, (event: Event) => void][] = [
      ['mouseover', (event) => this.onOver(event)],
      ['mouseout', (event) => this.onOut(event)],
      ['focusin', (event) => this.onFocus(event)],
      ['focusout', (event) => this.onOut(event)],
      ['keydown', (event) => this.onKey(event as KeyboardEvent)],
      ['scroll', () => this.hide()],
    ];
    for (const [type, listener] of listeners) this.doc.addEventListener(type, listener, true);
    return () => {
      for (const [type, listener] of listeners) this.doc.removeEventListener(type, listener, true);
      this.hide();
    };
  }

  /** New activity: the next card shows fresh numbers. */
  invalidate(): void {
    this.cache.clear();
  }

  get visible(): HTMLElement | null {
    return this.card;
  }

  private markOf(target: EventTarget | null): HTMLElement | null {
    return target instanceof Element ? target.closest<HTMLElement>('.mp-mark[data-mp-email]') : null;
  }

  private inCard(target: EventTarget | null): boolean {
    return target instanceof Node && this.card !== null && this.card.contains(target);
  }

  private onOver(event: Event): void {
    if (this.inCard(event.target)) {
      clearTimeout(this.hideTimer);
      return;
    }
    const mark = this.markOf(event.target);
    if (!mark) return;
    clearTimeout(this.hideTimer);
    if (mark === this.anchor && this.card) return;
    this.schedule(mark, SHOW_DELAY_MS);
  }

  private onFocus(event: Event): void {
    const mark = this.markOf(event.target);
    if (!mark) return;
    clearTimeout(this.hideTimer);
    this.schedule(mark, 0);
  }

  private onOut(event: Event): void {
    const next = (event as MouseEvent).relatedTarget;
    if (this.inCard(next) || (this.anchor !== null && this.markOf(next) === this.anchor)) return;
    if (!this.markOf(event.target) && !this.inCard(event.target)) return;
    clearTimeout(this.showTimer);
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.hide(), HIDE_DELAY_MS);
  }

  private onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.card) {
      this.hide();
      return;
    }
    const mark = this.markOf(event.target);
    if (!mark || event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    this.openEmail(mark.dataset.mpEmail ?? '');
  }

  private schedule(mark: HTMLElement, delay: number): void {
    clearTimeout(this.showTimer);
    this.showTimer = setTimeout(() => void this.show(mark), delay);
  }

  private async show(mark: HTMLElement): Promise<void> {
    const emailId = mark.dataset.mpEmail ?? '';
    if (!UUID.test(emailId) || !mark.isConnected) return;
    this.anchor = mark;
    const ticket = ++this.ticket;
    const cached = this.cache.get(emailId);
    if (cached && this.now() - cached.at < CACHE_MS) {
      this.render(mark, emailId, cached.card, false);
      return;
    }
    this.render(mark, emailId, null, true);
    const card = await this.ask({ type: 'mp:card', emailId });
    this.cache.set(emailId, { card, at: this.now() });
    if (ticket === this.ticket && this.anchor === mark) this.render(mark, emailId, card, false);
  }

  hide(): void {
    clearTimeout(this.showTimer);
    clearTimeout(this.hideTimer);
    this.ticket++;
    this.anchor?.removeAttribute('aria-describedby');
    this.anchor = null;
    this.card?.remove();
    this.card = null;
  }

  private openEmail(emailId: string): void {
    const backend = this.env.backendUrl;
    if (!backend || !UUID.test(emailId)) return;
    this.doc.defaultView?.open(`${backend}/emails/${emailId}`, '_blank', 'noopener,noreferrer');
  }

  private render(mark: HTMLElement, emailId: string, card: EmailCard | null, loading: boolean): void {
    const doc = this.doc;
    const root = this.card ?? element(doc, 'div', 'mp-card');
    root.id = CARD_ID;
    root.setAttribute('role', 'tooltip');
    root.replaceChildren(
      ...(loading
        ? [element(doc, 'p', 'mp-card-muted', 'Loading MailPulse details…')]
        : cardParts(doc, emailId, card, { now: this.now(), timeZone: this.env.config?.timeZone, backendUrl: this.env.backendUrl })),
    );
    if (!root.isConnected) doc.body.append(root);
    mark.setAttribute('aria-describedby', CARD_ID);
    this.card = root;
    this.position(mark, root);
  }

  private position(mark: HTMLElement, card: HTMLElement): void {
    const view = this.doc.defaultView;
    if (!view) return;
    const rect = mark.getBoundingClientRect();
    const width = card.offsetWidth || 300;
    const height = card.offsetHeight || 160;
    const margin = 8;
    const left = Math.min(Math.max(margin, rect.left + rect.width / 2 - width / 2), Math.max(margin, view.innerWidth - width - margin));
    let top = rect.bottom + 6;
    if (top + height > view.innerHeight - margin) top = Math.max(margin, rect.top - height - 6);
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
  }
}
