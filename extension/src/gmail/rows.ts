import type { ThreadRowView } from '@inboxsdk/core';
import type { Mark } from '../core/api-types';
import { countHtml, markEmailId, markHtml, markView, toneOf } from '../core/marks';
import type { Ask } from './bridge';
import { element, tickElement } from './card';
import type { GmailEnv } from './env';
import { Live } from './live';

const BATCH_MS = 150;
const CACHE_MS = 30_000;
const MAX_IDS = 100;

/**
 * Gmail's sender names in a thread row ("me", "To: Jane"); the mark goes into their table cell, next to
 * this div, as InboxSDK does with its draft label. Gmail markup, not an InboxSDK API.
 */
const SENDER_NAMES = 'td > div.yW';
const SENDER_MARK = 'mp-sender-mark';

/**
 * A thread-row attachment icon: InboxSDK puts it in Gmail's attachment column, just left of the date,
 * and widens the column 16 px per icon. iconHtml is our own markup (core/marks.ts), never row text.
 */
export interface RowIcon {
  iconHtml: string;
  iconClass: string;
}

export function tickIcon(mark: Mark | null): RowIcon | null {
  return mark ? { iconHtml: markHtml(mark, false), iconClass: 'mp-slot' } : null;
}

export function countIcon(mark: Mark | null): RowIcon | null {
  const html = mark ? countHtml(mark) : null;
  return html ? { iconHtml: html, iconClass: 'mp-slot mp-slot-count' } : null;
}

/**
 * Puts ✓/✓✓ (and the count from 2 opens) at the end of the sender column, between the names and the
 * subject, where Gmail's hover buttons do not cover it. Built from our constants with DOM calls only.
 * Returns false when Gmail's sender cell is missing, so the caller falls back to the slots by the date.
 */
export function placeSenderMark(row: HTMLElement, mark: Mark | null): boolean {
  const cell = row.querySelector<HTMLElement>(SENDER_NAMES)?.parentElement;
  if (!cell) return false;
  cell.querySelector(`:scope > .${SENDER_MARK}`)?.remove();
  if (!mark) return true;
  const doc = row.ownerDocument;
  const view = markView(mark);
  const node = element(doc, 'span', `mp-mark ${SENDER_MARK} ${toneOf(view.status)}`);
  node.dataset.mpEmail = markEmailId(mark);
  node.tabIndex = 0;
  node.setAttribute('role', 'img');
  node.setAttribute('aria-label', `MailPulse: ${view.label}`);
  node.append(tickElement(doc, view.status));
  if (view.count !== null) node.append(element(doc, 'span', 'mp-count', String(view.count)));
  cell.prepend(node);
  return true;
}

interface RowEntry {
  threadId: string;
  element: HTMLElement;
  mark: Mark | null;
  tick: Live<RowIcon | null>;
  count: Live<RowIcon | null>;
}

/**
 * ✓/✓✓ on thread rows (PLAN §4.5, brief Part C) in every list: Sent, the conversation list, labels.
 * The mark sits at the end of the sender column; next to the date only when that cell is not found.
 * Thread IDs are batched for 150 ms and results cached for 30 s; new activity refreshes them at once.
 */
export class ThreadRowMarks {
  private readonly rows = new Map<ThreadRowView, RowEntry>();
  private readonly cache = new Map<string, { mark: Mark | null; at: number }>();
  private readonly pending = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly env: GmailEnv,
    private readonly ask: Ask,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async add(row: ThreadRowView): Promise<void> {
    const threadId = await row.getThreadIDIfStableAsync().catch(() => null);
    if (!threadId || row.destroyed) return;
    const cached = this.cache.get(threadId);
    const fresh = cached && this.now() - cached.at < CACHE_MS;
    const entry: RowEntry = {
      threadId,
      element: row.getElement(),
      mark: fresh ? cached.mark : null,
      tick: new Live<RowIcon | null>(null),
      count: new Live<RowIcon | null>(null),
    };
    // InboxSDK accepts a stream for attachment icons (it re-renders on every value; null removes the icon).
    row.addAttachmentIcon(entry.tick.stream);
    row.addAttachmentIcon(entry.count.stream);
    this.paint(entry);
    // Gmail re-renders the sender cell (new message, read state); put the mark back when it goes.
    const observer = new MutationObserver(() => {
      if (entry.mark && !entry.element.querySelector(`.${SENDER_MARK}`)) this.paint(entry);
    });
    observer.observe(entry.element, { childList: true, subtree: true });
    this.rows.set(row, entry);
    row.on('destroy', () => {
      observer.disconnect();
      this.rows.delete(row);
    });
    if (!fresh) this.request(threadId);
  }

  /** New activity arrived: ask again for every visible row. */
  refresh(): void {
    this.cache.clear();
    for (const { threadId } of this.rows.values()) this.request(threadId);
  }

  private paint(entry: RowEntry): void {
    const placed = placeSenderMark(entry.element, entry.mark);
    entry.tick.set(placed ? null : tickIcon(entry.mark));
    entry.count.set(placed ? null : countIcon(entry.mark));
  }

  private request(threadId: string): void {
    this.pending.add(threadId);
    this.timer ??= setTimeout(() => void this.flush(), BATCH_MS);
  }

  private async flush(): Promise<void> {
    this.timer = null;
    const ids = [...this.pending];
    this.pending.clear();
    if (!this.env.active) return;
    for (let start = 0; start < ids.length; start += MAX_IDS) {
      const chunk = ids.slice(start, start + MAX_IDS);
      const marks = await this.ask({ type: 'mp:marks', account: this.env.account, by: 'thread', ids: chunk });
      if (!marks) continue;
      const at = this.now();
      for (const id of chunk) this.cache.set(id, { mark: marks[id] ?? null, at });
      const wanted = new Set(chunk);
      for (const entry of this.rows.values()) {
        if (!wanted.has(entry.threadId)) continue;
        entry.mark = marks[entry.threadId] ?? null;
        this.paint(entry);
      }
    }
  }
}
