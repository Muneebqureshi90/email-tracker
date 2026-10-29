import type { ImageDescriptor, ThreadRowView } from '@inboxsdk/core';
import type { Mark } from '../core/api-types';
import { markIcon, markTooltip } from '../core/marks';
import type { Ask } from './bridge';
import type { GmailEnv } from './env';
import { Live } from './live';

const BATCH_MS = 150;
const CACHE_MS = 30_000;
const MAX_IDS = 100;

function describe(mark: Mark | null, now: number): ImageDescriptor | null {
  return mark ? { imageUrl: markIcon(mark), tooltip: markTooltip(mark, now), orderHint: 1 } : null;
}

/** ✓/✓✓ on thread rows (PLAN §4.5): thread IDs are batched for 150 ms, results cached for 30 s. */
export class ThreadRowMarks {
  private readonly rows = new Map<ThreadRowView, { threadId: string; image: Live<ImageDescriptor | null> }>();
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
    const image = new Live<ImageDescriptor | null>(fresh ? describe(cached.mark, this.now()) : null);
    row.addImage(image.stream);
    this.rows.set(row, { threadId, image });
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
        if (wanted.has(entry.threadId)) entry.image.set(describe(marks[entry.threadId] ?? null, at));
      }
    }
  }
}
