import type { DocumentSummary } from '../core/api-types';
import { documentLinkText } from '../core/format';
import type { MarkStatus } from '../core/marks';
import { element, tickElement } from './card';

export const FOLLOW_UP_CHOICES = [24, 48, 72] as const;
export type FollowUp = 0 | (typeof FOLLOW_UP_CHOICES)[number];

/** on: tracked; off: switched off; connecting: registering; offline: MailPulse not reachable (sent untracked). */
export type ChipPhase = 'on' | 'off' | 'connecting' | 'offline';

export interface ChipState {
  phase: ChipPhase;
  tracking: boolean;
  trackLinks: boolean;
  followUp: FollowUp;
  defaultFollowUpHours: number;
}

export interface ChipActions {
  setTracking(on: boolean): void;
  setTrackLinks(on: boolean): void;
  setFollowUp(hours: FollowUp): void;
  listDocuments(): Promise<DocumentSummary[] | null>;
  /** Creates this email's link for the document and inserts it at the cursor. */
  insertDocument(document: DocumentSummary): Promise<boolean>;
}

const LABELS: Record<ChipPhase, string> = {
  on: 'Tracking on',
  off: 'Tracking off',
  connecting: 'Connecting…',
  offline: 'MailPulse offline',
};

const DESCRIPTIONS: Record<ChipPhase, string> = {
  on: 'MailPulse is tracking this email.',
  off: 'MailPulse will not track this email.',
  connecting: 'MailPulse is getting ready to track this email.',
  offline: 'MailPulse is not reachable: this email will be sent without tracking.',
};

const TICKS: Record<ChipPhase, MarkStatus> = { on: 'opened', off: 'sent', connecting: 'sent', offline: 'unreliable' };
const CARET = '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function caret(doc: Document): Element {
  return doc.importNode(new DOMParser().parseFromString(CARET, 'image/svg+xml').documentElement, true);
}

type DocsView = { kind: 'closed' } | { kind: 'loading' } | { kind: 'list'; documents: DocumentSummary[] } | { kind: 'error'; text: string };

/**
 * The compose chip next to Send, "✓✓ Tracking on ▾" (brief Part C), and its menu: Track opens, Track
 * links, the follow-up time and Insert tracked file. DOM and textContent only; keyboard: Enter, Space
 * or ArrowDown opens, arrows move, Escape closes and returns focus, Tab leaves.
 */
export class ComposeChip {
  readonly element: HTMLButtonElement;
  private menu: HTMLElement | null = null;
  private docs: DocsView = { kind: 'closed' };
  private readonly onOutside = (event: Event): void => {
    const target = event.target;
    if (target instanceof Node && (this.element.contains(target) || this.menu?.contains(target))) return;
    this.close(false);
  };

