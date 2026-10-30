import type { ThreadRowView } from '@inboxsdk/core';
import type { Mark } from '../core/api-types';
import { countHtml, markHtml } from '../core/marks';
import type { Ask } from './bridge';
import type { GmailEnv } from './env';
import { Live } from './live';

const BATCH_MS = 150;
const CACHE_MS = 30_000;
const MAX_IDS = 100;

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

interface RowEntry {
  threadId: string;
  tick: Live<RowIcon | null>;
  count: Live<RowIcon | null>;
}

/**
 * ✓/✓✓ on thread rows (PLAN §4.5, brief Part C) in every list: Sent, the conversation list, labels.
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
    const mark = fresh ? cached.mark : null;
    const entry: RowEntry = { threadId, tick: new Live(tickIcon(mark)), count: new Live(countIcon(mark)) };
    // InboxSDK accepts a stream for attachment icons (it re-renders on every value; null removes the icon).
    row.addAttachmentIcon(entry.tick.stream);
    row.addAttachmentIcon(entry.count.stream);
    this.rows.set(row, entry);
    row.on('destroy', () => this.rows.delete(row));
    if (!fresh) this.request(threadId);
  }

  /** New activity arrived: ask again for every visible row. */
  refresh(): void {
    this.cache.clear();
    for (const { threadId } of this.rows.values()) this.request(threadId);
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
        const mark = marks[entry.threadId] ?? null;
        entry.tick.set(tickIcon(mark));
        entry.count.set(countIcon(mark));
      }
    }
  }
}
