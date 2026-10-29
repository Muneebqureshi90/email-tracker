import type { ClientConfig } from '../core/api-types';
import type { Status } from '../core/messages';
import { normalizeAddress } from '../core/recipients';
import type { Ask } from './bridge';

/** What the Gmail tab knows: the signed-in account and the service worker's latest status. */
export class GmailEnv {
  readonly account: string;
  private status: Status | null = null;

  constructor(
    account: string,
    private readonly ask: Ask,
  ) {
    this.account = normalizeAddress(account);
  }

  async refresh(): Promise<void> {
    const status = await this.ask({ type: 'mp:status' });
    if (status) this.status = status;
  }

  get config(): ClientConfig | null {
    return this.status?.config ?? null;
  }

  get paused(): boolean {
    return this.status?.paused ?? false;
  }

  /** Tracking is possible: the extension is set up, not paused, and has the backend's config. */
  get active(): boolean {
    return this.status !== null && this.status.hasToken && !this.status.paused && this.status.config !== null;
  }
}
