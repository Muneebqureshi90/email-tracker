import type { MessageAttachmentIconDescriptor, MessageView } from '@inboxsdk/core';
import type { Mark } from '../core/api-types';
import { markIcon, markTooltip } from '../core/marks';
import { findPixels, uniqueTokens } from '../core/pixel';
import type { Ask } from './bridge';
import type { GmailEnv } from './env';
import { Live } from './live';

const REPORT_THROTTLE_MS = 5_000;

function describe(mark: Mark, now: number): MessageAttachmentIconDescriptor {
  return { iconUrl: markIcon(mark), tooltip: markTooltip(mark, now) };
}

/**
 * Message views in a conversation: report every MailPulse pixel the owner is looking at
 * (self-view layer L2, sent before Google's proxy fetch where possible), and mark the owner's own
 * tracked messages.
 */
export class MessageViews {
  private readonly lastReport = new Map<string, number>();
  private readonly marked = new Map<MessageView, { messageId: string; icon: Live<MessageAttachmentIconDescriptor> | null }>();

  constructor(
    private readonly env: GmailEnv,
    private readonly ask: Ask,
    private readonly now: () => number = () => Date.now(),
  ) {}

  handle(view: MessageView): void {
    const inspect = (): void => {
      if (view.isLoaded()) this.reportSelfView(view);
    };
    inspect();
    view.on('load', () => {
      inspect();
      void this.track(view);
    });
    view.on('viewStateChange', (event) => {
      if (event.newViewState === 'EXPANDED') inspect();
    });
    view.on('destroy', () => this.marked.delete(view));
    void this.track(view);
  }

  refresh(): void {
    for (const view of this.marked.keys()) void this.updateMark(view);
  }

  private reportSelfView(view: MessageView): void {
    const config = this.env.config;
    if (!config || !this.env.active) return;
    const now = this.now();
    const tokens = uniqueTokens(findPixels(view.getBodyElement(), config.publicBaseUrl)).filter(
      (token) => now - (this.lastReport.get(token) ?? 0) > REPORT_THROTTLE_MS,
    );
    if (tokens.length === 0) return;
    for (const token of tokens) this.lastReport.set(token, now);
    void this.ask({ type: 'mp:selfView', account: this.env.account, tokens, context: 'THREAD' });
  }

  private async track(view: MessageView): Promise<void> {
    if (this.marked.has(view) || !view.isLoaded() || !this.env.active) return;
    if (view.getSender().emailAddress.trim().toLowerCase() !== this.env.account) return;
    const messageId = await view.getMessageIDAsync().catch(() => null);
    if (!messageId || view.destroyed || this.marked.has(view)) return;
    this.marked.set(view, { messageId, icon: null });
    await this.updateMark(view);
  }

  private async updateMark(view: MessageView): Promise<void> {
    const entry = this.marked.get(view);
    if (!entry) return;
    const marks = await this.ask({ type: 'mp:marks', account: this.env.account, by: 'message', ids: [entry.messageId] });
    const mark = marks?.[entry.messageId];
    if (!mark || view.destroyed) return;
    const descriptor = describe(mark, this.now());
    if (entry.icon) {
      entry.icon.set(descriptor);
    } else {
      entry.icon = new Live(descriptor);
      view.addAttachmentIcon(entry.icon.stream);
    }
  }
}