  constructor(
    private readonly doc: Document,
    private state: ChipState,
    private readonly actions: ChipActions,
  ) {
    const button = element(doc, 'button', 'mp-chip');
    button.type = 'button';
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    button.dataset.tooltip = 'MailPulse';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.menu) this.close(false);
      else this.open();
    });
    button.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' && !this.menu) {
        event.preventDefault();
        this.open();
      }
    });
    this.element = button;
    this.paint();
  }

  update(state: ChipState): void {
    this.state = state;
    this.paint();
    if (this.menu) this.fillMenu();
  }

  setCompact(compact: boolean): void {
    this.element.classList.toggle('mp-compact', compact);
  }

  get isOpen(): boolean {
    return this.menu !== null;
  }

  destroy(): void {
    this.close(false);
    this.element.remove();
  }

  private paint(): void {
    const { phase } = this.state;
    const button = this.element;
    button.className = `mp-chip mp-chip-${phase}${button.classList.contains('mp-compact') ? ' mp-compact' : ''}`;
    button.setAttribute('aria-label', `${DESCRIPTIONS[phase]} Open the MailPulse menu.`);
    const icon = element(this.doc, 'span', `mp-mark ${phase === 'on' ? 'mp-green' : 'mp-grey'}`);
    icon.append(tickElement(this.doc, TICKS[phase]));
    button.replaceChildren(icon, element(this.doc, 'span', 'mp-chip-label', LABELS[phase]), caret(this.doc));
  }

  private open(): void {
    const menu = element(this.doc, 'div', 'mp-menu');
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'MailPulse for this email');
    menu.addEventListener('keydown', (event) => this.onMenuKey(event));
    this.menu = menu;
    this.fillMenu();
    this.doc.body.append(menu);
    this.element.setAttribute('aria-expanded', 'true');
    this.position();
    this.doc.addEventListener('mousedown', this.onOutside, true);
    this.items()[0]?.focus();
  }

  close(returnFocus: boolean): void {
    if (!this.menu) return;
    this.menu.remove();
    this.menu = null;
    this.docs = { kind: 'closed' };
    this.element.setAttribute('aria-expanded', 'false');
    this.doc.removeEventListener('mousedown', this.onOutside, true);
    if (returnFocus) this.element.focus();
  }

  private items(): HTMLButtonElement[] {
    return this.menu ? Array.from(this.menu.querySelectorAll<HTMLButtonElement>('button.mp-item:not([disabled])')) : [];
  }

  private onMenuKey(event: KeyboardEvent): void {
    const items = this.items();
    const index = items.indexOf(this.doc.activeElement as HTMLButtonElement);
    const move = (to: number) => {
      event.preventDefault();
      items[(to + items.length) % items.length]?.focus();
    };
    if (event.key === 'ArrowDown') move(index + 1);
    else if (event.key === 'ArrowUp') move(index - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(items.length - 1);
    else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close(true);
    } else if (event.key === 'Tab') this.close(false);
  }

  private item(role: string, label: string, onSelect: () => void, options: { checked?: boolean; disabled?: boolean; hint?: string } = {}): HTMLButtonElement {
    const button = element(this.doc, 'button', 'mp-item');
    button.type = 'button';
    button.tabIndex = -1;
    button.setAttribute('role', role);
    if (options.checked !== undefined) button.setAttribute('aria-checked', String(options.checked));
    if (options.disabled) button.disabled = true;
    const text = element(this.doc, 'span', 'mp-item-text');
    text.append(element(this.doc, 'span', 'mp-item-label', label));
    if (options.hint) text.append(element(this.doc, 'span', 'mp-item-hint', options.hint));
    button.append(text);
    if (role === 'menuitemcheckbox') button.append(element(this.doc, 'span', 'mp-switch'));
    if (role === 'menuitemradio') button.append(element(this.doc, 'span', 'mp-radio'));
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!button.disabled) onSelect();
    });
    return button;
  }

  /** Rebuilds the menu content, keeping the focused item. */
  private fillMenu(): void {
    const menu = this.menu;
    if (!menu) return;
    const focused = this.items().indexOf(this.doc.activeElement as HTMLButtonElement);
    const { tracking, trackLinks, followUp, defaultFollowUpHours } = this.state;
    const parts: HTMLElement[] = [
      element(this.doc, 'div', 'mp-menu-title', 'MailPulse'),
      this.item('menuitemcheckbox', 'Track opens', () => this.actions.setTracking(!tracking), { checked: tracking }),
      this.item('menuitemcheckbox', 'Track links', () => this.actions.setTrackLinks(!trackLinks), {
        checked: trackLinks,
        disabled: !tracking,
        hint: 'Links work while your PC is on',
      }),
      element(this.doc, 'div', 'mp-menu-rule'),
      element(this.doc, 'div', 'mp-menu-section', 'Follow-up if not opened'),
    ];
    for (const hours of [0, ...FOLLOW_UP_CHOICES] as FollowUp[]) {
      const label = hours === 0 ? `Default (${defaultFollowUpHours} h)` : `After ${hours} hours`;
      parts.push(this.item('menuitemradio', label, () => this.actions.setFollowUp(hours), { checked: followUp === hours, disabled: !tracking }));
    }
    parts.push(element(this.doc, 'div', 'mp-menu-rule'));
    const insert = this.item('menuitem', 'Insert tracked file…', () => void this.toggleDocuments());
    insert.setAttribute('aria-expanded', String(this.docs.kind !== 'closed'));
    parts.push(insert);
    if (this.docs.kind !== 'closed') parts.push(...this.documentParts());
    menu.replaceChildren(...parts);
    if (focused >= 0) this.items()[Math.min(focused, this.items().length - 1)]?.focus();
  }

  private documentParts(): HTMLElement[] {
    const docs = this.docs;
    const parts: HTMLElement[] = [];
    if (docs.kind === 'loading') parts.push(element(this.doc, 'div', 'mp-menu-note', 'Loading your documents…'));
    if (docs.kind === 'error') parts.push(element(this.doc, 'div', 'mp-menu-note mp-menu-error', docs.text));
    if (docs.kind === 'list' && docs.documents.length === 0) {
      parts.push(element(this.doc, 'div', 'mp-menu-note', 'No documents yet. Upload a PDF in MailPulse under Documents.'));
    }
    if (docs.kind === 'list') {
      for (const document of docs.documents) {
        const item = this.item('menuitem', documentLinkText(document.name, document.sizeBytes), () => void this.insert(document, item));
        item.classList.add('mp-item-doc');
        parts.push(item);
      }
    }
    parts.push(element(this.doc, 'div', 'mp-menu-note', 'Each email gets its own link. Links work only while your PC and MailPulse are running.'));
    return parts;
  }

  private async toggleDocuments(): Promise<void> {
    if (this.docs.kind !== 'closed') {
      this.docs = { kind: 'closed' };
      this.fillMenu();
      return;
    }
    this.docs = { kind: 'loading' };
    this.fillMenu();
    const documents = await this.actions.listDocuments();
    if (this.docs.kind !== 'loading') return;
    this.docs = documents ? { kind: 'list', documents } : { kind: 'error', text: 'MailPulse is not reachable right now.' };
    this.fillMenu();
  }

  private async insert(document: DocumentSummary, item: HTMLButtonElement): Promise<void> {
    item.disabled = true;
    item.setAttribute('aria-busy', 'true');
    const done = await this.actions.insertDocument(document);
    if (done) {
      this.close(false);
      return;
    }
    this.docs = { kind: 'error', text: 'Could not create the link. Check that MailPulse is running, then try again.' };
    this.fillMenu();
  }

  private position(): void {
    const menu = this.menu;
    const view = this.doc.defaultView;
    if (!menu || !view) return;
    const rect = this.element.getBoundingClientRect();
    const width = menu.offsetWidth || 280;
    const height = menu.offsetHeight || 320;
    const margin = 8;
    const left = Math.min(Math.max(margin, rect.left), Math.max(margin, view.innerWidth - width - margin));
    // Above the chip (it sits at the bottom of the compose window); below when there is no room.
    let top = rect.top - height - 6;
    if (top < margin) top = Math.min(rect.bottom + 6, Math.max(margin, view.innerHeight - height - margin));
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
  }
}

/**
 * The Send button group of a compose window, found the way InboxSDK finds it
 * (GmailComposeView.getSendButtonGroup). Null when Gmail's markup differs: the chip then goes into
 * an InboxSDK status bar instead (fail open).
 */
export function sendGroupOf(root: ParentNode): HTMLElement | null {
  const schedule = root.querySelector('.IZ .Up div > [role=button][aria-haspopup=true]:not([class^=inboxsdk_])');
  if (schedule?.parentElement) return schedule.parentElement;
  return root.querySelector<HTMLElement>('.IZ .Up div > div[role=button]:not(.Uo):not([aria-haspopup=true]):not([class^=inboxsdk_])');
}
